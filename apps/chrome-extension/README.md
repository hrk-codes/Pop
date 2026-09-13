# POP X Adapter

This WXT/Chrome MV3 adapter observes bounded selections and paused drafts only on `x.com`. It connects
to POP through Chrome Native Messaging and has no popup or pairing code.

```powershell
pnpm --filter @pop/chrome-extension build
.\scripts\register-native-host.ps1
```

Load `apps\chrome-extension\dist\chrome-mv3` through `chrome://extensions`. The committed public key
keeps the local extension ID stable at `fpkepfajehdejjbccjaecmbmdepkaddf`; no private signing key is
stored in the repository.

The adapter sends nothing unless both Monitoring and X assistance are enabled in POP. Its MV3 worker
reconnects on X messages and through a Chrome alarm, so starting POP after Chrome does not require a
new pairing step. After rebuilding this unpacked adapter, click **Reload** on its extension card and
reload the X tab. It never posts, types, clicks, reads cookies, captures screenshots, or stores raw X
content.
