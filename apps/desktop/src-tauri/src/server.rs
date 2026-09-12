use serde::Deserialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};
use tokio::{
    io::{AsyncBufReadExt, AsyncWrite, AsyncWriteExt, BufReader},
    net::windows::named_pipe::{NamedPipeServer, ServerOptions},
    sync::broadcast,
};

use crate::{
    core::{PopCore, RuntimeSnapshot},
    native_auth::PIPE_NAME,
    protocol::{
        AdapterSource, EnvelopePayload, MAX_MESSAGE_BYTES, ProtocolEnvelope, ServerMessage,
    },
};

#[derive(Clone)]
pub struct NativeBridge {
    sender: broadcast::Sender<ServerMessage>,
}

impl NativeBridge {
    pub fn new() -> Self {
        let (sender, _) = broadcast::channel(16);
        Self { sender }
    }

    pub fn publish_control(&self, snapshot: &RuntimeSnapshot) {
        let _ = self.sender.send(control_message(snapshot));
    }
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "SCREAMING_SNAKE_CASE")]
enum HostMessage {
    HostRegister { secret: String },
}

fn same_secret(left: &str, right: &str) -> bool {
    let left = Sha256::digest(left.as_bytes());
    let right = Sha256::digest(right.as_bytes());
    left.as_slice() == right.as_slice()
}

fn control_message(snapshot: &RuntimeSnapshot) -> ServerMessage {
    ServerMessage::Control {
        monitoring_enabled: snapshot.permissions.monitoring_enabled,
        x_enabled: snapshot
            .permissions
            .platforms
            .get(&crate::protocol::PlatformId::X)
            .copied()
            .unwrap_or(false),
    }
}

async fn send_message<W: AsyncWrite + Unpin>(
    writer: &mut W,
    message: &ServerMessage,
) -> Result<(), String> {
    let mut json = serde_json::to_vec(message).map_err(|error| error.to_string())?;
    json.push(b'\n');
    writer
        .write_all(&json)
        .await
        .map_err(|error| error.to_string())
}

async fn process_envelope(
    envelope: ProtocolEnvelope,
    writer: &mut (impl AsyncWrite + Unpin),
    core: &PopCore,
    app: &AppHandle,
) -> Result<(), String> {
    let message_id = envelope.id.clone();
    if envelope.source != AdapterSource::Chrome {
        return send_message(
            writer,
            &ServerMessage::Error {
                code: "SOURCE_DENIED".to_owned(),
                message: "This bridge accepts the X adapter only.".to_owned(),
            },
        )
        .await;
    }
    match envelope.message {
        EnvelopePayload::Context(observation) => {
            match core.accept_context(AdapterSource::Chrome, observation) {
                Ok(()) => {
                    send_message(writer, &ServerMessage::Ack { message_id }).await?;
                    let _ = app.emit("pop://runtime-updated", core.snapshot());
                    if let Some(window) = app.get_webview_window("avatar") {
                        let _ = window.show();
                    }
                }
                Err(code) => {
                    send_message(
                        writer,
                        &ServerMessage::Error {
                            code: code.to_owned(),
                            message: "Context was blocked by POP Core.".to_owned(),
                        },
                    )
                    .await?
                }
            }
        }
        EnvelopePayload::UiCommand(payload) => {
            let crate::protocol::UiCommand::Show = payload.command;
            if let Some(window) = app.get_webview_window("avatar") {
                let _ = window.show();
                let _ = window.set_focus();
            }
            send_message(writer, &ServerMessage::Ack { message_id }).await?;
        }
        EnvelopePayload::Heartbeat(_) => {
            send_message(writer, &control_message(&core.snapshot())).await?;
        }
    }
    Ok(())
}

async fn handle_connection(
    pipe: NamedPipeServer,
    core: PopCore,
    app: AppHandle,
    expected_secret: String,
    bridge: NativeBridge,
) -> Result<(), String> {
    let (reader, mut writer) = tokio::io::split(pipe);
    let mut lines = BufReader::new(reader).lines();
    let first = lines
        .next_line()
        .await
        .map_err(|error| error.to_string())?
        .ok_or("HOST_DISCONNECTED")?;
    if first.len() > 1024 {
        return Err("HOST_REGISTER_TOO_LARGE".to_owned());
    }
    let register: HostMessage =
        serde_json::from_str(&first).map_err(|_| "HOST_REGISTER_INVALID".to_owned())?;
    let HostMessage::HostRegister { secret } = register;
    if !same_secret(&secret, &expected_secret) {
        return Err("HOST_AUTHENTICATION_FAILED".to_owned());
    }

    core.mark_connected(AdapterSource::Chrome)
        .map_err(str::to_owned)?;
    let _ = app.emit("pop://runtime-updated", core.snapshot());
    send_message(&mut writer, &control_message(&core.snapshot())).await?;
    let mut control = bridge.sender.subscribe();

    loop {
        tokio::select! {
            line = lines.next_line() => {
                let Some(text) = line.map_err(|error| error.to_string())? else { break; };
                if text.len() > MAX_MESSAGE_BYTES {
                    send_message(&mut writer, &ServerMessage::Error { code: "MESSAGE_TOO_LARGE".to_owned(), message: "Adapter message exceeded the local limit.".to_owned() }).await?;
                    continue;
                }
                let envelope: ProtocolEnvelope = match serde_json::from_str(&text) {
                    Ok(value) => value,
                    Err(_) => {
                        send_message(&mut writer, &ServerMessage::Error { code: "INVALID_MESSAGE".to_owned(), message: "Adapter message was invalid.".to_owned() }).await?;
                        continue;
                    }
                };
                if let Err(code) = envelope.validate() {
                    send_message(&mut writer, &ServerMessage::Error { code: code.to_owned(), message: "Adapter message validation failed.".to_owned() }).await?;
                    continue;
                }
                process_envelope(envelope, &mut writer, &core, &app).await?;
            }
            message = control.recv() => {
                if let Ok(message) = message { send_message(&mut writer, &message).await?; }
            }
        }
    }
    core.mark_disconnected(AdapterSource::Chrome);
    let _ = app.emit("pop://runtime-updated", core.snapshot());
    Ok(())
}

pub async fn run(
    core: PopCore,
    app: AppHandle,
    secret: String,
    bridge: NativeBridge,
) -> Result<(), String> {
    let mut first = true;
    loop {
        let pipe = ServerOptions::new()
            .first_pipe_instance(first)
            .create(PIPE_NAME)
            .map_err(|error| error.to_string())?;
        first = false;
        pipe.connect().await.map_err(|error| error.to_string())?;
        let connection_core = core.clone();
        let connection_app = app.clone();
        let connection_secret = secret.clone();
        let connection_bridge = bridge.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(error) = handle_connection(
                pipe,
                connection_core,
                connection_app,
                connection_secret,
                connection_bridge,
            )
            .await
            {
                eprintln!("POP native bridge connection ended: {error}");
            }
        });
    }
}
