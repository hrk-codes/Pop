# Architecture Overview

POP's current executable is a Chrome-reading desktop companion with one authority path.

```text
Approved Chrome or X selection
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
- **Menu surface:** changes monitoring, X, web reading, AI, personality, privacy, and window preferences.
- **POP Core:** makes every security decision and owns accepted temporary context.
- **Chrome adapter:** observes deliberate bounded selections on approved web pages only while Core
  says the relevant switches are enabled; editor input and paste are ignored.
- **Native host:** authenticates Chrome to Core without exposing a localhost web server or user code.
- **Provider layer:** turns explicit normalized tasks into local or remote previews.

React is never an authority. Browser text and model output are never instructions. Disabling monitoring
clears current context; changing route or selection invalidates it; raw content is never durable.

## Current boundary

The runnable release is avatar + selected web/X context + local grammar + explicit Groq preview/copy.
The editor adapter and V0.3-V0.6 visual, action, memory, tool, and workflow designs remain deferred
until this interaction passes manual reliability and privacy gates.
