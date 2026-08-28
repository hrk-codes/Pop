# Current Build Verification

This guide tests the repository POP actually contains today. The runnable product is the V0.1 Phase 1
desktop shell. V0.2-V0.5 documents describe gated architecture and should not appear as working
features in the application.

## 1. Open the repository

In Cursor, choose **File > Open Folder** and select:

```text
C:\Users\hrkgh\Agent learn\PoP
```

Open a PowerShell terminal in Cursor and confirm the location:

```powershell
cd 'C:\Users\hrkgh\Agent learn\PoP'
git status --short --branch
```

Expected: branch `main`. Review any listed files before continuing; do not discard changes you intend
to keep.

## 2. Install and validate

On this development machine the Windows toolchain is already installed. For a clean checkout, run:

```powershell
.\scripts\setup.ps1
pnpm check
```

`pnpm check` must pass Prettier, ESLint, strict TypeScript, four unit tests, the frontend production
build, Rust formatting, and `cargo check`.

## 3. Start working mode

```powershell
.\scripts\dev.ps1
```

The first native build can take several minutes. Keep the terminal open. Success includes:

```text
VITE ready
Running target\debug\pop-desktop.exe
```

Press `Ctrl+C` in that terminal to stop development mode.

## 4. Verify the desktop shell

Perform these checks in order:

| Check         | Action                            | Expected result                                  |
| ------------- | --------------------------------- | ------------------------------------------------ |
| Launch        | Start development mode            | A window titled `POP` appears                    |
| Compact mode  | Observe the initial surface       | Stable compact companion, no loading shift       |
| Expand        | Use the expand control            | Expanded panel opens at its fixed dimensions     |
| Collapse      | Use the compact control           | Companion returns to compact mode                |
| Tiny mode     | Use the smallest mode control     | Small always-on-top companion remains usable     |
| Drag          | Drag from the window drag surface | Frameless window moves normally                  |
| Overview      | Open the Overview tab             | Working and design-only boundaries are explicit  |
| Privacy panel | Open the Privacy tab              | It reports no app, screen, or cloud access       |
| Close         | Click the window close control    | Window hides; process remains in the system tray |
| Restore       | Left-click the POP tray icon      | Window becomes visible and focused               |
| Tray commands | Test Show, Hide, and Quit         | Each command performs only the named operation   |

## 5. Verify privacy boundaries

While testing the current shell, the following must remain true:

- POP does not read VS Code, Chrome, windows, the clipboard, screenshots, or files.
- POP does not send a Groq request; `GROQ_API_KEY` is not consumed by runtime code yet.
- Restarting POP resets the companion mode.
- There is no SQLite database, memory center, remembered preference, action proposal, or executor.
- Closing to the tray does not start background monitoring; no monitoring adapter exists.

## 6. What each version currently means

| Version | Intended capability        | Runnable today | Honest verification                               |
| ------- | -------------------------- | -------------- | ------------------------------------------------- |
| V0.1    | Sense and assist           | Phase 1 only   | Window, modes, tray, local UI state               |
| V0.2    | Context intelligence       | No             | Read design and blocked completion gate           |
| V0.3    | Visual intelligence        | No             | Read design; verify no capture implementation     |
| V0.4    | Safe computer actions      | No             | Read completion gate; verify no action executors  |
| V0.5    | Memory and personalization | No             | Read Phase 82 design; verify no persistent memory |

## 7. Production executable

After the quality gate passes, build and launch the release executable:

```powershell
.\scripts\build.ps1
Start-Process '.\apps\desktop\src-tauri\target\release\pop-desktop.exe'
```

The production shell should match the development behavior without the Vite terminal. Quit it from the
POP tray menu when testing is complete.

## Acceptance rule

POP is working as currently implemented when every shell check passes and every unavailable feature
remains truthfully unavailable. To make POP work as the full V0.1-V0.5 vision, development must resume
at V0.1 Phase 2 rather than skipping directly to memory persistence.
