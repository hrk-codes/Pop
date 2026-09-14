use std::{
    collections::HashMap,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
    time::Duration,
};

use serde::Deserialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWrite, AsyncWriteExt, BufReader},
    net::{
        TcpListener, TcpStream,
        windows::named_pipe::{NamedPipeServer, ServerOptions},
    },
    sync::{Semaphore, broadcast},
};

use crate::{
    core::{PopCore, RuntimeSnapshot, now_ms},
    native_auth::PIPE_NAME,
    protocol::{
        AdapterSource, EnvelopePayload, MAX_MESSAGE_BYTES, ProtocolEnvelope, ServerMessage,
    },
};

pub const LOOPBACK_ADDRESS: &str = "127.0.0.1:32145";
const EXTENSION_ORIGIN: &str = "chrome-extension://fpkepfajehdejjbccjaecmbmdepkaddf";
const LOOPBACK_HEADER: &str = "pop-extension-v1-fpkepfajehdejjbccjaecmbmdepkaddf";
const MAX_HTTP_HEADER_BYTES: usize = 16 * 1024;
const LOOPBACK_TIMEOUT_MS: u64 = 75_000;

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
        monitoring_enabled: snapshot.permissions.monitoring_enabled
            && !snapshot.suspended
            && !snapshot.privacy_paused,
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

fn process_envelope(envelope: ProtocolEnvelope, core: &PopCore, app: &AppHandle) -> ServerMessage {
    let message_id = envelope.id.clone();
    if envelope.source != AdapterSource::Chrome {
        return ServerMessage::Error {
            code: "SOURCE_DENIED".to_owned(),
            message: "This bridge accepts the X adapter only.".to_owned(),
        };
    }
    match envelope.message {
        EnvelopePayload::Context(observation) => {
            match core.accept_context(AdapterSource::Chrome, observation) {
                Ok(()) => {
                    let _ = app.emit("pop://runtime-updated", core.snapshot());
                    if let Some(window) = app.get_webview_window("avatar") {
                        let _ = window.show();
                    }
                    ServerMessage::Ack { message_id }
                }
                Err(code) => {
                    let _ = app.emit("pop://runtime-updated", core.snapshot());
                    ServerMessage::Error {
                        code: code.to_owned(),
                        message: "Context was blocked by POP Core.".to_owned(),
                    }
                }
            }
        }
        EnvelopePayload::UiCommand(payload) => {
            match payload.command {
                crate::protocol::UiCommand::Show => {
                    if let Some(window) = app.get_webview_window("avatar") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                command => {
                    let snapshot = core.snapshot();
                    if !snapshot.permissions.monitoring_enabled
                        || !snapshot.permissions.allows(crate::protocol::PlatformId::X)
                        || snapshot.suspended
                    {
                        return ServerMessage::Error {
                            code: "ASSISTANCE_DISABLED".to_owned(),
                            message: "POP assistance is not enabled for X.".to_owned(),
                        };
                    }
                    let direction = match command {
                        crate::protocol::UiCommand::Up => "up",
                        crate::protocol::UiCommand::Down => "down",
                        crate::protocol::UiCommand::Left => "left",
                        crate::protocol::UiCommand::Right => "right",
                        crate::protocol::UiCommand::Show => unreachable!(),
                    };
                    let _ = app.emit("pop://avatar-action", direction);
                }
            }
            ServerMessage::Ack { message_id }
        }
        EnvelopePayload::Heartbeat(_) => control_message(&core.snapshot()),
    }
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
                let response = process_envelope(envelope, &core, &app);
                send_message(&mut writer, &response).await?;
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

struct HttpRequest {
    method: String,
    path: String,
    headers: HashMap<String, String>,
    body: Vec<u8>,
}

#[derive(Clone)]
struct LoopbackPresence {
    connected: Arc<AtomicBool>,
    last_seen: Arc<AtomicU64>,
}

impl LoopbackPresence {
    fn new() -> Self {
        Self {
            connected: Arc::new(AtomicBool::new(false)),
            last_seen: Arc::new(AtomicU64::new(0)),
        }
    }

    fn touch(&self, core: &PopCore, app: &AppHandle) {
        self.last_seen.store(now_ms(), Ordering::Relaxed);
        if !self.connected.swap(true, Ordering::AcqRel) {
            let _ = core.mark_connected(AdapterSource::Chrome);
            let _ = app.emit("pop://runtime-updated", core.snapshot());
        }
    }
}

fn find_header_end(bytes: &[u8]) -> Option<usize> {
    bytes.windows(4).position(|window| window == b"\r\n\r\n")
}

fn parse_http_head(head: &[u8]) -> Result<(String, String, HashMap<String, String>), String> {
    let text = std::str::from_utf8(head).map_err(|_| "HTTP_HEADER_INVALID".to_owned())?;
    let mut lines = text.split("\r\n");
    let mut request_line = lines
        .next()
        .ok_or_else(|| "HTTP_REQUEST_INVALID".to_owned())?
        .split_whitespace();
    let method = request_line
        .next()
        .ok_or_else(|| "HTTP_METHOD_MISSING".to_owned())?
        .to_owned();
    let path = request_line
        .next()
        .ok_or_else(|| "HTTP_PATH_MISSING".to_owned())?
        .to_owned();
    if request_line.next() != Some("HTTP/1.1") || request_line.next().is_some() {
        return Err("HTTP_VERSION_INVALID".to_owned());
    }
    let mut headers = HashMap::new();
    for line in lines.filter(|line| !line.is_empty()) {
        let (name, value) = line
            .split_once(':')
            .ok_or_else(|| "HTTP_HEADER_INVALID".to_owned())?;
        headers.insert(name.trim().to_ascii_lowercase(), value.trim().to_owned());
    }
    Ok((method, path, headers))
}

async fn read_http_request(stream: &mut TcpStream) -> Result<HttpRequest, String> {
    let mut bytes = Vec::with_capacity(2048);
    let header_end = loop {
        let mut chunk = [0_u8; 2048];
        let count = stream
            .read(&mut chunk)
            .await
            .map_err(|error| error.to_string())?;
        if count == 0 {
            return Err("HTTP_CLIENT_DISCONNECTED".to_owned());
        }
        bytes.extend_from_slice(&chunk[..count]);
        if let Some(position) = find_header_end(&bytes) {
            break position;
        }
        if bytes.len() > MAX_HTTP_HEADER_BYTES {
            return Err("HTTP_HEADER_TOO_LARGE".to_owned());
        }
    };
    let body_start = header_end + 4;
    let (method, path, headers) = parse_http_head(&bytes[..header_end])?;
    let body_length = headers
        .get("content-length")
        .map(|value| value.parse::<usize>())
        .transpose()
        .map_err(|_| "HTTP_CONTENT_LENGTH_INVALID".to_owned())?
        .unwrap_or(0);
    if body_length > MAX_MESSAGE_BYTES {
        return Err("MESSAGE_TOO_LARGE".to_owned());
    }
    while bytes.len() < body_start + body_length {
        let mut chunk = [0_u8; 2048];
        let count = stream
            .read(&mut chunk)
            .await
            .map_err(|error| error.to_string())?;
        if count == 0 {
            return Err("HTTP_BODY_INCOMPLETE".to_owned());
        }
        bytes.extend_from_slice(&chunk[..count]);
        if bytes.len() > body_start + MAX_MESSAGE_BYTES {
            return Err("MESSAGE_TOO_LARGE".to_owned());
        }
    }
    Ok(HttpRequest {
        method,
        path,
        headers,
        body: bytes[body_start..body_start + body_length].to_vec(),
    })
}

fn authorized_extension(headers: &HashMap<String, String>) -> bool {
    headers.get("x-pop-bridge").map(String::as_str) == Some(LOOPBACK_HEADER)
        && (authorized_origin(headers) || authorized_extension_fetch(headers))
}

fn authorized_origin(headers: &HashMap<String, String>) -> bool {
    headers.get("origin").map(String::as_str) == Some(EXTENSION_ORIGIN)
}

fn authorized_extension_fetch(headers: &HashMap<String, String>) -> bool {
    !headers.contains_key("origin")
        && headers.get("host").map(String::as_str) == Some(LOOPBACK_ADDRESS)
        && headers.get("sec-fetch-site").map(String::as_str) == Some("none")
        && headers.get("sec-fetch-mode").map(String::as_str) == Some("cors")
}

fn authorized_preflight(headers: &HashMap<String, String>) -> bool {
    authorized_origin(headers)
        && headers
            .get("access-control-request-method")
            .is_some_and(|method| method == "GET" || method == "POST")
        && headers
            .get("access-control-request-headers")
            .is_some_and(|value| {
                value
                    .split(',')
                    .any(|name| name.trim().eq_ignore_ascii_case("x-pop-bridge"))
            })
}

async fn send_http_response(
    stream: &mut TcpStream,
    status: &str,
    body: &[u8],
) -> Result<(), String> {
    let head = format!(
        "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: {EXTENSION_ORIGIN}\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type, X-POP-Bridge\r\nAccess-Control-Allow-Private-Network: true\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream
        .write_all(head.as_bytes())
        .await
        .map_err(|error| error.to_string())?;
    stream
        .write_all(body)
        .await
        .map_err(|error| error.to_string())
}

async fn handle_http_connection(
    mut stream: TcpStream,
    core: PopCore,
    app: AppHandle,
    presence: LoopbackPresence,
) -> Result<(), String> {
    let request = read_http_request(&mut stream).await?;
    if request.method == "OPTIONS" {
        if authorized_preflight(&request.headers) {
            return send_http_response(&mut stream, "204 No Content", b"").await;
        }
        return send_http_response(
            &mut stream,
            "403 Forbidden",
            br#"{"type":"ERROR","code":"ORIGIN_DENIED","message":"Extension origin was denied."}"#,
        )
        .await;
    }
    if !authorized_extension(&request.headers) {
        return send_http_response(
            &mut stream,
            "403 Forbidden",
            br#"{"type":"ERROR","code":"ORIGIN_DENIED","message":"Extension origin was denied."}"#,
        )
        .await;
    }
    presence.touch(&core, &app);
    let response = match (request.method.as_str(), request.path.as_str()) {
        ("GET", "/v1/control") => control_message(&core.snapshot()),
        ("POST", "/v1/message") => {
            let envelope: ProtocolEnvelope = match serde_json::from_slice(&request.body) {
                Ok(value) => value,
                Err(_) => {
                    return send_http_response(
                        &mut stream,
                        "400 Bad Request",
                        br#"{"type":"ERROR","code":"INVALID_MESSAGE","message":"Adapter message was invalid."}"#,
                    )
                    .await;
                }
            };
            if let Err(code) = envelope.validate() {
                let body = serde_json::to_vec(&ServerMessage::Error {
                    code: code.to_owned(),
                    message: "Adapter message validation failed.".to_owned(),
                })
                .map_err(|error| error.to_string())?;
                return send_http_response(&mut stream, "400 Bad Request", &body).await;
            }
            process_envelope(envelope, &core, &app)
        }
        _ => {
            return send_http_response(
                &mut stream,
                "404 Not Found",
                br#"{"type":"ERROR","code":"NOT_FOUND","message":"Unknown bridge endpoint."}"#,
            )
            .await;
        }
    };
    let body = serde_json::to_vec(&response).map_err(|error| error.to_string())?;
    send_http_response(&mut stream, "200 OK", &body).await
}

pub async fn run_loopback(core: PopCore, app: AppHandle) -> Result<(), String> {
    let listener = TcpListener::bind(LOOPBACK_ADDRESS)
        .await
        .map_err(|error| error.to_string())?;
    let presence = LoopbackPresence::new();
    let watcher_presence = presence.clone();
    let watcher_core = core.clone();
    let watcher_app = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(2)).await;
            let expired = now_ms()
                .saturating_sub(watcher_presence.last_seen.load(Ordering::Relaxed))
                > LOOPBACK_TIMEOUT_MS;
            if expired && watcher_presence.connected.swap(false, Ordering::AcqRel) {
                watcher_core.mark_disconnected(AdapterSource::Chrome);
                let _ = watcher_app.emit("pop://runtime-updated", watcher_core.snapshot());
            }
        }
    });
    let permits = Arc::new(Semaphore::new(8));
    loop {
        let (stream, address) = listener.accept().await.map_err(|error| error.to_string())?;
        if !address.ip().is_loopback() {
            continue;
        }
        let Ok(permit) = permits.clone().try_acquire_owned() else {
            continue;
        };
        let connection_core = core.clone();
        let connection_app = app.clone();
        let connection_presence = presence.clone();
        tauri::async_runtime::spawn(async move {
            let _permit = permit;
            if let Err(error) =
                handle_http_connection(stream, connection_core, connection_app, connection_presence)
                    .await
            {
                eprintln!("POP loopback bridge request ended: {error}");
            }
        });
    }
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

#[cfg(test)]
mod tests {
    use super::{
        EXTENSION_ORIGIN, LOOPBACK_ADDRESS, LOOPBACK_HEADER, authorized_extension,
        authorized_preflight, parse_http_head,
    };

    #[test]
    fn accepts_only_the_expected_extension_origin_and_bridge_header() {
        let (_, _, headers) = parse_http_head(
            format!(
                "GET /v1/control HTTP/1.1\r\nOrigin: {EXTENSION_ORIGIN}\r\nX-POP-Bridge: {LOOPBACK_HEADER}\r\n"
            )
            .as_bytes(),
        )
        .expect("request head parses");
        assert!(authorized_extension(&headers));
    }

    #[test]
    fn rejects_webpage_origins() {
        let (_, _, headers) = parse_http_head(
            format!(
                "GET /v1/control HTTP/1.1\r\nOrigin: https://x.com\r\nX-POP-Bridge: {LOOPBACK_HEADER}\r\n"
            )
            .as_bytes(),
        )
        .expect("request head parses");
        assert!(!authorized_extension(&headers));
    }

    #[test]
    fn accepts_chrome_extension_fetch_metadata_when_origin_is_omitted() {
        let (_, _, headers) = parse_http_head(
            format!(
                "GET /v1/control HTTP/1.1\r\nHost: {LOOPBACK_ADDRESS}\r\nSec-Fetch-Site: none\r\nSec-Fetch-Mode: cors\r\nX-POP-Bridge: {LOOPBACK_HEADER}\r\n"
            )
            .as_bytes(),
        )
        .expect("extension request head parses");
        assert!(authorized_extension(&headers));
    }

    #[test]
    fn rejects_missing_origin_without_chrome_extension_fetch_metadata() {
        let (_, _, headers) = parse_http_head(
            format!(
                "GET /v1/control HTTP/1.1\r\nHost: {LOOPBACK_ADDRESS}\r\nX-POP-Bridge: {LOOPBACK_HEADER}\r\n"
            )
            .as_bytes(),
        )
        .expect("request head parses");
        assert!(!authorized_extension(&headers));
    }

    #[test]
    fn accepts_browser_preflight_without_the_bridge_value() {
        let (_, _, headers) = parse_http_head(
            format!(
                "OPTIONS /v1/control HTTP/1.1\r\nOrigin: {EXTENSION_ORIGIN}\r\nAccess-Control-Request-Method: GET\r\nAccess-Control-Request-Headers: content-type, x-pop-bridge\r\n"
            )
            .as_bytes(),
        )
        .expect("preflight head parses");
        assert!(authorized_preflight(&headers));
        assert!(!authorized_extension(&headers));
    }
}
