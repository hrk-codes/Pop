# POP

POP is a Windows-first, permission-aware desktop AI companion. V0.1 is deliberately narrow: it will
receive minimum structured context from explicitly authorized VS Code and Chrome integrations, offer
user-invoked assistance, and make cloud activity visible.

The repository now includes the **Phase 1 desktop shell**: a native Tauri window, React interface,
compact and expanded companion modes, a system tray, and truthful local privacy/build status. It does
not collect external context or call an AI provider yet.

## Repository map

```text
apps/                 Runnable products and integration adapters
  desktop/            Runnable Tauri 2 + React companion shell
  vscode-extension/   Future VS Code context adapter
  chrome-extension/   Future Chrome Manifest V3 context adapter
packages/             Reusable, UI-independent domain modules
docs/                 Architecture, development, and product decisions
tests/                 Cross-package integration, security, and fixture data
scripts/               Windows-first setup, build, development, and cleanup helpers
.github/workflows/     Automated quality and security checks
```

The intended dependency direction is from applications into focused shared packages. Permission and
security decisions must never be implemented only in UI components or external adapters.

## Quick start

```powershell
cd 'C:\Users\hrkgh\Agent learn\PoP'
.\scripts\setup.ps1
.\scripts\dev.ps1
```

Read [the technology stack](docs/architecture/technology-stack.md) for the reason behind every major
choice and [the Windows setup guide](docs/development/windows.md) for the verified native environment.

The [V0.1 completion gate](docs/product/v0.1-completion.md) records the evidence required before V0.2,
and the [V0.2 context model](docs/architecture/v0.2-context-model.md) defines the next architecture
without implementing it prematurely.

The [V0.2 completion gate](docs/product/v0.2-completion.md) and
[V0.3 visual-context design](docs/architecture/visual-context.md) record the Phase 26 stability result
and the structured-first visual domain without enabling screen access.

The [V0.4 completion gate](docs/product/v0.4-completion.md) records the missing action-runtime
foundations. The [V0.5 memory design](docs/architecture/memory-system.md) and
[V0.5 scope](docs/product/v0.5-scope.md) define local-first personalization without enabling storage.
Use the [current build verification guide](docs/development/current-build-verification.md) to test only
the behavior that exists today.

## Current status

- Node.js, pnpm, Git, Rust, Cargo, Visual Studio C++ Build Tools, the Windows SDK, and WebView2 are
  available on the development machine.
- The native companion shell compiles as `pop-desktop.exe` and its frontend and state behavior are
  covered by automated checks.
- V0.1 remains incomplete: integrations, permission enforcement, context capture, and AI calls stay
  disabled until their individual phases are implemented and verified.
- V0.2-V0.5 are gated architecture designs, not executable product versions.
