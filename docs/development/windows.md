# Windows Development Prerequisites

The Phase 0 check on 2026-08-23 found Node.js `24.15.0`, pnpm `11.19.0`, and Git
`2.51.0.windows.1`. Rust/Cargo and Visual Studio C++ Build Tools were not detected. WebView2 could not
be confirmed by the automated check.

## Install before Phase 1

1. Install Rust through rustup using the stable MSVC toolchain.
2. Install Visual Studio 2022 Build Tools with **Desktop development with C++**, MSVC build tools, and
   a current Windows SDK.
3. Confirm Microsoft Edge WebView2 Runtime is installed. It is commonly already present on supported
   Windows versions.
4. Restart PowerShell so new PATH entries are visible.

Verify:

```powershell
rustup --version
rustc --version
cargo --version
```

Phase 0 itself does not compile native code, so these missing tools do not invalidate the repository
foundation. They are a hard prerequisite for creating and running the Tauri shell in Phase 1.
