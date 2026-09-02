use std::{
    collections::{HashMap, HashSet},
    sync::{Arc, Mutex, RwLock},
    time::{SystemTime, UNIX_EPOCH},
};

use rand::Rng;
use serde::Serialize;
use uuid::Uuid;

use crate::{
    foreground::foreground_application_id,
    protocol::{AdapterSource, ContextKind, ContextObservation},
    security::contains_likely_secret,
    storage::Store,
};

const CONTEXT_TTL_MS: u64 = 120_000;

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_millis() as u64)
}

fn new_pairing_code() -> String {
    format!("{:06}", rand::rng().random_range(0..1_000_000_u32))
}

fn new_session_token() -> String {
    format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionSettings {
    pub monitoring_enabled: bool,
    pub x_allowed: bool,
    pub vscode_allowed: bool,
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
    pub pairing_code: String,
    pub permissions: PermissionSettings,
    pub connected_adapters: Vec<AdapterSource>,
    pub current_context: Option<ActiveContext>,
    pub suggestion: Option<String>,
    pub provider_configured: bool,
}

struct RuntimeState {
    pairing_code: String,
    permissions: PermissionSettings,
    sessions: HashMap<String, AdapterSource>,
    connected_adapters: HashSet<AdapterSource>,
    current_context: Option<ActiveContext>,
}

#[derive(Clone)]
pub struct PopCore {
    state: Arc<RwLock<RuntimeState>>,
    store: Arc<Mutex<Store>>,
    provider_configured: bool,
}

impl PopCore {
    pub fn new(store: Store, permissions: PermissionSettings, provider_configured: bool) -> Self {
        Self {
            state: Arc::new(RwLock::new(RuntimeState {
                pairing_code: new_pairing_code(),
                permissions,
                sessions: HashMap::new(),
                connected_adapters: HashSet::new(),
                current_context: None,
            })),
            store: Arc::new(Mutex::new(store)),
            provider_configured,
        }
    }

    pub fn store(&self) -> Arc<Mutex<Store>> {
        Arc::clone(&self.store)
    }

    pub fn register(
        &self,
        source: AdapterSource,
        pairing_code: Option<&str>,
        session_token: Option<&str>,
    ) -> Result<String, &'static str> {
        let mut state = self.state.write().map_err(|_| "CORE_STATE_UNAVAILABLE")?;
        if let Some(token) = session_token {
            if state.sessions.get(token) == Some(&source) {
                state.connected_adapters.insert(source);
                return Ok(token.to_owned());
            }
            return Err("INVALID_SESSION_TOKEN");
        }

        if pairing_code != Some(state.pairing_code.as_str()) {
            return Err("INVALID_PAIRING_CODE");
        }

        let token = new_session_token();
        state.sessions.insert(token.clone(), source);
        state.connected_adapters.insert(source);
        state.pairing_code = new_pairing_code();
        Ok(token)
    }

    pub fn mark_disconnected(&self, source: AdapterSource) {
        if let Ok(mut state) = self.state.write() {
            state.connected_adapters.remove(&source);
        }
    }

    pub fn accept_context(
        &self,
        source: AdapterSource,
        observation: ContextObservation,
    ) -> Result<(), &'static str> {
        if contains_likely_secret(&observation.text) {
            return Err("SENSITIVE_CONTEXT_BLOCKED");
        }

        let foreground = foreground_application_id().ok_or("FOREGROUND_APP_UNKNOWN")?;
        let expected_foreground = match source {
            AdapterSource::Chrome => "chrome",
            AdapterSource::Vscode => "code",
        };
        if foreground != expected_foreground {
            return Err("SOURCE_NOT_FOREGROUND");
        }

        let mut state = self.state.write().map_err(|_| "CORE_STATE_UNAVAILABLE")?;
        if !state.permissions.monitoring_enabled {
            return Err("MONITORING_DISABLED");
        }
        match source {
            AdapterSource::Chrome => {
                if !state.permissions.x_allowed {
                    return Err("APPLICATION_OR_DOMAIN_DENIED");
                }
                if observation.application_id != "chrome"
                    || observation.domain.as_deref() != Some("x.com")
                    || !matches!(
                        observation.kind,
                        ContextKind::SelectedText | ContextKind::XPost | ContextKind::XDraft
                    )
                {
                    return Err("SOURCE_CONTEXT_MISMATCH");
                }
            }
            AdapterSource::Vscode => {
                if !state.permissions.vscode_allowed {
                    return Err("APPLICATION_DENIED");
                }
                if observation.application_id != "vscode"
                    || observation.kind != ContextKind::SelectedCode
                {
                    return Err("SOURCE_CONTEXT_MISMATCH");
                }
            }
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

    pub fn fresh_context(&self) -> Result<ActiveContext, &'static str> {
        let mut state = self.state.write().map_err(|_| "CORE_STATE_UNAVAILABLE")?;
        let Some(context) = state.current_context.clone() else {
            return Err("NO_CONTEXT");
        };
        if context.expires_at <= now_ms() {
            state.current_context = None;
            return Err("CONTEXT_EXPIRED");
        }
        Ok(context)
    }

    pub fn set_permission(&self, key: &str, value: bool) -> Result<(), String> {
        {
            let store = self
                .store
                .lock()
                .map_err(|_| "STORE_UNAVAILABLE".to_owned())?;
            store.set_bool(key, value, now_ms())?;
        }
        let mut state = self
            .state
            .write()
            .map_err(|_| "CORE_STATE_UNAVAILABLE".to_owned())?;
        match key {
            "monitoring_enabled" => {
                state.permissions.monitoring_enabled = value;
                if !value {
                    state.current_context = None;
                }
            }
            "x_allowed" => {
                state.permissions.x_allowed = value;
                if !value
                    && state
                        .current_context
                        .as_ref()
                        .is_some_and(|context| context.source == AdapterSource::Chrome)
                {
                    state.current_context = None;
                }
            }
            "vscode_allowed" => {
                state.permissions.vscode_allowed = value;
                if !value
                    && state
                        .current_context
                        .as_ref()
                        .is_some_and(|context| context.source == AdapterSource::Vscode)
                {
                    state.current_context = None;
                }
            }
            _ => return Err("UNKNOWN_SETTING".to_owned()),
        }
        Ok(())
    }

    pub fn regenerate_pairing_code(&self) -> Result<String, String> {
        let mut state = self
            .state
            .write()
            .map_err(|_| "CORE_STATE_UNAVAILABLE".to_owned())?;
        state.pairing_code = new_pairing_code();
        Ok(state.pairing_code.clone())
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
        let mut connected_adapters: Vec<_> = state.connected_adapters.iter().copied().collect();
        connected_adapters.sort_by_key(|source| match source {
            AdapterSource::Chrome => 0,
            AdapterSource::Vscode => 1,
        });
        let suggestion =
            state
                .current_context
                .as_ref()
                .map(|context| match context.observation.kind {
                    ContextKind::XDraft => "Improve writing".to_owned(),
                    ContextKind::XPost => "Draft replies".to_owned(),
                    ContextKind::SelectedCode => "Explain code".to_owned(),
                    ContextKind::SelectedText => "Explain text".to_owned(),
                });
        RuntimeSnapshot {
            pairing_code: state.pairing_code.clone(),
            permissions: state.permissions.clone(),
            connected_adapters,
            current_context: state.current_context.clone(),
            suggestion,
            provider_configured: self.provider_configured,
        }
    }
}
