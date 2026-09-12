use serde::{Deserialize, Serialize};

pub const PROTOCOL_VERSION: u8 = 2;
pub const MAX_MESSAGE_BYTES: usize = 64 * 1024;
pub const MAX_CONTEXT_CHARS: usize = 12_000;

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AdapterSource {
    Chrome,
    Vscode,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PlatformId {
    X,
    Google,
    Youtube,
    Whatsapp,
    Chatgpt,
    Claude,
    Vscode,
    Cursor,
}

impl PlatformId {
    pub const ALL: [Self; 8] = [
        Self::X,
        Self::Google,
        Self::Youtube,
        Self::Whatsapp,
        Self::Chatgpt,
        Self::Claude,
        Self::Vscode,
        Self::Cursor,
    ];

    pub fn setting_key(self) -> &'static str {
        match self {
            Self::X => "platform_x",
            Self::Google => "platform_google",
            Self::Youtube => "platform_youtube",
            Self::Whatsapp => "platform_whatsapp",
            Self::Chatgpt => "platform_chatgpt",
            Self::Claude => "platform_claude",
            Self::Vscode => "platform_vscode",
            Self::Cursor => "platform_cursor",
        }
    }

    pub fn expected_domain(self) -> Option<&'static str> {
        match self {
            Self::X => Some("x.com"),
            Self::Google => Some("www.google.com"),
            Self::Youtube => Some("www.youtube.com"),
            Self::Whatsapp => Some("web.whatsapp.com"),
            Self::Chatgpt => Some("chatgpt.com"),
            Self::Claude => Some("claude.ai"),
            Self::Vscode | Self::Cursor => None,
        }
    }
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ContextKind {
    DraftText,
    SocialPost,
    SearchQuery,
    Conversation,
    ArticleText,
    SelectedText,
    SelectedCode,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextObservation {
    pub kind: ContextKind,
    pub platform_id: PlatformId,
    pub text: String,
    pub application_id: String,
    pub domain: Option<String>,
    pub title: Option<String>,
    pub language_id: Option<String>,
    pub document_uri: Option<String>,
    pub observed_at: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterPayload {
    pub pairing_code: Option<String>,
    pub session_token: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformPermissionPayload {
    pub platform_id: PlatformId,
    pub enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum UiCommand {
    Show,
}

#[derive(Debug, Deserialize)]
pub struct UiCommandPayload {
    pub command: UiCommand,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", content = "payload", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum EnvelopePayload {
    Register(RegisterPayload),
    Context(ContextObservation),
    PlatformPermission(PlatformPermissionPayload),
    UiCommand(UiCommandPayload),
    #[allow(dead_code)]
    Heartbeat(serde_json::Value),
}

#[derive(Debug, Deserialize)]
pub struct ProtocolEnvelope {
    pub version: u8,
    pub id: String,
    pub source: AdapterSource,
    pub timestamp: u64,
    #[serde(flatten)]
    pub message: EnvelopePayload,
}

impl ProtocolEnvelope {
    pub fn validate(&self) -> Result<(), &'static str> {
        if self.version != PROTOCOL_VERSION {
            return Err("UNSUPPORTED_PROTOCOL_VERSION");
        }
        if uuid::Uuid::parse_str(&self.id).is_err() {
            return Err("INVALID_MESSAGE_ID");
        }
        if self.timestamp == 0 {
            return Err("INVALID_TIMESTAMP");
        }
        if let EnvelopePayload::Context(context) = &self.message {
            let count = context.text.chars().count();
            if count == 0 || count > MAX_CONTEXT_CHARS {
                return Err("INVALID_CONTEXT_SIZE");
            }
        }
        if let EnvelopePayload::PlatformPermission(permission) = &self.message
            && matches!(
                permission.platform_id,
                PlatformId::Vscode | PlatformId::Cursor
            )
        {
            return Err("INVALID_PLATFORM_PERMISSION_SOURCE");
        }
        Ok(())
    }
}

#[derive(Debug, Serialize)]
#[serde(
    tag = "type",
    rename_all = "SCREAMING_SNAKE_CASE",
    rename_all_fields = "camelCase"
)]
pub enum ServerMessage {
    Registered { session_token: String },
    Ack { message_id: String },
    Error { code: String, message: String },
}

#[cfg(test)]
mod tests {
    use super::{EnvelopePayload, ProtocolEnvelope, ServerMessage};

    #[test]
    fn deserializes_chrome_registration_envelope() {
        let envelope: ProtocolEnvelope = serde_json::from_value(serde_json::json!({
            "version": 2,
            "id": "d9428888-122b-11e1-b85c-61cd3cbb3210",
            "source": "CHROME",
            "type": "REGISTER",
            "timestamp": 1_725_000_000_000_u64,
            "payload": { "pairingCode": "269261" }
        }))
        .expect("Chrome registration should deserialize");

        assert!(matches!(envelope.message, EnvelopePayload::Register(_)));
        assert!(envelope.validate().is_ok());
    }

    #[test]
    fn serializes_server_fields_as_camel_case() {
        let registered = serde_json::to_value(ServerMessage::Registered {
            session_token: "session".to_owned(),
        })
        .expect("registered response serializes");
        assert_eq!(registered["sessionToken"], "session");
        assert!(registered.get("session_token").is_none());

        let ack = serde_json::to_value(ServerMessage::Ack {
            message_id: "message".to_owned(),
        })
        .expect("ack response serializes");
        assert_eq!(ack["messageId"], "message");
    }
}
