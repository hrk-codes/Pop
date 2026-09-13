# POP Desktop

The executable desktop runtime uses Tauri 2, Rust, React, XState, Motion, SQLite, Harper, and an
optional streaming Groq provider. It renders three focused transparent surfaces: the living avatar,
its attached response bubble, and a compact double-click menu.

Start the complete development runtime from the repository root so the X adapter and native host are
also prepared:

```powershell
.\scripts\dev.ps1
```

Development mode is intentionally owned by that terminal. Use `scripts\build.ps1` followed by
`scripts\start.ps1` for a detached release process that remains in the Windows system tray.

Rust POP Core owns monitoring, X permission, temporary context, provider access, credentials, and
persistence. The React surfaces cannot bypass those decisions. POP generates previews and copies; it
does not automate X or control other applications.
