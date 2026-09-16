export interface SpeechDimensions {
  width: number;
  height: number;
}

export const SPEECH_CONTENT_INSET = 58;

const DRAG_PREVIEW_LIMIT = 120;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

export function preferredSpeechWidth(text: string): number {
  const characters = [...text.trim()].length;
  return characters <= 72 ? 292 : characters <= 260 ? 360 : characters <= 680 ? 424 : 488;
}

export function responseDragPreview(text: string): string {
  const compact = text.trim().replace(/\s+/g, ' ');
  if (compact.length <= DRAG_PREVIEW_LIMIT) return compact;
  return `${compact.slice(0, DRAG_PREVIEW_LIMIT - 3).trimEnd()}...`;
}

export function speechDimensions(text: string, measuredTextHeight?: number): SpeechDimensions {
  const width = preferredSpeechWidth(text);
  const charactersPerLine = Math.max(24, Math.floor((width - SPEECH_CONTENT_INSET) / 7.2));
  const lines = Math.max(
    1,
    text.split(/\r?\n/).reduce((count, paragraph) => {
      return count + Math.max(1, Math.ceil([...paragraph].length / charactersPerLine));
    }, 0),
  );
  const textHeight = measuredTextHeight && measuredTextHeight > 0 ? measuredTextHeight : lines * 23;
  const height = clamp(Math.ceil(textHeight + 84), 128, 680);

  return { width, height };
}
