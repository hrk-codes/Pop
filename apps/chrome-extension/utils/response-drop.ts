export function isPopResponseDrag(types: readonly string[]): boolean {
  return types.includes('application/x-pop-response') && types.includes('text/plain');
}

export function containsPoint(
  rect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>,
  x: number,
  y: number,
): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

export function responseDropEditor(
  editors: readonly HTMLElement[],
  x: number,
  y: number,
): HTMLElement | undefined {
  return editors.find((editor) => {
    const rect = editor.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    if (containsPoint(rect, x, y)) return true;
    const composer = editor.closest<HTMLElement>('[data-testid="inlineReplyComposer"], form');
    if (composer && containsPoint(composer.getBoundingClientRect(), x, y)) return true;
    let parent = editor.parentElement;
    for (let depth = 0; parent && depth < 5; depth++, parent = parent.parentElement) {
      const area = parent.getBoundingClientRect();
      if (area.height > 80 && area.height <= 400 && containsPoint(area, x, y)) return true;
    }
    return false;
  });
}
