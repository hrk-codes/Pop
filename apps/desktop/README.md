# POP Desktop

The Phase 1 desktop shell uses React, TypeScript, Vite, and Tauri 2. It provides a frameless,
always-on-top companion with tiny, compact, and expanded modes, accurate build/privacy status, and a
Windows tray lifecycle.

```powershell
pnpm --filter @pop/desktop dev
pnpm --filter @pop/desktop tauri:dev
```

No monitoring adapter, context source, or cloud AI call is connected in this phase. The interface does
not expose a nonfunctional monitoring control.
