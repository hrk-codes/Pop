import { isPopResponseDrag, responseDropEditor } from '../utils/response-drop';

export default defineContentScript({
  matches: ['*://x.com/*', '*://*.x.com/*', '*://twitter.com/*', '*://*.twitter.com/*'],
  runAt: 'document_start',
  main() {
    function editorAt(event: DragEvent): HTMLElement | undefined {
      const editors = [
        ...document.querySelectorAll<HTMLElement>(
          '[data-testid="tweetTextarea_0"][contenteditable="true"], [role="textbox"][contenteditable="true"]',
        ),
      ];
      return responseDropEditor(editors, event.clientX, event.clientY);
    }

    function placeCaret(editor: HTMLElement, x: number, y: number) {
      editor.focus();
      const range = document.caretRangeFromPoint?.(x, y);
      const selection = window.getSelection();
      if (!selection) return;
      if (range && editor.contains(range.startContainer)) {
        selection.removeAllRanges();
        selection.addRange(range);
        return;
      }
      const end = document.createRange();
      end.selectNodeContents(editor);
      end.collapse(false);
      selection.removeAllRanges();
      selection.addRange(end);
    }

    function intercept(event: DragEvent) {
      if (!isPopResponseDrag([...(event.dataTransfer?.types ?? [])])) return;
      event.stopImmediatePropagation();
      const editor = editorAt(event);
      if (event.type === 'dragover') {
        if (editor) event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = editor ? 'copy' : 'none';
      }
      if (event.type !== 'drop') return;
      event.preventDefault();
      const text = event.dataTransfer?.getData('text/plain');
      if (!editor || !text) return;
      placeCaret(editor, event.clientX, event.clientY);
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/plain', text);
      editor.dispatchEvent(
        new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }),
      );
    }

    for (const type of ['dragenter', 'dragover', 'dragleave', 'drop'] as const) {
      window.addEventListener(type, intercept, true);
    }
  },
});
