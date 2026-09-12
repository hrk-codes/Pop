import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 20);
  status.text = '$(circle-slash) POP editor: later';
  status.tooltip =
    'The live POP redesign is currently scoped to X. Editor assistance returns after the X runtime is stable.';
  status.command = 'pop.sendSelection';
  status.show();
  context.subscriptions.push(
    status,
    vscode.commands.registerCommand('pop.sendSelection', () =>
      vscode.window.showInformationMessage(
        'POP is X-first in this release. The editor adapter is intentionally disabled.',
      ),
    ),
  );
}

export function deactivate(): void {}
