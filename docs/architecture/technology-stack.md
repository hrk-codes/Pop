# Technology Stack and Rationale

This document explains what each planned technology does in POP, why it fits V0.1, and what boundary
it must respect. A technology appearing here does not mean it is implemented in Phase 0.

## Design criteria

Every choice is judged against the same needs: Windows integration, low idle overhead, explicit
permissions, minimum context, understandable code, typed contracts, local-first processing, and room
to replace providers later. V0.1 deliberately avoids autonomous-agent frameworks because deterministic
events and typed functions are easier to inspect, test, and secure.

## Tauri 2: desktop shell

**What it does:** Tauri packages the web-based companion UI as a native Windows desktop application
and exposes controlled commands implemented in Rust.

**Why POP uses it:** POP needs an always-on-top frameless window, tray behavior, native process/window
awareness, and a small idle footprint. Tauri uses the installed Windows WebView2 runtime instead of
shipping a full browser engine with every build. Its explicit command boundary also gives us a clear
place to validate any UI-to-native request.

**Reason not to use Electron initially:** Electron is productive and mature, but its bundled Chromium
and Node runtime increase distribution size and idle resource use. POP is intended to remain running,
so Tauri's smaller native shell is a better default. This is a product tradeoff, not a claim that
Electron is unsuitable in general.

**Boundary:** Tauri owns the desktop window and native bridge. Permission policy and AI prompts do not
belong in window components.

## Rust: native POP Core

**What it does:** Rust will implement Windows foreground-app detection, the localhost communication
server, tray/native lifecycle, secure local persistence access, and enforcement close to the system
boundary.

**Why POP uses it:** Rust offers memory safety without garbage-collector pauses, strong enums and
error types, predictable performance, and first-class Tauri support. Those properties suit a
long-running local process that handles untrusted extension messages.

**Tradeoff:** Rust has a steeper learning curve and native compilation requires the Microsoft C++
toolchain. Native responsibilities will therefore stay narrow and exposed through small typed APIs.

**Boundary:** Rust must validate incoming data independently. TypeScript validation in an extension is
helpful but is never a trust guarantee.

## React: desktop interface

**What it does:** React will render tiny, compact, and expanded modes; monitoring and permission
controls; cloud-activity status; suggestions; responses; and the "What POP Can See" view.

**Why POP uses it:** The UI has multiple explicit states and shared controls that map naturally to
components. React has a mature ecosystem and works directly with Vite and Tauri without dictating how
core business rules are written.

**Boundary:** React displays state and sends deliberate user actions. It must not be the sole enforcer
of monitoring, application, domain, or context permissions.

## TypeScript: shared application language

**What it does:** TypeScript will be used by the desktop UI, VS Code extension, Chrome extension, and
shared packages for protocol, context, permissions, events, and provider-neutral AI types.

**Why POP uses it:** Most of POP's non-native components run in JavaScript environments. Strict
TypeScript catches mismatched message shapes and state transitions during development and lets those
components share one vocabulary.

**Boundary:** Static types disappear at runtime. Every message crossing a process or extension
boundary still needs runtime schema validation.

## Vite: frontend build system

**What it does:** Vite will run the React development server and produce the desktop frontend bundle
consumed by Tauri.

**Why POP uses it:** It provides fast startup and refresh, a small configuration surface, and is the
well-supported default path for a Tauri React application. It is a build tool, not an application
architecture.

## Minimal CSS first, Tailwind only when justified

**Decision:** Begin Phase 1 with scoped, token-based CSS. Add Tailwind only if repeated utility patterns
make it clearly simpler.

**Why:** The companion has a compact visual surface in V0.1. Plain CSS variables and focused component
styles keep generated markup readable and avoid adding a framework before there is enough UI to
benefit. If the interface grows, Tailwind remains compatible with Vite and can be adopted as an
intentional later decision.

## Zustand: small UI state store

**What it does:** Zustand can hold client-side view state such as UI mode, connection state, current
context summary, cloud activity, and normalized response state.

**Why POP plans to use it:** It has little ceremony and supports isolated selectors, which is enough
for a small companion. Redux would add concepts and boilerplate that V0.1 does not yet need.

**Boundary:** Durable permissions and security decisions live in POP Core. The Zustand store is a UI
projection, not the source of authority.

## SQLite: structured local persistence

**What it does:** SQLite will store local settings, application/domain policies, provider preferences,
and privacy-safe request audit metadata.

**Why POP plans to use it:** It is local, transactional, versionable with migrations, and requires no
server or cloud account. Relational constraints help keep policy data consistent as permissions become
more granular.

**Tradeoff:** A simple configuration file would be adequate for only a few settings. SQLite is selected
because permissions and audit records will soon need atomic updates and schema evolution. API keys
must not be stored as plain SQLite values; Windows credential storage is the target for secrets.

## pnpm workspaces: monorepo package management

**What it does:** pnpm installs JavaScript dependencies once where possible, links local workspace
packages, and runs commands across applications and packages.

**Why POP uses it:** POP has three separately built applications that must share exact contracts. A
workspace makes local package relationships explicit while pnpm's content-addressed store reduces
duplicate disk usage. The lockfile makes development and CI reproducible.

## ESLint, Prettier, strict TypeScript, and Node test runner

**ESLint** detects suspicious JavaScript/TypeScript patterns and enforces a small set of correctness
rules. **Prettier** makes formatting deterministic so reviews focus on behavior. **Strict TypeScript**
checks contracts without emitting files at the foundation stage. **Node's built-in test runner** keeps
Phase 0 tests dependency-free; a frontend-focused runner can be introduced when React behavior exists.

They are separate because formatting, static analysis, type checking, and behavioral testing catch
different classes of mistakes. The root `pnpm check` command runs all four.

## VS Code Extension API

**What it does:** A TypeScript extension will observe only the active editor, filename, language ID,
selection, range, and focus-related events allowed by V0.1.

**Why POP uses it:** The official editor API provides structured context directly. This is more precise
and less invasive than screenshots, OCR, global keyboard hooks, or arbitrary filesystem scanning.

**Boundary:** The adapter collects and transmits minimum context; it does not decide final permission
or call an AI provider. Whole-workspace access, terminal access, commands, environment variables, and
credentials remain out of scope.

## Chrome Manifest V3 extension

**What it does:** A TypeScript browser extension will observe selections and focused editable elements
on explicitly approved domains.

**Why POP uses it:** Browser pages are isolated from desktop applications. A Manifest V3 extension is
Chrome's supported model and allows host permissions to be constrained. Structured DOM context is
more accurate and private than screen capture.

**Boundary:** Unknown domains are denied before content is sent. The extension is still treated as an
untrusted client by POP Core, and V0.1 performs no posting or form submission.

## Localhost WebSocket

**What it does:** A WebSocket server bound to `127.0.0.1` will carry versioned real-time messages among
POP Core and the VS Code and Chrome adapters.

**Why POP plans to use it:** Both extension environments support WebSocket clients, messages are
event-driven and bidirectional, and reconnect/heartbeat behavior is straightforward. Binding only to
loopback prevents direct network exposure.

**Security requirements:** Loopback is not authentication. POP Core must require a registration
handshake, validate schemas and message size, verify allowed source/type combinations, rate-limit
clients, and reject unknown protocol versions. A per-install session token or native messaging bridge
will be evaluated before browser context is enabled because web pages must never be able to impersonate
an adapter.

## Zod in TypeScript plus Rust deserialization validation

**What it does:** Zod will validate unknown data in TypeScript clients and packages. Rust will deserialize
into explicit Serde types and apply independent semantic checks.

**Why both are needed:** Each process boundary is a trust boundary. Shared compile-time types improve
development but cannot prove that bytes received over a socket are valid. Defense in depth keeps a
bug or compromised adapter from bypassing core validation.

## HTTPS REST and a provider-neutral AI layer

**What it does:** POP will send deliberate, minimized requests over HTTPS. An `AIProvider` interface
will translate normalized internal requests into a provider's API and normalize its response.

**Why REST:** V0.1 requests are short, user-triggered operations. Ordinary HTTPS is easy to audit,
timeout, cancel, mock, and replace. Streaming may be added behind the same provider boundary if it
materially improves experience.

**Why an abstraction:** Groq with `gpt-oss-20b` is the initial provider/model choice, but permissions,
event rules, and UI must not depend on Groq response shapes. Later providers can be added without
rewriting the product core.

## Groq and `gpt-oss-20b`

**What they do:** Groq hosts the initial language-model endpoint; `gpt-oss-20b` performs concise text
and code explanation and writing improvement.

**Why selected for V0.1:** The master specification chooses Groq as the first hosted provider and values
low-latency interaction. It is an implementation of the provider interface, not a permanent system
dependency. Model availability and exact API details must be verified when Phase 7 begins.

## Git and GitHub Actions

**What they do:** Git records local history. GitHub Actions runs the same deterministic quality checks
on a clean Windows runner.

**Why POP uses them:** Small reviewable changes matter for a security-sensitive application. Windows CI
matches the first supported operating system and catches missing files or machine-specific assumptions.

## Explicitly excluded from V0.1

POP does not use LangChain, agent loops, vector databases, screen recording, OCR, global keylogging,
microphone/camera APIs, long-term memory, autonomous input control, remote telemetry, or a cloud
database. None is necessary to prove the permission-gated event pipeline, and each would enlarge the
privacy, security, and operational surface before the foundation is validated.
