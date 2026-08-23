# POP

POP is a Windows-first, permission-aware desktop AI companion. V0.1 is deliberately narrow: it will
receive minimum structured context from explicitly authorized VS Code and Chrome integrations, offer
user-invoked assistance, and make cloud activity visible.

This repository currently contains **Phase 0 only**: the monorepo foundation, toolchain configuration,
system boundaries, documentation, and verification scripts. It intentionally contains no desktop
window, monitoring, extensions, or AI calls yet.

## Repository map

```text
apps/                 Runnable products and integration adapters
  desktop/            Future Tauri 2 + React companion
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

## Phase 0 quick start

```powershell
cd 'C:\Users\hrkgh\Agent learn\PoP'
.\scripts\setup.ps1
pnpm check
```

Read [the technology stack](docs/architecture/technology-stack.md) for the reason behind every major
choice and [the Windows setup guide](docs/development/windows.md) for missing Tauri prerequisites.

The [V0.1 completion gate](docs/product/v0.1-completion.md) records the evidence required before V0.2,
and the [V0.2 context model](docs/architecture/v0.2-context-model.md) defines the next architecture
without implementing it prematurely.

## Current status

- Node.js, pnpm, and Git are available on the development machine.
- Rust, Cargo, and Visual Studio C++ Build Tools were not detected during Phase 0 setup.
- Phase 1 should begin only after those native prerequisites are installed and Phase 0 is accepted.
