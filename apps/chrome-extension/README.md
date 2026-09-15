# POP X Adapter

This WXT/Chrome MV3 adapter observes bounded selections and paused drafts only on `x.com`. It prefers
Chrome Native Messaging and falls back to POP's authenticated local loopback bridge when the native
host is unavailable. It never asks the user to pair a rotating code.

```powershell
pnpm --filter @pop/chrome-extension build
.\scripts\register-native-host.ps1
```

Load `apps\chrome-extension\dist\chrome-mv3` through `chrome://extensions`. The committed public key
keeps the local extension ID stable at `fpkepfajehdejjbccjaecmbmdepkaddf`; no private signing key is
stored in the repository.

The toolbar popup is only a connection diagnostic and a **Show POP** shortcut. The adapter sends
nothing unless both Monitoring and X assistance are enabled in POP. Its MV3 worker reconnects on X
messages and through a Chrome alarm, so starting POP after Chrome does not require a new pairing step.
After rebuilding this unpacked adapter, click **Reload** on its extension card and reload the X tab.
It never posts, types, clicks, reads cookies, captures screenshots, or stores raw X content.

X pages use short-lived runtime messages instead of holding a persistent extension port. This keeps
Chrome's back/forward cache compatible and avoids closed-channel errors during X navigation.

After a short stability pause, POP explains selected X text and runs local writing analysis for an
active draft. With selected text still active, Up requests another explanation and Down drafts a
reply. Exact duplicate context is suppressed so an open response is not replaced by connection
heartbeats.
