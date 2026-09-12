# POP

POP is a Windows-first, privacy-scoped desktop companion. The current live redesign focuses on one
workflow: understand an authorized selection or unsent draft on X, offer a clear action, generate a
preview, and let the user copy it. POP never posts, clicks, types into X, or sends a reply itself.

## What runs now

- A draggable, always-on-top animated POP character with `56`, `76`, and `104` pixel sizes.
- Operational expressions for resting, attentive, thinking, speaking, success, and blocked states.
- Contextual Explain, Reply, Grammar, Improve, Shorten, Summarize, Previous, Next, and More controls.
- A compact double-click settings menu instead of a large dashboard.
- A separate attached response bubble with streaming, copy, variants, collapse, and close controls.
- An X-only WXT/Chrome MV3 adapter with sensitive-field blocking and short-lived context.
- Chrome Native Messaging through a Windows-secured Rust host; there are no pairing codes.
- Offline grammar correction through Harper and explicit cloud assistance through Groq.
- SQLite preferences and AI audit metadata without raw drafts, selections, or generated responses.

VS Code, Cursor, additional websites, voice, visual capture, tools, and computer actions are deferred
until the X workflow is reliable. The editor package intentionally reports that status instead of
pretending to be connected.

## Architecture

```text
X DOM selection or draft
  -> WXT content script
  -> Chrome service worker
  -> Chrome Native Messaging
  -> pop-native-host.exe
  -> authenticated Windows named pipe
  -> Rust POP Core
  -> local intent/privacy policy
  -> animated React/Tauri surfaces
  -> explicit Harper or Groq request
  -> preview and copy only
```

Rust owns permissions, context acceptance, expiry, credentials, provider access, and persistence.
React projects trusted state and handles visual choreography. Browser text and model output are always
untrusted data and cannot change permissions or gain action authority.

## Start development

```powershell
cd 'C:\Users\hrkgh\Agent learn\PoP'
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\setup.ps1
pnpm check
.\scripts\dev.ps1
```

`dev.ps1` builds the X adapter, registers the native host for the current Windows user, clears stale
development processes, and starts Tauri. Chrome still requires one browser-controlled installation:

1. Open `chrome://extensions` and enable Developer mode.
2. Remove the old POP extension if it is installed.
3. Choose **Load unpacked** and select `apps\chrome-extension\dist\chrome-mv3`.
4. Confirm the extension ID is `fpkepfajehdejjbccjaecmbmdepkaddf`.
5. Reload X once, then enable Monitoring and X assistance from POP's double-click menu.

The Groq key belongs in the ignored root `.env` as `GROQ_API_KEY=...`. On first successful desktop
startup POP migrates it to Windows Credential Manager. Do not commit `.env`.

See [current build verification](docs/development/current-build-verification.md) for the complete
manual test and [technology stack](docs/architecture/technology-stack.md) for engineering rationale.
