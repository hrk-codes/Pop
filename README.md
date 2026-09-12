# POP

POP is a Windows-first, permission-scoped desktop companion. It stays available as a draggable Tauri
window and tray app, accepts short-lived structured context from explicitly paired Chrome and code
editor adapters, and offers local or user-invoked cloud assistance. POP suggests and copies; it does
not click, type, post, send, delete, or execute computer actions.

## What runs today

- Tauri 2 + Rust core with a React companion in tiny, compact, and expanded modes.
- Deny-by-default monitoring and per-platform controls for X, Google, YouTube, WhatsApp Web, ChatGPT,
  Claude, VS Code, and Cursor.
- Authenticated versioned loopback adapters with expiring one-time pairing codes.
- Chrome Manifest V3 optional site permissions, password-field blocking, stable draft detection,
  selected-page context, and an inline POP cue.
- Automatic stable code selection from the VS Code/Cursor extension.
- Offline English spelling and grammar correction through Harper.
- Explicit Groq assistance for rewriting, reply drafts, explanations, reviews, and summaries.
- Temporary context with foreground-target checks, secret detection, size bounds, and expiry.
- Local aggregate preference learning from copied result tone and length, with visible deletion.

Visual capture, voice, arbitrary tools, browser automation, posting, and computer control are not
implemented. The V0.3-V0.6 architecture documents remain design boundaries, not shipped authority.

## Repository map

```text
apps/desktop/            Tauri/Rust core and React companion
apps/chrome-extension/   Permission-scoped browser adapter
apps/vscode-extension/   VS Code and Cursor selection adapter
packages/                Shared protocol, policy, context, event, AI, and security contracts
docs/                    Architecture, product decisions, and test guides
scripts/                 Windows setup, development, build, and cleanup helpers
```

## Quick start

```powershell
cd 'C:\Users\hrkgh\Agent learn\PoP'
.\scripts\setup.ps1
pnpm check
.\scripts\dev.ps1
```

Then follow the [current build verification guide](docs/development/current-build-verification.md) to
pair the adapters and test each implemented workflow. See
[the technology stack](docs/architecture/technology-stack.md) for the engineering rationale and
[the product roadmap](docs/product/roadmap.md) for the staged direction.

## Security boundary

React is a projection of trusted state. Rust owns permission decisions, context acceptance, local
persistence, provider access, and secret screening. Adapters are untrusted inputs. Webpage text and AI
output can inform a preview but cannot change permissions or gain action authority.
