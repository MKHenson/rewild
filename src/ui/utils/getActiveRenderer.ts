import { Renderer } from 'rewild-renderer';

interface RendererRequestDetail {
  renderer: Renderer | null;
}

const details: RendererRequestDetail = { renderer: null };
const event = new CustomEvent('request-renderer', {
  detail: details,
});

/**
 * The renderer of the mounted viewport — editor or game — or null when neither
 * is up (the main menu).
 */
export function getActiveRenderer(): Renderer | null {
  // Cleared first: nothing is listening when no viewport is mounted, so a stale
  // renderer from a previous session would otherwise be returned unchanged.
  details.renderer = null;
  document.dispatchEvent(event);
  return details.renderer;
}
