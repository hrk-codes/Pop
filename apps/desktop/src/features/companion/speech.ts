export interface SpeechDimensions {
  width: number;
  height: number;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

export function speechDimensions(text: string): SpeechDimensions {
  const characters = [...text.trim()].length;
  const width = characters <= 90 ? 286 : characters <= 320 ? 356 : characters <= 720 ? 430 : 500;
  const charactersPerLine = Math.max(24, Math.floor((width - 52) / 7.4));
  const lines = Math.max(
    1,
    text.split(/\r?\n/).reduce((count, paragraph) => {
      return count + Math.max(1, Math.ceil([...paragraph].length / charactersPerLine));
    }, 0),
  );
  const textHeight = lines * 23;
  const height = clamp(30 + textHeight + 48, 118, 680);

  return { width, height };
}
