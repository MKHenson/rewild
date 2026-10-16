import { smoothstep } from 'rewild-common';

/** The cumulus deck's base and depth in world metres. Mirrors CLOUD_START and
 *  CLOUD_HEIGHT in shaders/sky/skyConstants.wgsl. */
export const CLOUD_START = 500;
export const CLOUD_HEIGHT = 600;
export const CLOUD_TOP = CLOUD_START + CLOUD_HEIGHT;

/** 0..1: how much of the rain falls around an eye at world `y`: all of it
 *  under the deck, thinning through it, and none above it. */
export function rainBelowDeck(y: number): number {
  return 1 - smoothstep(y, CLOUD_START, CLOUD_TOP);
}
