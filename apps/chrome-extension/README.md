# POP Chrome Adapter

This WXT/Chrome MV3 adapter observes deliberate selections on normal HTTP/HTTPS pages and paused
drafts on `x.com`. It prefers Chrome Native Messaging and falls back to POP's authenticated local
loopback bridge when the native host is unavailable. It never asks the user to pair a rotating code.

```powershell
pnpm --filter @pop/chrome-extension build
.\scripts\register-native-host.ps1
```

Load `apps\chrome-extension\dist\chrome-mv3` through `chrome://extensions`. The committed public key
keeps the local extension ID stable at `fpkepfajehdejjbccjaecmbmdepkaddf`; no private signing key is
stored in the repository.

The toolbar popup is only a connection diagnostic and a **Show POP** shortcut. The adapter sends
nothing unless Monitoring and the relevant X or Chrome-reading permission are enabled in POP. Its
MV3 worker reconnects through context messages and a Chrome alarm, so starting POP after Chrome does
not require a new pairing step. After rebuilding this unpacked adapter, click **Reload** on its
extension card and reload the page being tested. It never posts, types, clicks, reads cookies,
captures screenshots, or stores raw page content.

Pages use short-lived runtime messages instead of holding a persistent extension port. This keeps
Chrome's back/forward cache compatible and avoids closed-channel errors during navigation.

After a length-aware stability pause, POP explains selected web text and runs local writing analysis
for an active X draft. Up requests another explanation, Down drafts a response, and Right summarizes.
Outside X, typing is ignored: only an explicit selection becomes context. Known mail, account,
password-manager, payment, and photo surfaces are excluded before the content script starts and are
rejected again by POP Core. Exact duplicate context is suppressed so an open response is not replaced
by connection heartbeats.

Standard DOM selections are supported. Chrome internal pages, image-only documents, browser PDF
viewer text, and canvas-rendered editors may require a later accessibility or manual-capture adapter.
