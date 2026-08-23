# Windows Development Environment

The Phase 1 check on 2026-08-23 found Node.js `24.15.0`, pnpm `11.19.0`, Git
`2.51.0.windows.1`, Rust/Cargo `1.98.0`, Visual Studio Build Tools 2022 `17.14.39`, Windows SDK
`10.0.26100.0`, and WebView2 `151.0.4129.101`.

## Required components

1. Install Rust through rustup using the stable MSVC toolchain.
2. Install Visual Studio 2022 Build Tools with **Desktop development with C++**, MSVC build tools, and
   a current Windows SDK.
3. Confirm Microsoft Edge WebView2 Runtime is installed. It is commonly already present on supported
   Windows versions.
4. Restart PowerShell so new PATH entries are visible. The repository scripts also add
   `%USERPROFILE%\.cargo\bin` for shells opened before rustup was installed.

Verify:

```powershell
rustup --version
rustc --version
cargo --version
```

Run the desktop companion with `./scripts/dev.ps1`. Produce an optimized native executable with
`./scripts/build.ps1`. The build script currently skips installer packaging while the product remains
in active V0.1 development.
