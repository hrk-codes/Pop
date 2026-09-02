use serde::{Deserialize, Serialize};

pub const PROTOCOL_VERSION: u8 = 1;
pub const MAX_MESSAGE_BYTES: usize = 64 * 1024;
pub const MAX_CONTEXT_CHARS: usize = 12_000;

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AdapterSource {
    Chrome,
    Vscode,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ContextKind {
    SelectedText,
    SelectedCode,
    XPost,
    XDraft,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextObservation {
    pub kind: ContextKind,
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
#[serde(tag = "type", content = "payload", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum EnvelopePayload {
    Register(RegisterPayload),
    Context(ContextObservation),
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
    use super::ServerMessage;

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
