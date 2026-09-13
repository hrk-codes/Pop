import { invoke } from '@tauri-apps/api/core';
import { LogicalSize, PhysicalPosition } from '@tauri-apps/api/dpi';
import { getCurrentWindow } from '@tauri-apps/api/window';

function available(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function resizeAvatarSurface(size: number): Promise<void> {
  if (!available()) return;
  const current = getCurrentWindow();
  const [position, dimensions, scale] = await Promise.all([
    current.outerPosition(),
    current.outerSize(),
    current.scaleFactor(),
  ]);
  const logical = { width: size + 40, height: size + 40 };
  const center = { x: position.x + dimensions.width / 2, y: position.y + dimensions.height / 2 };
  await current.setSize(new LogicalSize(logical.width, logical.height));
  await current.setPosition(
    new PhysicalPosition(
      Math.round(center.x - (logical.width * scale) / 2),
      Math.round(center.y - (logical.height * scale) / 2),
    ),
  );
}

export async function startWindowDrag(): Promise<void> {
  if (available()) await getCurrentWindow().startDragging();
}

export async function toggleMenu(): Promise<void> {
  if (available()) await invoke('toggle_surface', { label: 'menu' });
}

export async function showSurface(label: 'speech' | 'avatar'): Promise<void> {
  if (available()) await invoke('show_surface', { label });
}

export async function hideSurface(label: 'avatar' | 'speech' | 'menu'): Promise<void> {
  if (available()) await invoke('hide_surface', { label });
}

export async function hideCurrentSurface(): Promise<void> {
  if (available()) await getCurrentWindow().hide();
}
