import { Renderer } from 'rewild-renderer';
import { ViewportEventDetails } from '../EditorViewport';

const details = { renderer: null } as ViewportEventDetails;
const event = new CustomEvent('request-renderer', {
  detail: details,
});

export function getActiveRenderer(): Renderer | null {
  document.dispatchEvent(event);
  return event.detail.renderer;
}
