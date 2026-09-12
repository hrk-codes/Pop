# X Adapter Development

The browser adapter uses WXT and Chrome Manifest V3. Its production build is generated at
`apps\chrome-extension\dist\chrome-mv3`.

```powershell
pnpm --filter @pop/chrome-extension typecheck
pnpm --filter @pop/chrome-extension build
.\scripts\register-native-host.ps1
```

Load the generated folder once through `chrome://extensions`. The extension ID is fixed by a public
manifest key, allowing Chrome Native Messaging to restrict the local host to this adapter. There is no
popup, localhost socket, pairing code, or reusable browser token.

The content script runs only on X, checks the Core-provided monitoring state, waits for a stable draft
or selection, rejects sensitive fields, and sends a bounded semantic snapshot. It never submits forms,
automates X, reads browser history or cookies, or records individual key and pointer events.
