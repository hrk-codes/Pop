# POP Desktop

The Phase 1 desktop shell uses React, TypeScript, Vite, and Tauri 2. It provides a frameless,
always-on-top companion with tiny, compact, and expanded modes, a local monitoring control, accurate
privacy status, and a Windows tray lifecycle.

```powershell
pnpm --filter @pop/desktop dev
pnpm --filter @pop/desktop tauri:dev
```

Monitoring defaults to off on every launch. No context adapter or cloud AI call is connected in this
phase.
