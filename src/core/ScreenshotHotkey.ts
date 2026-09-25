import { Renderer } from 'rewild-renderer';

const SCREENSHOT_KEY = 'F9';

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_` +
    `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
  );
}

export async function saveScreenshot(renderer: Renderer): Promise<void> {
  const blob = await renderer.captureScreenshot();
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

/** Saves a PNG of the canvas on F9. Returns a function that unbinds the key. */
export function bindScreenshotHotkey(renderer: Renderer): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.code !== SCREENSHOT_KEY || event.repeat) return;
    event.preventDefault();
    void saveScreenshot(renderer);
  };

  document.addEventListener('keydown', onKeyDown);
  return () => document.removeEventListener('keydown', onKeyDown);
}
