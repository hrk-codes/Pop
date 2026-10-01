use std::{sync::Arc, time::Duration};

use reqwest::{Client, Request, Response, header::HeaderMap};
use serde::Deserialize;
use tokio::{sync::Mutex, time::Instant};
use tokio_util::sync::CancellationToken;

const MAX_ATTEMPTS: usize = 3;
const MAX_AUTOMATIC_WAIT: Duration = Duration::from_secs(12);
const MAX_ERROR_BODY: usize = 16 * 1024;

#[derive(Clone, Default)]
pub struct GroqTransport {
    // Provider clones share the cooldown, including when a newer arrow cancels an older request.
    gate: Arc<Mutex<Option<Cooldown>>>,
}

struct Cooldown {
    until: Instant,
    code: &'static str,
}

#[derive(Debug)]
struct Failure {
    code: &'static str,
    retryable: bool,
    delay: Duration,
}

#[derive(Default, Deserialize)]
struct ErrorEnvelope {
    error: Option<ErrorDetails>,
}

#[derive(Default, Deserialize)]
struct ErrorDetails {
    code: Option<String>,
    #[serde(rename = "type")]
    kind: Option<String>,
}

fn seconds(value: f64) -> Option<Duration> {
    if !value.is_finite() || value < 0.0 {
        return None;
    }
    Duration::try_from_secs_f64(value).ok()
}

fn reset_duration(value: &str) -> Option<Duration> {
    let mut remaining = value.trim();
    if remaining.is_empty() {
        return None;
    }
    if let Ok(value) = remaining.parse::<f64>() {
        return seconds(value);
    }
    let mut total = Duration::ZERO;
    while !remaining.is_empty() {
        let end = remaining.find(|c: char| !c.is_ascii_digit() && c != '.')?;
        let amount = remaining[..end].parse::<f64>().ok()?;
        remaining = &remaining[end..];
        let (suffix, multiplier) = if remaining.starts_with("ms") {
            ("ms", 0.001)
        } else if remaining.starts_with('s') {
            ("s", 1.0)
        } else if remaining.starts_with('m') {
            ("m", 60.0)
        } else if remaining.starts_with('h') {
            ("h", 3600.0)
        } else if remaining.starts_with('d') {
            ("d", 86400.0)
        } else {
            return None;
        };
        total = total.checked_add(seconds(amount * multiplier)?)?;
        remaining = &remaining[suffix.len()..];
    }
    Some(total)
}

fn retry_delay(headers: &HeaderMap) -> Option<Duration> {
    if let Some(delay) = headers
        .get("retry-after")
        .and_then(|value| value.to_str().ok())
        .and_then(reset_duration)
    {
        return Some(delay);
    }
    // Request-reset is a daily window: consult it only when that quota is actually exhausted.
    ["tokens", "requests"]
        .into_iter()
        .filter_map(|resource| {
            let remaining = headers
                .get(format!("x-ratelimit-remaining-{resource}"))?
                .to_str()
                .ok()?
                .parse::<u64>()
                .ok()?;
            if remaining != 0 {
                return None;
            }
            reset_duration(
                headers
                    .get(format!("x-ratelimit-reset-{resource}"))?
                    .to_str()
                    .ok()?,
            )
        })
        .max()
}

fn classify_failure(status: u16, headers: &HeaderMap, body: &[u8]) -> Failure {
    let details = serde_json::from_slice::<ErrorEnvelope>(body)
        .unwrap_or_default()
        .error
        .unwrap_or_default();
    let code = details.code.as_deref().or(details.kind.as_deref());
    let (code, retryable) = match (status, code) {
        (401, _) => ("GROQ_AUTH_FAILED", false),
        (403, _) => ("GROQ_ACCESS_DENIED", false),
        (404, _) | (_, Some("model_not_found" | "model_decommissioned")) => {
            ("GROQ_MODEL_UNAVAILABLE", false)
        }
        (413, _) | (_, Some("context_length_exceeded")) => ("GROQ_CONTEXT_TOO_LARGE", false),
        (_, Some("insufficient_quota" | "billing_hard_limit_reached")) => {
            ("GROQ_QUOTA_EXHAUSTED", false)
        }
        (429, _) => ("GROQ_RATE_LIMITED", true),
        (408 | 498 | 500 | 502 | 503 | 504, _) => ("GROQ_UNAVAILABLE", true),
        (400 | 422, Some("failed_generation" | "model_generation_failed")) => {
            ("GROQ_GENERATION_FAILED", true)
        }
        (422, None) => ("GROQ_GENERATION_FAILED", true),
        (400 | 422, _) => ("GROQ_INVALID_REQUEST", false),
        _ => ("GROQ_REQUEST_REJECTED", false),
    };
    Failure {
        code,
        retryable,
        delay: retry_delay(headers).unwrap_or(if status == 429 {
            Duration::from_secs(2)
        } else {
            Duration::from_millis(500)
        }),
    }
}

fn cooldown_error(code: &str, delay: Duration) -> String {
    if code == "GROQ_RATE_LIMITED" {
        format!("{code}:{}", delay.as_secs_f64().ceil() as u64)
    } else {
        code.to_owned()
    }
}

async fn error_body(mut response: Response) -> Vec<u8> {
    let mut body = Vec::new();
    while let Ok(Some(chunk)) = response.chunk().await {
        if body.len() + chunk.len() > MAX_ERROR_BODY {
            break;
        }
        body.extend_from_slice(&chunk);
    }
    body
}

impl GroqTransport {
    pub async fn send(
        &self,
        client: &Client,
        request: Request,
        cancellation: &CancellationToken,
    ) -> Result<Response, String> {
        let deadline = Instant::now()
            + request
                .timeout()
                .copied()
                .unwrap_or(Duration::from_secs(30));
        tokio::select! {
            biased;
            _ = cancellation.cancelled() => Err("REQUEST_CANCELLED".to_owned()),
            result = tokio::time::timeout_at(deadline, self.send_inner(client, request, cancellation)) => {
                result.unwrap_or_else(|_| Err("GROQ_REQUEST_TIMEOUT".to_owned()))
            }
        }
    }

    async fn send_inner(
        &self,
        client: &Client,
        request: Request,
        cancellation: &CancellationToken,
    ) -> Result<Response, String> {
        let mut cooldown = self.gate.lock().await;
        let mut wait_budget = MAX_AUTOMATIC_WAIT;
        for attempt in 0..MAX_ATTEMPTS {
            if let Some(active) = cooldown.as_ref() {
                let remaining = active.until.saturating_duration_since(Instant::now());
                if remaining > wait_budget {
                    return Err(cooldown_error(active.code, remaining));
                }
                tokio::time::sleep(remaining).await;
                wait_budget = wait_budget.saturating_sub(remaining);
                *cooldown = None;
            }
            if cancellation.is_cancelled() {
                return Err("REQUEST_CANCELLED".to_owned());
            }
            let next_request = request.try_clone().ok_or("GROQ_INVALID_REQUEST")?;
            let response = match client.execute(next_request).await {
                Ok(response) => response,
                Err(error) => {
                    if error.is_timeout() {
                        return Err("GROQ_REQUEST_TIMEOUT".to_owned());
                    }
                    if !error.is_connect() || attempt + 1 == MAX_ATTEMPTS {
                        return Err("GROQ_REQUEST_FAILED".to_owned());
                    }
                    let delay = Duration::from_millis(500 * (1 << attempt));
                    tokio::time::sleep(delay).await;
                    wait_budget = wait_budget.saturating_sub(delay);
                    continue;
                }
            };
            if response.status().is_success() {
                return Ok(response);
            }
            let status = response.status().as_u16();
            let headers = response.headers().clone();
            let body = error_body(response).await;
            let failure = classify_failure(status, &headers, &body);
            let last_error = if failure.code == "GROQ_REQUEST_REJECTED" {
                format!("GROQ_REQUEST_REJECTED:{status}")
            } else {
                cooldown_error(failure.code, failure.delay)
            };
            if !failure.retryable {
                return Err(last_error);
            }
            let delay = failure
                .delay
                .max(Duration::from_millis(500 * (1 << attempt)));
            *cooldown = Some(Cooldown {
                until: Instant::now()
                    .checked_add(delay)
                    .ok_or("GROQ_UNAVAILABLE")?,
                code: failure.code,
            });
            if attempt + 1 == MAX_ATTEMPTS || delay > wait_budget {
                return Err(cooldown_error(failure.code, delay));
            }
        }
        Err("GROQ_UNAVAILABLE".to_owned())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
        task::JoinHandle,
    };

    struct StubResponse {
        status: &'static str,
        headers: &'static str,
        body: &'static str,
    }

    async fn server(responses: Vec<StubResponse>) -> (String, JoinHandle<Vec<Vec<u8>>>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}/completions", listener.local_addr().unwrap());
        let task = tokio::spawn(async move {
            let mut requests = Vec::new();
            for response in responses {
                let (mut socket, _) =
                    tokio::time::timeout(Duration::from_secs(5), listener.accept())
                        .await
                        .unwrap()
                        .unwrap();
                let mut bytes = Vec::new();
                let mut buffer = [0_u8; 4096];
                loop {
                    let count = socket.read(&mut buffer).await.unwrap();
                    assert!(count > 0);
                    bytes.extend_from_slice(&buffer[..count]);
                    if let Some(end) = bytes.windows(4).position(|part| part == b"\r\n\r\n") {
                        let headers = String::from_utf8_lossy(&bytes[..end]);
                        let length = headers
                            .lines()
                            .find_map(|line| {
                                let (name, value) = line.split_once(':')?;
                                name.eq_ignore_ascii_case("content-length")
                                    .then(|| value.trim().parse::<usize>().unwrap())
                            })
                            .unwrap_or_default();
                        if bytes.len() >= end + 4 + length {
                            requests.push(bytes[end + 4..].to_vec());
                            break;
                        }
                    }
                }
                let reply = format!(
                    "HTTP/1.1 {}\r\nContent-Length: {}\r\nConnection: close\r\n{}\r\n{}",
                    response.status,
                    response.body.len(),
                    response.headers,
                    response.body
                );
                socket.write_all(reply.as_bytes()).await.unwrap();
            }
            requests
        });
        (url, task)
    }

    fn request(client: &Client, url: &str) -> Request {
        client
            .post(url)
            .timeout(Duration::from_secs(5))
            .body("same selected context and tone")
            .build()
            .unwrap()
    }

    fn success() -> StubResponse {
        StubResponse {
            status: "200 OK",
            headers: "Content-Type: text/event-stream\r\n",
            body: "data: [DONE]\n\n",
        }
    }

    #[tokio::test]
    async fn retries_rate_limit_after_wait_with_identical_body() {
        let (url, server) = server(vec![
            StubResponse {
                status: "429 Too Many Requests",
                headers: "Retry-After: 0.6\r\n",
                body: r#"{"error":{"code":"rate_limit_exceeded"}}"#,
            },
            success(),
        ])
        .await;
        let client = Client::new();
        let started = Instant::now();
        let response = GroqTransport::default()
            .send(&client, request(&client, &url), &CancellationToken::new())
            .await
            .unwrap();
        assert!(started.elapsed() >= Duration::from_millis(600));
        assert_eq!(response.status(), 200);
        assert_eq!(response.text().await.unwrap(), "data: [DONE]\n\n");
        let requests = server.await.unwrap();
        assert_eq!(requests.len(), 2);
        assert_eq!(requests[0], requests[1]);
    }

    #[tokio::test]
    async fn recovers_from_temporary_server_failure() {
        let (url, server) = server(vec![
            StubResponse {
                status: "503 Service Unavailable",
                headers: "",
                body: "temporary outage",
            },
            success(),
        ])
        .await;
        let client = Client::new();
        assert!(
            GroqTransport::default()
                .send(&client, request(&client, &url), &CancellationToken::new())
                .await
                .is_ok()
        );
        assert_eq!(server.await.unwrap().len(), 2);
    }

    #[tokio::test]
    async fn retries_only_known_generation_errors_not_invalid_parameters() {
        let (url, server) = server(vec![
            StubResponse {
                status: "400 Bad Request",
                headers: "",
                body: r#"{"error":{"code":"failed_generation"}}"#,
            },
            success(),
        ])
        .await;
        let client = Client::new();
        assert!(
            GroqTransport::default()
                .send(&client, request(&client, &url), &CancellationToken::new())
                .await
                .is_ok()
        );
        assert_eq!(server.await.unwrap().len(), 2);

        let failure = classify_failure(
            400,
            &HeaderMap::new(),
            br#"{"error":{"code":"invalid_parameter","message":"private source must not escape"}}"#,
        );
        assert!(!failure.retryable);
        assert_eq!(failure.code, "GROQ_INVALID_REQUEST");
    }

    #[tokio::test]
    async fn long_rate_limit_is_shared_with_later_requests_without_calling_provider() {
        let (url, server) = server(vec![StubResponse {
            status: "429 Too Many Requests",
            headers: "Retry-After: 60\r\n",
            body: "{}",
        }])
        .await;
        let client = Client::new();
        let transport = GroqTransport::default();
        for provider in [transport.clone(), transport] {
            let error = provider
                .send(&client, request(&client, &url), &CancellationToken::new())
                .await
                .unwrap_err();
            assert!(error.starts_with("GROQ_RATE_LIMITED:"));
            assert!(error.split(':').nth(1).unwrap().parse::<u64>().unwrap() > 50);
        }
        assert_eq!(server.await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn retries_stop_at_three_attempts() {
        let (url, server) = server(
            (0..3)
                .map(|_| StubResponse {
                    status: "503 Service Unavailable",
                    headers: "",
                    body: "{}",
                })
                .collect(),
        )
        .await;
        let client = Client::new();
        let error = GroqTransport::default()
            .send(&client, request(&client, &url), &CancellationToken::new())
            .await
            .unwrap_err();
        assert_eq!(error, "GROQ_UNAVAILABLE");
        assert_eq!(server.await.unwrap().len(), 3);
    }

    #[tokio::test]
    async fn authentication_failure_is_not_retried() {
        let (url, server) = server(vec![StubResponse {
            status: "401 Unauthorized",
            headers: "",
            body: r#"{"error":{"message":"sensitive details"}}"#,
        }])
        .await;
        let client = Client::new();
        let error = GroqTransport::default()
            .send(&client, request(&client, &url), &CancellationToken::new())
            .await
            .unwrap_err();
        assert_eq!(error, "GROQ_AUTH_FAILED");
        assert_eq!(server.await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn cancelling_wait_keeps_cooldown_and_sends_no_request() {
        let transport = GroqTransport::default();
        *transport.gate.lock().await = Some(Cooldown {
            until: Instant::now() + Duration::from_secs(2),
            code: "GROQ_RATE_LIMITED",
        });
        let client = Client::new();
        let token = CancellationToken::new();
        let cancel = token.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(20)).await;
            cancel.cancel();
        });
        let error = transport
            .send(&client, request(&client, "http://127.0.0.1:1"), &token)
            .await
            .unwrap_err();
        assert_eq!(error, "REQUEST_CANCELLED");
        assert!(transport.gate.lock().await.as_ref().unwrap().until > Instant::now());
    }

    #[tokio::test]
    async fn cancelling_before_headers_stops_request_immediately() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let token = CancellationToken::new();
        let cancel = token.clone();
        let server = tokio::spawn(async move {
            let (_socket, _) = listener.accept().await.unwrap();
            cancel.cancel();
            tokio::time::sleep(Duration::from_millis(100)).await;
        });
        let client = Client::new();
        let error = GroqTransport::default()
            .send(&client, request(&client, &url), &token)
            .await
            .unwrap_err();
        assert_eq!(error, "REQUEST_CANCELLED");
        server.await.unwrap();
    }

    #[test]
    fn reset_headers_only_delay_the_exhausted_quota() {
        let mut headers = HeaderMap::new();
        headers.insert("x-ratelimit-remaining-tokens", "0".parse().unwrap());
        headers.insert("x-ratelimit-reset-tokens", "7.66s".parse().unwrap());
        headers.insert("x-ratelimit-remaining-requests", "939".parse().unwrap());
        headers.insert("x-ratelimit-reset-requests", "1h27m50.4s".parse().unwrap());
        assert_eq!(retry_delay(&headers), Some(Duration::from_millis(7660)));
        headers.insert("x-ratelimit-remaining-requests", "0".parse().unwrap());
        assert_eq!(
            retry_delay(&headers),
            Some(Duration::from_millis(5_270_400))
        );
        headers.insert("retry-after", "2".parse().unwrap());
        assert_eq!(retry_delay(&headers), Some(Duration::from_secs(2)));
        for invalid in ["", "NaN", "inf", "-5", "yesterday", "4months"] {
            assert_eq!(reset_duration(invalid), None, "{invalid}");
        }
    }

    #[test]
    fn quota_and_configuration_failures_do_not_retry() {
        for (status, body, expected) in [
            (403, "{}", "GROQ_ACCESS_DENIED"),
            (404, "{}", "GROQ_MODEL_UNAVAILABLE"),
            (413, "{}", "GROQ_CONTEXT_TOO_LARGE"),
            (
                429,
                r#"{"error":{"code":"insufficient_quota"}}"#,
                "GROQ_QUOTA_EXHAUSTED",
            ),
        ] {
            let failure = classify_failure(status, &HeaderMap::new(), body.as_bytes());
            assert_eq!(failure.code, expected);
            assert!(!failure.retryable);
        }
    }
}
