export type Control = { monitoringEnabled: boolean; xEnabled: boolean };

export type LoopbackServerMessage =
  | ({ type: 'CONTROL' } & Control)
  | { type: 'ACK'; messageId: string }
  | { type: 'ERROR'; code: string; message: string };

export const LOOPBACK_URL = 'http://127.0.0.1:32145/v1';
export const LOOPBACK_HEADER = 'pop-extension-v1-fpkepfajehdejjbccjaecmbmdepkaddf';

export async function requestLoopback(
  path: string,
  init?: RequestInit,
): Promise<LoopbackServerMessage> {
  const response = await fetch(`${LOOPBACK_URL}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'X-POP-Bridge': LOOPBACK_HEADER,
      ...init?.headers,
    },
  });
  const value = (await response.json()) as LoopbackServerMessage;
  if (!response.ok) throw new Error(value.type === 'ERROR' ? value.code : 'LOOPBACK_REJECTED');
  return value;
}
