import { COMPANION_DIMENSIONS, type CompanionMode } from './companion-state';

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function resizeCompanion(mode: CompanionMode): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  const [{ LogicalSize }, { getCurrentWindow }] = await Promise.all([
    import('@tauri-apps/api/dpi'),
    import('@tauri-apps/api/window'),
  ]);
  const dimensions = COMPANION_DIMENSIONS[mode];

  await getCurrentWindow().setSize(new LogicalSize(dimensions.width, dimensions.height));
}

export async function startWindowDrag(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().startDragging();
}

export async function hideCompanion(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().hide();
}
