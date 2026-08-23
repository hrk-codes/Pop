# VS Code Extension Development

Implementation begins in Phase 5, after the local protocol server exists. The extension will be a
separate TypeScript application under `apps/vscode-extension`.

Its initial data boundary is the active editor's filename, language ID, selected text, selection range,
and editor focus state. Events will be debounced and sent through validated protocol messages. It will
not inspect the workspace, terminal, environment, credentials, or arbitrary files.
