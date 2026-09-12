# Architecture Overview

POP's current executable is an X-first live desktop companion with one authority path.

```text
X selection or draft
  -> WXT content script
  -> MV3 service worker
  -> Chrome Native Messaging
  -> Rust native host
  -> authenticated named pipe
  -> Rust POP Core
       |-> permission, target, secret, size, and TTL checks
       |-> local Harper grammar
       |-> explicit streaming Groq request
       |-> SQLite metadata and Windows credentials
  -> avatar, menu, and speech Tauri windows
```

## Ownership

- **Avatar surface:** visualizes operational state and exposes contextual actions.
- **Speech surface:** streams, copies, navigates, collapses, and closes temporary results.
- **Menu surface:** changes monitoring, X, AI, personality, privacy, and window preferences.
- **POP Core:** makes every security decision and owns accepted temporary context.
- **X adapter:** observes bounded semantic snapshots only while Core says both switches are enabled.
- **Native host:** authenticates Chrome to Core without exposing a localhost web server or user code.
- **Provider layer:** turns explicit normalized tasks into local or remote previews.

React is never an authority. Browser text and model output are never instructions. Disabling monitoring
clears current context; changing X route or selection invalidates it; raw content is never durable.

## Current boundary

The runnable release is avatar + X context + local grammar + explicit Groq preview/copy. The editor
adapter and V0.3-V0.6 visual, action, memory, tool, and workflow designs remain deferred until this
interaction passes manual reliability and privacy gates.
