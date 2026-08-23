# Contributing to POP

POP V0.1 is being built one verified phase at a time. Keep changes within the active phase and do
not silently broaden context access or permissions.

## Local checks

```powershell
pnpm install
pnpm check
```

Use focused commits, add tests in proportion to risk, and document security-sensitive decisions.
Never commit `.env`, credentials, user content, or logs containing raw context.
