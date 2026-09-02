use futures_util::{SinkExt, StreamExt};
use tauri::{AppHandle, Emitter};
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::{WebSocketStream, accept_async, tungstenite::Message};

use crate::{
    core::PopCore,
    protocol::{
        AdapterSource, EnvelopePayload, MAX_MESSAGE_BYTES, ProtocolEnvelope, ServerMessage,
    },
};

const SERVER_ADDRESS: &str = "127.0.0.1:17831";

async fn send_message(
    socket: &mut WebSocketStream<TcpStream>,
    message: &ServerMessage,
) -> Result<(), String> {
    let json = serde_json::to_string(message).map_err(|error| error.to_string())?;
    socket
        .send(Message::Text(json.into()))
        .await
        .map_err(|error| error.to_string())
}

async fn handle_connection(stream: TcpStream, core: PopCore, app: AppHandle) -> Result<(), String> {
    let mut socket = accept_async(stream)
        .await
        .map_err(|error| error.to_string())?;
    let mut registered_source: Option<AdapterSource> = None;
    let mut messages_in_window = 0_u32;
    let mut window_started = std::time::Instant::now();

    while let Some(message) = socket.next().await {
        let message = message.map_err(|error| error.to_string())?;
        if !message.is_text() {
            continue;
        }
        if window_started.elapsed() > std::time::Duration::from_secs(60) {
            window_started = std::time::Instant::now();
            messages_in_window = 0;
        }
        messages_in_window += 1;
        if messages_in_window > 120 {
            send_message(
                &mut socket,
                &ServerMessage::Error {
                    code: "RATE_LIMITED".to_owned(),
                    message: "Too many adapter messages.".to_owned(),
                },
            )
            .await?;
            continue;
        }

        let text = message.into_text().map_err(|error| error.to_string())?;
        if text.len() > MAX_MESSAGE_BYTES {
            send_message(
                &mut socket,
                &ServerMessage::Error {
                    code: "MESSAGE_TOO_LARGE".to_owned(),
                    message: "Adapter message exceeded the local limit.".to_owned(),
                },
            )
            .await?;
            continue;
        }
        let envelope: ProtocolEnvelope = match serde_json::from_str(&text) {
            Ok(envelope) => envelope,
            Err(_) => {
                send_message(
                    &mut socket,
                    &ServerMessage::Error {
                        code: "INVALID_MESSAGE".to_owned(),
                        message: "Adapter message was not valid protocol JSON.".to_owned(),
                    },
                )
                .await?;
                continue;
            }
        };
        if let Err(code) = envelope.validate() {
            send_message(
                &mut socket,
                &ServerMessage::Error {
                    code: code.to_owned(),
                    message: "Adapter message validation failed.".to_owned(),
                },
            )
            .await?;
            continue;
        }

        let source = envelope.source;
        let message_id = envelope.id.clone();
        match envelope.message {
            EnvelopePayload::Register(payload) => match core.register(
                source,
                payload.pairing_code.as_deref(),
                payload.session_token.as_deref(),
            ) {
                Ok(session_token) => {
                    registered_source = Some(source);
                    send_message(&mut socket, &ServerMessage::Registered { session_token }).await?;
                    let _ = app.emit("pop://runtime-updated", core.snapshot());
                }
                Err(code) => {
                    send_message(
                        &mut socket,
                        &ServerMessage::Error {
                            code: code.to_owned(),
                            message: "Adapter registration was rejected.".to_owned(),
                        },
                    )
                    .await?;
                }
            },
            EnvelopePayload::Context(observation) => {
                if registered_source != Some(source) {
                    send_message(
                        &mut socket,
                        &ServerMessage::Error {
                            code: "ADAPTER_NOT_REGISTERED".to_owned(),
                            message: "Pair this adapter before sending context.".to_owned(),
                        },
                    )
                    .await?;
                    continue;
                }
                match core.accept_context(source, observation) {
                    Ok(()) => {
                        send_message(&mut socket, &ServerMessage::Ack { message_id }).await?;
                        let _ = app.emit("pop://runtime-updated", core.snapshot());
                    }
                    Err(code) => {
                        send_message(
                            &mut socket,
                            &ServerMessage::Error {
                                code: code.to_owned(),
                                message: "Context was blocked by POP Core.".to_owned(),
                            },
                        )
                        .await?;
                    }
                }
            }
            EnvelopePayload::Heartbeat(_) => {
                send_message(&mut socket, &ServerMessage::Ack { message_id }).await?;
            }
        }
    }

    if let Some(source) = registered_source {
        core.mark_disconnected(source);
        let _ = app.emit("pop://runtime-updated", core.snapshot());
    }
    Ok(())
}

pub async fn run(core: PopCore, app: AppHandle) -> Result<(), String> {
    let listener = TcpListener::bind(SERVER_ADDRESS)
        .await
        .map_err(|error| error.to_string())?;
    loop {
        let (stream, _) = listener.accept().await.map_err(|error| error.to_string())?;
        let connection_core = core.clone();
        let connection_app = app.clone();
        tauri::async_runtime::spawn(async move {
            let _ = handle_connection(stream, connection_core, connection_app).await;
        });
    }
}
