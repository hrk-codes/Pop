use std::{
    collections::HashMap,
    sync::{Arc, Mutex, RwLock},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::Serialize;
use tokio_util::sync::CancellationToken;

use crate::{
    foreground::{foreground_application_id, privacy_guard_reason},
    protocol::{AdapterSource, ContextKind, ContextObservation, PlatformId},
    security::contains_likely_secret,
    storage::Store,
};

const CONTEXT_TTL_MS: u64 = 90_000;

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_millis() as u64)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionSettings {
    pub monitoring_enabled: bool,
    pub platforms: HashMap<PlatformId, bool>,
}

impl PermissionSettings {
    pub fn denied() -> Self {
        Self {
            monitoring_enabled: false,
            platforms: PlatformId::ALL
                .into_iter()
                .map(|platform| (platform, false))
                .collect(),
        }
    }

    pub fn allows(&self, platform: PlatformId) -> bool {
        self.platforms.get(&platform).copied().unwrap_or(false)
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveContext {
    pub source: AdapterSource,
    pub observation: ContextObservation,
    pub accepted_at: u64,
    pub expires_at: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSnapshot {
    pub permissions: PermissionSettings,
    pub connected_adapters: Vec<AdapterSource>,
    pub current_context: Option<ActiveContext>,
    pub provider_configured: bool,
    pub suspended: bool,
    pub privacy_paused: bool,
    pub privacy_reason: Option<String>,
    pub last_context_error: Option<String>,
}

struct RuntimeState {
    permissions: PermissionSettings,
    connected_adapters: HashMap<AdapterSource, usize>,
    current_context: Option<ActiveContext>,
    suspended: bool,
    privacy_paused: bool,
    privacy_reason: Option<String>,
    last_context_error: Option<String>,
}

#[derive(Clone)]
pub struct PopCore {
    state: Arc<RwLock<RuntimeState>>,
    store: Arc<Mutex<Store>>,
    provider_configured: bool,
    generation: Arc<Mutex<Option<CancellationToken>>>,
}

fn expected_application(platform: PlatformId) -> &'static str {
    match platform {
        PlatformId::Vscode => "vscode",
        PlatformId::Cursor => "cursor",
        _ => "chrome",
    }
}

fn valid_source_platform(source: AdapterSource, platform: PlatformId) -> bool {
    match source {
        AdapterSource::Chrome => !matches!(platform, PlatformId::Vscode | PlatformId::Cursor),
        AdapterSource::Vscode => matches!(platform, PlatformId::Vscode | PlatformId::Cursor),
    }
}

impl PopCore {
    pub fn new(store: Store, permissions: PermissionSettings, provider_configured: bool) -> Self {
        Self {
            state: Arc::new(RwLock::new(RuntimeState {
                permissions,
                connected_adapters: HashMap::new(),
                current_context: None,
                suspended: false,
                privacy_paused: false,
                privacy_reason: None,
                last_context_error: None,
            })),
            store: Arc::new(Mutex::new(store)),
            provider_configured,
            generation: Arc::new(Mutex::new(None)),
        }
    }

    pub fn store(&self) -> Arc<Mutex<Store>> {
        Arc::clone(&self.store)
    }

    pub fn begin_generation(&self) -> CancellationToken {
        let token = CancellationToken::new();
        if let Ok(mut active) = self.generation.lock() {
            if let Some(previous) = active.replace(token.clone()) {
                previous.cancel();
            }
        }
        token
    }

    fn cancel_generation(&self) {
        if let Ok(mut active) = self.generation.lock()
            && let Some(token) = active.take()
        {
            token.cancel();
        }
    }

    pub fn mark_connected(&self, source: AdapterSource) -> Result<(), &'static str> {
        let mut state = self.state.write().map_err(|_| "CORE_STATE_UNAVAILABLE")?;
        *state.connected_adapters.entry(source).or_default() += 1;
        Ok(())
    }

    pub fn mark_disconnected(&self, source: AdapterSource) {
        if let Ok(mut state) = self.state.write() {
            if let Some(count) = state.connected_adapters.get_mut(&source) {
                *count = count.saturating_sub(1);
                if *count == 0 {
                    state.connected_adapters.remove(&source);
                }
            }
        }
    }

    pub fn accept_context(
        &self,
        source: AdapterSource,
        observation: ContextObservation,
    ) -> Result<(), &'static str> {
        let result = self.accept_context_inner(source, observation);
        if let Ok(mut state) = self.state.write() {
            state.last_context_error = result.as_ref().err().map(|code| (*code).to_owned());
        }
        result
    }

    fn accept_context_inner(
        &self,
        source: AdapterSource,
        observation: ContextObservation,
    ) -> Result<(), &'static str> {
        if privacy_guard_reason().is_some() {
            let _ = self.set_privacy_guard(true, Some("PRIVATE_SURFACE".to_owned()));
            return Err("PRIVACY_GUARD_ACTIVE");
        }
        if contains_likely_secret(&observation.text) {
            return Err("SENSITIVE_CONTEXT_BLOCKED");
        }
        if !valid_source_platform(source, observation.platform_id) {
            return Err("SOURCE_PLATFORM_MISMATCH");
        }
        let expected_app = expected_application(observation.platform_id);
        if observation.application_id != expected_app {
            return Err("SOURCE_APPLICATION_MISMATCH");
        }
        let foreground = foreground_application_id().ok_or("FOREGROUND_APP_UNKNOWN")?;
        let expected_foreground = match observation.platform_id {
            PlatformId::Vscode => "code",
            PlatformId::Cursor => "cursor",
            _ => "chrome",
        };
        if foreground != expected_foreground {
            return Err("SOURCE_NOT_FOREGROUND");
        }

        self.cancel_generation();
        let mut state = self.state.write().map_err(|_| "CORE_STATE_UNAVAILABLE")?;
        if state.suspended {
            return Err("POP_SUSPENDED");
        }
        if state.privacy_paused {
            return Err("PRIVACY_GUARD_ACTIVE");
        }
        if !state.permissions.monitoring_enabled {
            return Err("MONITORING_DISABLED");
        }
        if !state.permissions.allows(observation.platform_id) {
            return Err("PLATFORM_DENIED");
        }
        if let Some(expected_domain) = observation.platform_id.expected_domain()
            && observation.domain.as_deref() != Some(expected_domain)
        {
            return Err("DOMAIN_MISMATCH");
        }
        if source == AdapterSource::Chrome && observation.kind == ContextKind::SelectedCode {
            return Err("CONTEXT_KIND_DENIED");
        }
        if source == AdapterSource::Vscode && observation.kind != ContextKind::SelectedCode {
            return Err("CONTEXT_KIND_DENIED");
        }

        let accepted_at = now_ms();
        state.current_context = Some(ActiveContext {
            source,
            observation,
            accepted_at,
            expires_at: accepted_at + CONTEXT_TTL_MS,
        });
        Ok(())
    }

    pub fn set_suspended(&self, value: bool) -> Result<(), String> {
        let mut state = self
            .state
            .write()
            .map_err(|_| "CORE_STATE_UNAVAILABLE".to_owned())?;
        state.suspended = value;
        if value {
            state.current_context = None;
            state.last_context_error = None;
            self.cancel_generation();
        }
        Ok(())
    }

    pub fn set_privacy_guard(&self, active: bool, reason: Option<String>) -> Result<bool, String> {
        let mut state = self
            .state
            .write()
            .map_err(|_| "CORE_STATE_UNAVAILABLE".to_owned())?;
        let normalized_reason =
            active.then(|| reason.unwrap_or_else(|| "PRIVATE_SURFACE".to_owned()));
        let changed = state.privacy_paused != active || state.privacy_reason != normalized_reason;
        state.privacy_paused = active;
        state.privacy_reason = normalized_reason;
        if active {
            state.current_context = None;
            state.last_context_error = None;
            self.cancel_generation();
        }
        Ok(changed)
    }

    pub fn fresh_context(&self) -> Result<ActiveContext, &'static str> {
        let mut state = self.state.write().map_err(|_| "CORE_STATE_UNAVAILABLE")?;
        if state.privacy_paused {
            return Err("PRIVACY_GUARD_ACTIVE");
        }
        let Some(context) = state.current_context.clone() else {
            return Err("NO_CONTEXT");
        };
        if context.expires_at <= now_ms() {
            state.current_context = None;
            return Err("CONTEXT_EXPIRED");
        }
        Ok(context)
    }

    pub fn set_monitoring(&self, value: bool) -> Result<(), String> {
        self.store
            .lock()
            .map_err(|_| "STORE_UNAVAILABLE".to_owned())?
            .set_bool("monitoring_enabled", value, now_ms())?;
        let mut state = self
            .state
            .write()
            .map_err(|_| "CORE_STATE_UNAVAILABLE".to_owned())?;
        state.permissions.monitoring_enabled = value;
        if !value {
            state.current_context = None;
            state.privacy_paused = false;
            state.privacy_reason = None;
            self.cancel_generation();
        }
        Ok(())
    }

    pub fn set_platform_permission(&self, platform: PlatformId, value: bool) -> Result<(), String> {
        self.store
            .lock()
            .map_err(|_| "STORE_UNAVAILABLE".to_owned())?
            .set_bool(platform.setting_key(), value, now_ms())?;
        let mut state = self
            .state
            .write()
            .map_err(|_| "CORE_STATE_UNAVAILABLE".to_owned())?;
        state.permissions.platforms.insert(platform, value);
        if !value
            && state
                .current_context
                .as_ref()
                .is_some_and(|context| context.observation.platform_id == platform)
        {
            state.current_context = None;
            self.cancel_generation();
        }
        Ok(())
    }

    pub fn snapshot(&self) -> RuntimeSnapshot {
        let mut state = self.state.write().expect("POP Core lock poisoned");
        if state
            .current_context
            .as_ref()
            .is_some_and(|context| context.expires_at <= now_ms())
        {
            state.current_context = None;
        }
        let mut connected_adapters: Vec<_> = state.connected_adapters.keys().copied().collect();
        connected_adapters.sort_by_key(|source| match source {
            AdapterSource::Chrome => 0,
            AdapterSource::Vscode => 1,
        });
        RuntimeSnapshot {
            permissions: state.permissions.clone(),
            connected_adapters,
            current_context: state.current_context.clone(),
            provider_configured: self.provider_configured,
            suspended: state.suspended,
            privacy_paused: state.privacy_paused,
            privacy_reason: state.privacy_reason.clone(),
            last_context_error: state.last_context_error.clone(),
        }
    }
}
