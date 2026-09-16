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

## 2. Install the Chrome adapter once

1. Open `chrome://extensions` and enable Developer mode.
2. Remove or disable every older POP extension; they use the obsolete pairing protocol.
3. Select **Load unpacked**.
4. Choose `C:\Users\hrkgh\Agent learn\PoP\apps\chrome-extension\dist\chrome-mv3` itself. Do not
   select the `content-scripts` folder inside it; Chrome must see `manifest.json` at the selected root.
5. Verify its ID is `fpkepfajehdejjbccjaecmbmdepkaddf`.
6. Reload any open page where POP will be tested.

Whenever the adapter is rebuilt, click **Reload** on its extension card and then reload the target
page. POP's menu must report **Chrome adapter connected** before a selection can become context.

There is no pairing code. The extension popup is a small connection diagnostic with a **Show POP**
shortcut; daily permission and assistance controls live in POP. Chrome's one-time extension approval
cannot be skipped by a desktop application.

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
- Turn Monitoring on. Enable X assistance for X, and enable Chrome reading for ordinary web pages.
- Use the minus button beside the menu's close button. Confirm the avatar and response hide, then
  restore POP from the tray icon and confirm monitoring resumes.
- Restart POP and verify its size and position return.

## 5. Test X editor privacy

1. Open X and begin an unsent post or reply.
2. Type several words and pause. POP must remain silent.
3. Paste a generated POP response or any other passage into the editor. POP must remain silent and
   must not echo the editor contents in its response bubble.
4. Add more text after the paste and pause again. POP must still remain silent.
5. Deliberately select a specific passage. POP may now explain only that selected passage.
6. Confirm POP never alters or submits the X draft.

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

Changing the selection or X route invalidates the previous context. Password and security-like fields
are rejected before they reach POP Core.

## 7. Test universal Chrome reading

1. Open a normal HTTP/HTTPS documentation or article page, such as IBM documentation or MDN.
2. Double-click POP and enable Monitoring and **Chrome reading**. X assistance is independent.
3. Select a sentence. POP should explain it automatically after a short stability pause.
4. Press Up for a different explanation, Down for a concise grounded response, and Right for a
   summary. The same actions are available under the Chrome reading submenu.
5. Select a passage longer than 1,500 characters. POP should wait about 700 ms before accepting it,
   show its thinking state, and return a source-grounded explanation. Large context remains available
   in memory for five minutes so Down can still produce a follow-up response.
6. Confirm typing or pasting on any website, including X, causes no activity. Only highlighted text
   is observed.
7. Open Gmail, Outlook, a Google account page, a password manager, PayPal, or Google Photos. POP must
   not accept page context there even when Chrome reading is enabled.

The current adapter supports standard selectable DOM text. Chrome internal pages, the built-in PDF
viewer, image-only documents, and canvas-rendered editors may not expose a usable selection.

## 8. Test an X conversation

1. Open a status page containing a root post, another person's reply, your response, and that
   person's newest response.
2. Select the visible thread from the root through the newest other-person response. The final
   selected turn must not be your own.
3. POP should identify `conversation ready` and explain the discussion as a whole.
4. Press Down. The draft must answer the final other-person response while respecting what was
   already said; it must not summarize the root or repeat your previous response.
5. Press Up for a fresh explanation and Right for a thread summary.
6. Paste the generated reply into X. POP must remain silent because editor input and paste are
   ignored.
7. For a long thread, confirm the root and newest turn remain represented while an older middle may
   be marked as omitted locally.

## 9. Expected boundaries

POP may read deliberate selections when the relevant X assistance or Chrome reading permission is
enabled. It may run a policy-matched task, then display and copy a preview. It does not observe editor
input or pasted content.

POP must not click, type, post, follow, like, delete, inspect unrelated tabs, read cookies, capture the
screen, or save raw page content. VS Code, Cursor, voice, tools, memory, and actions remain outside
this release.

## 10. Stop or repair

Press `Ctrl+C` in the development terminal. If a previous run was interrupted:

```powershell
.\scripts\cleanup.ps1
.\scripts\dev.ps1
```

If POP is visible but a page does not respond, double-click POP and read the relevant X assistance or
Chrome reading status:

- **Extension bridge offline:** reload the POP extension and then reload the target page.
- **Connected, waiting for context:** select visible text on an approved page.
- **Source not foreground:** keep Chrome in front until the selection has been recognized.
- **Social post ready** or another selected-text status: use a directional action; POP Core has the
  context.

To remove the local browser bridge completely:

```powershell
.\scripts\unregister-native-host.ps1
```
