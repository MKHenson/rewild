import { QualitySettings } from 'rewild-renderer/lib/utils/QualitySettings';
import { getActiveRenderer } from './getActiveRenderer';

/**
 * The QualitySettings the settings UI should read and write.
 *
 * Prefers the mounted viewport's, so a change lands on the frames being drawn
 * right now. From the main menu there is no renderer, so it falls back to a
 * standalone instance — both are backed by the same localStorage, and a Renderer
 * restores from it on construction, so a setting made from the menu is picked up
 * when the game starts.
 *
 * The fallback is deliberately not cached. An instance kept between visits to
 * the menu would go stale the moment a game session changed the level through
 * its own renderer; constructing one reads back the shared truth.
 */
export function getQualitySettings(): QualitySettings {
  return getActiveRenderer()?.quality ?? new QualitySettings();
}
