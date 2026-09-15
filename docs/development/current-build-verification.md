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

This is development behavior, not the packaged application lifecycle. To run POP independently of a
terminal after a successful release build:

```powershell
.\scripts\build.ps1
.\scripts\start.ps1
```

PowerShell may then be closed. Minimize POP from its menu to suspend responses and keep the process in
the system tray. Clicking the tray icon shows POP and resumes the previously enabled monitoring state.

## 2. Install the new X adapter once

1. Open `chrome://extensions` and enable Developer mode.
2. Remove or disable every older POP extension; they use the obsolete pairing protocol.
3. Select **Load unpacked**.
4. Choose `C:\Users\hrkgh\Agent learn\PoP\apps\chrome-extension\dist\chrome-mv3` itself. Do not
   select the `content-scripts` folder inside it; Chrome must see `manifest.json` at the selected root.
5. Verify its ID is `fpkepfajehdejjbccjaecmbmdepkaddf`.
6. Reload any open `x.com` tab.

Whenever the adapter is rebuilt, click **Reload** on its extension card and then reload X. POP's menu
must report **X adapter connected** before an X selection can become context.

There is no pairing code. The extension popup is a small connection diagnostic with a **Show POP**
shortcut; daily permission and assistance controls live in POP. Chrome's one-time extension and
X-access approval cannot be skipped by a desktop application.

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
- Confirm only the mascot is visible; POP must not draw directional buttons or reserve a large
  invisible click area around itself.
- Scroll over POP and confirm the character cycles through 56, 76, and 104 pixels.
- Double-click POP and verify the compact menu opens beside it.
- Turn Monitoring off and confirm POP sleeps.
- Turn Monitoring and X assistance on and confirm the menu shows the intended state.
- Use the minus button beside the menu's close button. Confirm the avatar and response hide, then
  restore POP from the tray icon and confirm monitoring resumes.
- Restart POP and verify its size and position return.

## 5. Test an X draft

1. Open X and begin an unsent post or reply containing a grammar error.
2. Pause briefly after typing.
3. POP should become attentive and automatically show a local writing correction. No arrow controls
   should appear.
4. Click the upper part of the mascot, or press Up while POP has keyboard focus, to run Grammar again.
5. Click the lower part, or press Down while focused, for a Groq rewrite. Right requests Shorten.
6. Copy the preview and confirm POP does not alter or submit the X draft.

## 6. Test a selected post

1. Select text inside an X post.
2. After the selection remains stable briefly, POP should explain the selection automatically. No
   arrow controls should appear.
3. Press Up or Down while the X selection is active: Up requests another explanation and Down drafts
   a reply. The same commands work while POP's avatar or response bubble has keyboard focus. Click the
   upper or lower part of the mascot for the pointer equivalents.
4. Confirm the response closes automatically after its adaptive 10 to 90 second reading period, even when
   the pointer is resting over it. Close and collapse remain available as immediate controls.
5. Collapse the response with its minus button, then click the coral result dot to reopen it.

Selecting text outside an X post should automatically produce an explanation instead of a reply. Its
manual menu contains Explain and Summarize only, preventing an incompatible reply request.

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

If POP is visible but X does not respond, double-click POP and read the status under **X assistance**:

- **Extension bridge offline:** reload the POP extension and then reload X.
- **Connected, waiting for X context:** select post text or type in an active X draft.
- **Source not foreground:** keep Chrome in front until the selection has been recognized.
- **Draft text ready** or **Social post ready:** use a directional action; POP Core has the context.

To remove the local browser bridge completely:

```powershell
.\scripts\unregister-native-host.ps1
```
