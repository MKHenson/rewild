import { Renderer } from 'rewild-renderer';
import { SceneCategory } from 'rewild-renderer/lib/materials/IMaterialPass';

const CATEGORIES: SceneCategory[] = ['terrain', 'scatter', 'opaque'];

// Attribution for the scene pass. Terrain, scatter and everything else draw
// through one renderGroupings call in a single render pass, and a GPU timestamp
// can only bracket a whole pass, so there is no way to time them apart. Hiding
// one and reading the `scene` row in the perf panel gives the same answer, and
// on a tile-based GPU it is the better measurement: it includes the overdraw and
// tile pressure that splitting the pass to time it would itself change.
export function registerSceneDebugCommands(renderer: Renderer) {
  (window as any).setSceneCategoryEnabled = (
    category: SceneCategory,
    enabled: boolean
  ) => {
    if (!CATEGORIES.includes(category) || typeof enabled !== 'boolean') {
      const hidden = [...renderer.hiddenSceneCategories];
      console.log(
        `setSceneCategoryEnabled(category, enabled) — category is one of ` +
          `${CATEGORIES.join(' | ')}. Currently hidden: ` +
          `${hidden.length ? hidden.join(', ') : 'none'}.\n` +
          'Hide one and read the gpu · scene row in the perf panel: the drop ' +
          'is what that category was costing.'
      );
      return;
    }

    if (enabled) renderer.hiddenSceneCategories.delete(category);
    else renderer.hiddenSceneCategories.add(category);

    // The window still holds frames drawn the other way, and the whole point is
    // to read the new number.
    renderer.metrics.reset();

    const hidden = [...renderer.hiddenSceneCategories];
    console.log(
      `${category} ${enabled ? 'shown' : 'hidden'}. Hidden: ` +
        `${hidden.length ? hidden.join(', ') : 'none'}. Metrics window cleared.`
    );
  };

  (window as any).showAllSceneCategories = () => {
    renderer.hiddenSceneCategories.clear();
    renderer.metrics.reset();
    console.log('All scene categories shown. Metrics window cleared.');
  };
}
