import { describe, expect, it } from 'vitest';

import { containsPoint, isPopResponseDrag, responseDropEditor } from './response-drop';

describe('POP response drops', () => {
  it('intercepts only marked text drags', () => {
    expect(isPopResponseDrag(['application/x-pop-response', 'text/plain'])).toBe(true);
    expect(isPopResponseDrag(['text/plain'])).toBe(false);
    expect(isPopResponseDrag(['Files', 'text/plain'])).toBe(false);
  });

  it('accepts a point on the editor or its reply composer', () => {
    const editorRect = { left: 20, right: 120, top: 20, bottom: 40 };
    const composerRect = { left: 10, right: 130, top: 10, bottom: 120 };
    const editor = {
      getBoundingClientRect: () => ({ ...editorRect, width: 100, height: 20 }),
      closest: () => ({ getBoundingClientRect: () => composerRect }),
    } as unknown as HTMLElement;
    expect(responseDropEditor([editor], 30, 30)).toBe(editor);
    expect(responseDropEditor([editor], 30, 80)).toBe(editor);
    expect(responseDropEditor([editor], 200, 80)).toBeUndefined();
    expect(containsPoint(composerRect, 10, 120)).toBe(true);
  });

  it('finds a bounded reply area without expanding to the whole page', () => {
    const replyArea = {
      getBoundingClientRect: () => ({ left: 10, right: 130, top: 10, bottom: 180, height: 170 }),
      parentElement: null,
    };
    const editor = {
      getBoundingClientRect: () => ({
        left: 20,
        right: 120,
        top: 20,
        bottom: 40,
        width: 100,
        height: 20,
      }),
      closest: () => null,
      parentElement: replyArea,
    } as unknown as HTMLElement;
    expect(responseDropEditor([editor], 30, 100)).toBe(editor);
    expect(responseDropEditor([editor], 30, 400)).toBeUndefined();
  });
});
