# Current Build Verification

This guide tests the executable POP runtime as it exists now. It deliberately separates implemented
assistance from future visual, action, tool, and voice plans.

## 1. Verify and start POP

Open `C:\Users\hrkgh\Agent learn\PoP` in VS Code or Cursor, then run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\setup.ps1
pnpm check
.\scripts\dev.ps1
```

Keep this terminal open. The first Rust build after a clean checkout is slow because Harper's local
language engine compiles once; later starts use Cargo's cache.

## 2. Configure Groq

Local grammar correction does not need a key. Cloud rewrites, replies, explanations, reviews, and
summaries read `GROQ_API_KEY` from the ignored repository-root `.env` file:

```dotenv
GROQ_API_KEY=gsk_your_key_here
```

Never commit `.env`. In POP, open **Connect** and select **Test** beside Groq. POP reports reachability
without displaying the key.

## 3. Pair Chrome

Build the extension with `pnpm --filter @pop/chrome-extension build`. Open
`chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select
`apps\chrome-extension\dist`.

1. In POP, open **Connect** and note the current six-digit code.
2. Open the POP Chrome extension, enter the code, and select **Pair** within five minutes.
3. Enable only the sites on which POP may help. Chrome displays its own permission confirmation.
4. In POP, enable **Monitoring**. The allowed site should also appear enabled under **Platforms**.
5. Reload an already-open allowed tab after changing its permission.

The pairing code changing after successful pairing is intentional: each code can be used once. The
extension stores the returned session token and reconnects with it.

If pairing reports a protocol or validation error, return to `chrome://extensions` and click the
extension's reload icon. Open its popup and confirm it shows `v0.2.1` or newer, then use the pairing
code currently visible in POP. An older cached service worker cannot communicate with protocol v2.

## 4. Test browser writing

On an enabled site, focus a normal text field, type at least three characters, and pause for about one
second. Password, payment, and security-labelled fields are blocked.

Expected behavior:

- A small red POP cue appears beside the field.
- POP shows the platform, temporary draft, and **Check writing** plus **Improve writing** options.
- **Check writing** returns an offline Harper correction and latency without using Groq.
- **Improve writing** sends only the accepted temporary text to Groq after your click.
- **Copy** places the preview on the clipboard; POP never inserts or posts it.

Select page text on X, YouTube, WhatsApp Web, ChatGPT, or Claude to test reply, summary, and explanation
options. Selection availability depends on the site's rendered DOM; POP does not bypass protected UI.

## 5. Pair VS Code or Cursor

Build with `pnpm --filter @pop/vscode-extension build`. For development, open
`apps\vscode-extension` as an Extension Development Host or package/install the extension through the
editor's standard extension workflow.

Run **POP: Pair with Desktop** from the Command Palette and enter POP's current pairing code. Enable
the matching **VS Code** or **Cursor** platform in POP. Select multiple lines and hold the selection for
about one second. POP should offer **Explain code** and **Review code**. Both are explicit Groq calls;
no file is changed.

## 6. Verify personalization

Copy several generated or corrected results. Open **Memory** in POP. It shows only aggregate tone and
coarse response-length preferences with evidence counts. Delete any row with its trash button.

Verify that the database does not expose draft, message, answer, or code content as a learned habit.
Turning monitoring off immediately clears active context.

## Runtime matrix

| Product area         | Status               | Executable behavior                                                         |
| -------------------- | -------------------- | --------------------------------------------------------------------------- |
| Desktop companion    | Implemented          | Always-on-top modes, drag, tray hide/restore                                |
| Permissions          | Implemented          | Monitoring and eight deny-by-default platform switches                      |
| Browser context      | Implemented baseline | Optional sites, drafts, selections, sensitive-field blocks                  |
| Code context         | Implemented baseline | Stable VS Code/Cursor selections                                            |
| Local writing        | Implemented          | Offline Harper spelling and grammar suggestions                             |
| Cloud assistance     | Implemented          | Explicit Groq rewrite, reply, explain, review, summarize                    |
| Context intelligence | Partial              | Deterministic candidates, confidence, expiry; deeper behavior model remains |
| Memory               | Partial              | Derived copy preferences only; no semantic long-term memory                 |
| Visual intelligence  | Not implemented      | No screenshots, OCR, recording, or ambient capture                          |
| Safe actions         | Not implemented      | Preview and copy only; no computer control                                  |
| MCP/tools/workflows  | Not implemented      | Architecture contracts only                                                 |
| Voice                | Not implemented      | Future opt-in feature                                                       |

## Stop POP

Press `Ctrl+C` in the development terminal, then use the POP tray menu's **Quit POP** command if the
window process remains active. Run `.\scripts\cleanup.ps1` before restarting after an interrupted run.
