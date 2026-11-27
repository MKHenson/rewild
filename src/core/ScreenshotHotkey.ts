import { Renderer } from 'rewild-renderer';

const SCREENSHOT_KEY = 'F9';
const UI_SCREENSHOT_KEY = 'F10';

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_` +
    `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
  );
}

/** Saves a PNG of the next frame. With `ui`, the shot includes the UI. */
export async function saveScreenshot(
  renderer: Renderer,
  ui = false
): Promise<void> {
  const blob = await renderer.captureScreenshot({ ui });
  if (!blob) {
    console.error('Screenshot capture failed');
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `rewild_${timestamp()}.png`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Saves a PNG of the canvas on F9, and one with the UI on F10. Returns a
 * function that unbinds the keys.
 */
export function bindScreenshotHotkey(renderer: Renderer): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.repeat) return;
    if (event.code !== SCREENSHOT_KEY && event.code !== UI_SCREENSHOT_KEY)
      return;
    event.preventDefault();
    void saveScreenshot(renderer, event.code === UI_SCREENSHOT_KEY);
  };

  // On the window in the capture phase, so an open menu that takes keys
  // does not stop it.
  window.addEventListener('keydown', onKeyDown, true);
  return () => window.removeEventListener('keydown', onKeyDown, true);
}
