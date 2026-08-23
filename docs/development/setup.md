# Development Setup

## Core tools

| Tool              | Purpose                                           | Check                      |
| ----------------- | ------------------------------------------------- | -------------------------- |
| Git               | Version control and reviewable history            | `git --version`            |
| Node.js           | Runs TypeScript tooling and extension build tools | `node --version`           |
| pnpm              | Installs and links monorepo packages              | `pnpm --version`           |
| VS Code or Cursor | Recommended editor                                | Open the repository folder |

## Native desktop tools

| Tool                      | Purpose                                    | Check                                                    |
| ------------------------- | ------------------------------------------ | -------------------------------------------------------- |
| Rustup/Rust/Cargo         | Compiles the Tauri native application      | `rustup --version`, `rustc --version`, `cargo --version` |
| Visual Studio Build Tools | Provides the MSVC compiler and Windows SDK | Run `vswhere` or inspect Visual Studio Installer         |
| WebView2 Runtime          | Renders the React UI inside Tauri          | Check Windows installed apps                             |

Run the automated preflight and install JavaScript dependencies:

```powershell
cd 'C:\Users\hrkgh\Agent learn\PoP'
.\scripts\setup.ps1
```

Then verify the full workspace and run the desktop shell:

```powershell
pnpm check
.\scripts\dev.ps1
git status --short
```

`pnpm check` formats nothing; it checks formatting, lint rules, strict types, unit tests, Rust formatting,
and a native compile. The workspace is healthy when the command exits successfully and no secret `.env`
file appears in Git status.
