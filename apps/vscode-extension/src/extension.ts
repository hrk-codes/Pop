import { PROTOCOL_VERSION, type ContextObservation, type ProtocolEnvelope } from '@pop/protocol';
import * as vscode from 'vscode';
import WebSocket from 'ws';

const CORE_URL = 'ws://127.0.0.1:17831';
const TOKEN_KEY = 'pop.sessionToken';
let socket: WebSocket | undefined;
let statusItem: vscode.StatusBarItem;
let pendingContext: ContextObservation | undefined;

function updateStatus(text: string, tooltip: string): void {
  statusItem.text = `$(hubot) POP: ${text}`;
  statusItem.tooltip = tooltip;
  statusItem.show();
}

function sendEnvelope(envelope: ProtocolEnvelope): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(envelope));
}

async function connect(context: vscode.ExtensionContext, pairingCode?: string): Promise<void> {
  socket?.close();
  updateStatus('connecting', 'Connecting to local POP Core');
  socket = new WebSocket(CORE_URL, { maxPayload: 64 * 1024 });

  socket.on('open', async () => {
    const sessionToken = await context.secrets.get(TOKEN_KEY);
    if (!sessionToken && !pairingCode) {
      updateStatus('pair', 'Run POP: Pair with Desktop');
      socket?.close();
      return;
    }

    sendEnvelope({
      version: PROTOCOL_VERSION,
      id: crypto.randomUUID(),
      source: 'VSCODE',
      type: 'REGISTER',
      timestamp: Date.now(),
      payload: sessionToken ? { sessionToken } : { pairingCode: pairingCode! },
    });
  });

  socket.on('message', async (data) => {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(data.toString()) as Record<string, unknown>;
    } catch {
      updateStatus('error', 'POP Core returned invalid data');
      return;
    }

    if (message.type === 'REGISTERED' && typeof message.sessionToken === 'string') {
      await context.secrets.store(TOKEN_KEY, message.sessionToken);
      updateStatus('connected', 'Connected to local POP Core');
      if (pendingContext) {
        sendContext(pendingContext);
        pendingContext = undefined;
      }
    } else if (message.type === 'ACK') {
      updateStatus('connected', 'Context accepted by POP Core');
    } else if (message.type === 'ERROR') {
      updateStatus('blocked', String(message.message ?? 'Request rejected'));
    }
  });
  socket.on('close', () => updateStatus('offline', 'POP Core is not connected'));
  socket.on('error', () => updateStatus('offline', 'Start the POP desktop application'));
}

function selectedCode(): ContextObservation | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) return undefined;
  const text = editor.document.getText(editor.selection).trim();
  if (!text) return undefined;
  return {
    kind: 'SELECTED_CODE',
    text: text.slice(0, 12_000),
    applicationId: 'vscode',
    languageId: editor.document.languageId,
    documentUri: editor.document.uri.toString(),
    title: vscode.workspace.asRelativePath(editor.document.uri),
    observedAt: Date.now(),
  };
}

function sendContext(observation: ContextObservation): void {
  if (socket?.readyState !== WebSocket.OPEN) {
    pendingContext = observation;
    return;
  }
  sendEnvelope({
    version: PROTOCOL_VERSION,
    id: crypto.randomUUID(),
    source: 'VSCODE',
    type: 'CONTEXT',
    timestamp: Date.now(),
    payload: observation,
  });
}

export function activate(context: vscode.ExtensionContext): void {
  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
  statusItem.command = 'pop.pair';
  context.subscriptions.push(statusItem);

  context.subscriptions.push(
    vscode.commands.registerCommand('pop.pair', async () => {
      const pairingCode = await vscode.window.showInputBox({
        title: 'Pair VS Code with POP',
        prompt: 'Enter the six-digit code shown in POP',
        validateInput: (value) => (/^\d{6}$/.test(value) ? undefined : 'Enter six digits.'),
      });
      if (pairingCode) await connect(context, pairingCode);
    }),
    vscode.commands.registerCommand('pop.sendSelection', async () => {
      const observation = selectedCode();
      if (!observation) {
        await vscode.window.showInformationMessage('Select code before sending it to POP.');
        return;
      }
      pendingContext = observation;
      if (socket?.readyState !== WebSocket.OPEN) await connect(context);
      else sendContext(observation);
    }),
  );

  void connect(context);
}

export function deactivate(): void {
  socket?.close();
}
