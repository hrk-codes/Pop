# X Adapter Development

The browser adapter uses WXT and Chrome Manifest V3. Its production build is generated at
`apps\chrome-extension\dist\chrome-mv3`.

```powershell
pnpm --filter @pop/chrome-extension typecheck
pnpm --filter @pop/chrome-extension build
.\scripts\register-native-host.ps1
```

Load the generated folder once through `chrome://extensions`. The extension ID is fixed by a public
manifest key. The adapter prefers Chrome Native Messaging and falls back to an authenticated loopback
request when Chrome cannot find the registered native host. The toolbar popup only reports connection
state and can show POP; there is no pairing code.

The fallback accepts only requests carrying POP's installed bridge secret and Chrome's protected
extension-fetch metadata. Ordinary webpage origins, missing metadata, and invalid tokens are rejected.

The content script runs on approved Chrome pages, refreshes the Core-provided monitoring state, waits
for a deliberate selection to stabilize, and sends a bounded semantic snapshot. Editor input and
pasted content are ignored. It never submits forms, automates X, reads browser history or cookies, or
records individual key and pointer events.
