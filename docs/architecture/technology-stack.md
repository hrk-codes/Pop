# Live POP Technology Stack

This document describes the executable X-first runtime. Later platform, memory, tool, visual, action,
and voice documents are design boundaries until their own acceptance gates pass.

## Tauri 2 and Windows WebView2

Tauri creates three independent transparent surfaces: the avatar, response bubble, and compact menu.
Separate surfaces prevent an invisible dashboard-sized window from blocking the desktop. Rust also
owns tray behavior, screen positioning, process lifecycle, and the command boundary. WebView2 keeps
the installed application smaller than a bundled-Chromium desktop shell.

## Rust POP Core

Rust validates every browser message, owns monitoring and platform decisions, screens likely secrets,
checks the foreground target, expires context, accesses credentials, and calls providers. Rust is used
here because this is the security and native-integration boundary, where predictable resource use and
memory safety matter more than rapid UI iteration.

## React 19, XState 5, and Motion

React renders the SVG character and compact controls. XState models idle, attentive, thinking,
speaking, success, and failure transitions explicitly, making animation behavior testable instead of
spreading booleans across one component. Motion animates SVG facial parts and respects reduced-motion
preferences. React never grants permissions or decides whether captured context is allowed.

## WXT and Chrome Manifest V3

WXT supplies typed MV3 entry points, manifest generation, production builds, and a cleaner development
loop than the previous custom esbuild script. The current adapter has host access only to `x.com`.
It reads stable selection or draft snapshots after a short debounce, never individual key events,
passwords, payments, cookies, browsing history, or unrelated tabs.

## Chrome Native Messaging and Windows Named Pipes

Chrome Native Messaging replaces the localhost WebSocket and rotating six-digit code. Chrome launches
the allow-listed `pop-native-host.exe`; the host authenticates to POP Core with a per-user secret from
Windows Credential Manager and forwards bounded protocol-v3 messages over a named pipe. This removes
daily pairing while retaining a real process boundary. Chrome still controls the unavoidable one-time
extension installation and X host-permission approval.

## Zod and Serde Contracts

Zod validates TypeScript-side observations. Rust Serde types independently deserialize and validate
the same wire contract. Shared static types improve development, but independent runtime checks remain
necessary because browser and process messages are untrusted bytes.

## Harper Local Grammar

Harper provides offline English spelling and grammar correction. It is fast, deterministic, private,
and useful without an API key. POP warms it after startup so the first correction does not carry the
entire initialization cost. Harper results are previews and are never inserted automatically.

## Groq Streaming Provider

The Rust provider uses HTTPS and server-sent streaming with `openai/gpt-oss-20b` as the configurable
default. Short task-specific prompts reduce time to first token. Cloud work starts only after an
explicit Explain, Reply, Improve, Shorten, Summarize, or Next action. The response is still untrusted
preview text. Groq is externally hosted and may have quotas or costs; the provider interface remains
replaceable by a future local model adapter.

## SQLite and Windows Credential Manager

SQLite stores monitoring, X enablement, avatar position and size, derived preferences, and bounded AI
audit metadata. It does not store X drafts, selected posts, generated answers, or browsing history.
API keys and the native-host secret use Windows Credential Manager rather than `.env` or SQLite.

## pnpm, Vite, Vitest, ESLint, and Prettier

pnpm links the monorepo's applications and contracts reproducibly. Vite serves and builds the Tauri
frontend. Vitest checks state and policy behavior. Strict TypeScript, ESLint, Prettier, Cargo tests,
and Rust formatting catch different failure classes and are combined by `pnpm check`.

## Deliberate Exclusions

The X-first runtime has no LangChain agent loop, vector database, screen recording, OCR, global
keyboard hook, microphone, automated pointer or typing, X posting, MCP tool authority, or cloud
telemetry. Those technologies would enlarge the privacy and failure surface without improving the
first workflow POP must prove.
