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
    protocol::{AdapterSource, ContextKind, ContextObservation, PlatformId},
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
pub struct SuggestionOption {
    pub task: &'static str,
    pub label: &'static str,
    pub confidence: f32,
    pub reason: &'static str,
    pub local: bool,
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
    pub suggestions: Vec<SuggestionOption>,
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

pub fn suggestions_for(kind: ContextKind) -> Vec<SuggestionOption> {
    match kind {
        ContextKind::DraftText | ContextKind::SearchQuery => vec![
            SuggestionOption {
                task: "CHECK_WRITING",
                label: "Check writing",
                confidence: 0.98,
                reason: "Paused in a writing field",
                local: true,
            },
            SuggestionOption {
                task: "IMPROVE_WRITING",
                label: "Improve writing",
                confidence: 0.92,
                reason: "Draft is ready for review",
                local: false,
            },
        ],
        ContextKind::SocialPost | ContextKind::Conversation => vec![
            SuggestionOption {
                task: "DRAFT_REPLY",
                label: "Draft replies",
                confidence: 0.91,
                reason: "Conversation text selected",
                local: false,
            },
            SuggestionOption {
                task: "SUMMARIZE",
                label: "Summarize",
                confidence: 0.8,
                reason: "Reading context selected",
                local: false,
            },
            SuggestionOption {
                task: "EXPLAIN_TEXT",
                label: "Explain",
                confidence: 0.75,
                reason: "Reading context selected",
                local: false,
            },
        ],
        ContextKind::ArticleText | ContextKind::SelectedText => vec![
            SuggestionOption {
                task: "EXPLAIN_TEXT",
                label: "Explain",
                confidence: 0.86,
                reason: "Text selection stabilized",
                local: false,
            },
            SuggestionOption {
                task: "SUMMARIZE",
                label: "Summarize",
                confidence: 0.81,
                reason: "Reading context selected",
                local: false,
            },
        ],
        ContextKind::SelectedCode => vec![
            SuggestionOption {
                task: "EXPLAIN_CODE",
                label: "Explain code",
                confidence: 0.96,
                reason: "Code selection stabilized",
                local: false,
            },
            SuggestionOption {
                task: "REVIEW_CODE",
                label: "Review code",
                confidence: 0.88,
                reason: "Code selection stabilized",
                local: false,
            },
        ],
    }
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

        let mut state = self.state.write().map_err(|_| "CORE_STATE_UNAVAILABLE")?;
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
        let suggestions = state
            .current_context
            .as_ref()
            .map_or_else(Vec::new, |context| {
                suggestions_for(context.observation.kind)
            });
        RuntimeSnapshot {
            pairing_code: state.pairing_code.clone(),
            permissions: state.permissions.clone(),
            connected_adapters,
            current_context: state.current_context.clone(),
            suggestion: suggestions.first().map(|item| item.label.to_owned()),
            suggestions,
            provider_configured: self.provider_configured,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{ContextKind, suggestions_for};

    #[test]
    fn writing_has_local_first_suggestion() {
        let suggestions = suggestions_for(ContextKind::DraftText);
        assert_eq!(suggestions[0].task, "CHECK_WRITING");
        assert!(suggestions[0].local);
    }

    #[test]
    fn conversation_offers_bounded_choices() {
        let suggestions = suggestions_for(ContextKind::Conversation);
        assert_eq!(suggestions.len(), 3);
        assert_eq!(suggestions[0].task, "DRAFT_REPLY");
    }
}
