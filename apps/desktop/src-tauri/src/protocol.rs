use serde::{Deserialize, Serialize};

pub const PROTOCOL_VERSION: u8 = 3;
pub const MAX_MESSAGE_BYTES: usize = 64 * 1024;
pub const MAX_CONTEXT_CHARS: usize = 8_000;

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
    Context(ContextObservation),
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
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(
    tag = "type",
    rename_all = "SCREAMING_SNAKE_CASE",
    rename_all_fields = "camelCase"
)]
pub enum ServerMessage {
    Control {
        monitoring_enabled: bool,
        x_enabled: bool,
    },
    Ack {
        message_id: String,
    },
    Error {
        code: String,
        message: String,
    },
}

#[cfg(test)]
mod tests {
    use super::{EnvelopePayload, ProtocolEnvelope, ServerMessage};

    #[test]
    fn deserializes_chrome_context_envelope() {
        let envelope: ProtocolEnvelope = serde_json::from_value(serde_json::json!({
            "version": 3,
            "id": "d9428888-122b-11e1-b85c-61cd3cbb3210",
            "source": "CHROME",
            "type": "CONTEXT",
            "timestamp": 1_725_000_000_000_u64,
            "payload": {
                "kind": "SOCIAL_POST",
                "platformId": "X",
                "text": "A selected post",
                "applicationId": "chrome",
                "domain": "x.com",
                "observedAt": 1_725_000_000_000_u64
            }
        }))
        .expect("Chrome context should deserialize");

        assert!(matches!(envelope.message, EnvelopePayload::Context(_)));
        assert!(envelope.validate().is_ok());
    }

    #[test]
    fn serializes_server_fields_as_camel_case() {
        let control = serde_json::to_value(ServerMessage::Control {
            monitoring_enabled: true,
            x_enabled: true,
        })
        .expect("control response serializes");
        assert_eq!(control["monitoringEnabled"], true);
        assert!(control.get("monitoring_enabled").is_none());

        let ack = serde_json::to_value(ServerMessage::Ack {
            message_id: "message".to_owned(),
        })
        .expect("ack response serializes");
        assert_eq!(ack["messageId"], "message");
    }
}
