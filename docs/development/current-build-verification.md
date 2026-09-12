# Current Live Build Verification

## 1. Prepare and launch

```powershell
cd 'C:\Users\hrkgh\Agent learn\PoP'
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\setup.ps1
pnpm check
.\scripts\dev.ps1
```

Keep the last terminal open. It owns Vite, Tauri, and the Rust POP Core. `dev.ps1` also builds the WXT
adapter and registers `pop-native-host.exe` under the current Windows account.

## 2. Install the new X adapter once

1. Open `chrome://extensions` and enable Developer mode.
2. Remove or disable every older POP extension; they use the obsolete pairing protocol.
3. Select **Load unpacked**.
4. Choose `C:\Users\hrkgh\Agent learn\PoP\apps\chrome-extension\dist\chrome-mv3`.
5. Verify its ID is `fpkepfajehdejjbccjaecmbmdepkaddf`.
6. Reload any open `x.com` tab.

There is no extension popup and no pairing code. Chrome's one-time extension and X-access approval
cannot be skipped by a desktop application. After installation, daily controls live in POP.

## 3. Configure AI

Harper grammar correction is local and needs no key. Put Groq development configuration in the ignored
root `.env` file:

```dotenv
GROQ_API_KEY=gsk_your_key_here
GROQ_TEXT_MODEL=openai/gpt-oss-20b
```

Restart POP once. The key is migrated into Windows Credential Manager. Double-click POP, open **AI**,
and choose **Check Groq**. The menu reports status without showing the key.

## 4. Test the companion itself

- Drag the character from its body and confirm it stays where released.
- Scroll over POP and confirm the character cycles through 56, 76, and 104 pixels.
- Double-click POP and verify the compact menu opens beside it.
- Turn Monitoring off and confirm POP sleeps.
- Turn Monitoring and X assistance on and confirm the menu shows the intended state.
- Hide POP through **App** or the tray, then restore it from the tray icon.
- Restart POP and verify its size and position return.

## 5. Test an X draft

1. Open X and begin an unsent post or reply containing a grammar error.
2. Pause for about half a second.
3. POP should become attentive and reveal Grammar, Improve, Shorten, and More.
4. Choose **Grammar** and verify the attached bubble returns a local correction.
5. Choose **Improve** and verify Groq text streams into the bubble.
6. Copy the preview and confirm POP does not alter or submit the X draft.

## 6. Test a selected post

1. Select text inside an X post.
2. POP should reveal Explain, Reply, Summarize, and More.
3. Generate a reply, then use Left and Right for previous and next variants.
4. Leave the bubble untouched for ten seconds; it should collapse to the coral result dot.
5. Click the dot to reopen the answer.

Changing the selection or X route invalidates the previous context. Context also expires after 90
seconds. Password and security-like fields are rejected before they reach POP Core.

## 7. Expected boundaries

POP may read only approved X selections and active draft snapshots while both switches are on. It may
run local grammar or an explicitly requested Groq task. It may display and copy a preview.

POP must not click, type, post, follow, like, delete, inspect unrelated tabs, read cookies, capture the
screen, or save raw X content. VS Code, Cursor, other websites, voice, tools, memory, and actions remain
outside this release.

## 8. Stop or repair

Press `Ctrl+C` in the development terminal. If a previous run was interrupted:

```powershell
.\scripts\cleanup.ps1
.\scripts\dev.ps1
```

To remove the local browser bridge completely:

```powershell
.\scripts\unregister-native-host.ps1
```
