use std::{
    io::{self, Read, Write},
    thread,
    time::Duration,
};

use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    net::windows::named_pipe::{ClientOptions, NamedPipeClient},
    sync::mpsc,
};

const PIPE_NAME: &str = r"\\.\pipe\pop-companion-v3";
const MAX_MESSAGE_BYTES: usize = 64 * 1024;

fn write_native_message(value: &serde_json::Value) -> io::Result<()> {
    let bytes = serde_json::to_vec(value)?;
    let mut stdout = io::stdout().lock();
    stdout.write_all(&(bytes.len() as u32).to_le_bytes())?;
    stdout.write_all(&bytes)?;
    stdout.flush()
}

async fn connect_pipe() -> io::Result<NamedPipeClient> {
    let mut last_error = None;
    for _ in 0..20 {
        match ClientOptions::new().open(PIPE_NAME) {
            Ok(pipe) => return Ok(pipe),
            Err(error) => last_error = Some(error),
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    Err(last_error
        .unwrap_or_else(|| io::Error::new(io::ErrorKind::NotFound, "POP pipe unavailable")))
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let secret = pop_desktop_lib::native_host_secret()?;
    let pipe = match connect_pipe().await {
        Ok(value) => value,
        Err(_) => {
            write_native_message(
                &serde_json::json!({ "type": "ERROR", "code": "POP_DESKTOP_OFFLINE" }),
            )?;
            return Ok(());
        }
    };
    let (reader, mut writer) = tokio::io::split(pipe);
    let mut registration =
        serde_json::to_vec(&serde_json::json!({ "type": "HOST_REGISTER", "secret": secret }))?;
    registration.push(b'\n');
    writer.write_all(&registration).await?;
    writer.flush().await?;

    let (sender, mut receiver) = mpsc::channel::<Vec<u8>>(16);
    thread::spawn(move || {
        let mut stdin = io::stdin().lock();
        loop {
            let mut length = [0_u8; 4];
            if stdin.read_exact(&mut length).is_err() {
                break;
            }
            let length = u32::from_le_bytes(length) as usize;
            if length == 0 || length > MAX_MESSAGE_BYTES {
                break;
            }
            let mut bytes = vec![0_u8; length];
            if stdin.read_exact(&mut bytes).is_err()
                || serde_json::from_slice::<serde_json::Value>(&bytes).is_err()
            {
                break;
            }
            if sender.blocking_send(bytes).is_err() {
                break;
            }
        }
    });

    let mut lines = BufReader::new(reader).lines();
    loop {
        tokio::select! {
            line = lines.next_line() => {
                let Some(line) = line? else { break; };
                if let Ok(value) = serde_json::from_str::<serde_json::Value>(&line) { write_native_message(&value)?; }
            }
            message = receiver.recv() => {
                let Some(mut bytes) = message else { break; };
                bytes.push(b'\n');
                writer.write_all(&bytes).await?;
                writer.flush().await?;
            }
        }
    }
    Ok(())
}
