import 'rewild-ui/compiler/jsx';
import { InfoBox, Input, Modal, Select } from 'rewild-ui';
import {
  ARID_CLIMATE_PRESET,
  DEFAULT_CLIMATE_PRESET,
} from 'rewild-renderer/lib/renderers/terrain/Biomes';
import { TerrainSettingsDialog } from './TerrainSettingsDialog';
import { projectStore } from '../../../stores/ProjectStore';
import { db } from 'src/database/database';

interface FakeTerrainRenderer {
  seed: number;
  climatePreset: string;
  seaLevel: number;
  reset: jest.Mock;
}

let terrainRenderer: FakeTerrainRenderer;

// getActiveRenderer asks the mounted viewport via this event.
const provideRenderer = (e: Event) => {
  (e as CustomEvent).detail.renderer = { terrainRenderer };
};

function setProject(terrain?: {
  seed: number;
  climatePreset?: string;
  seaLevel?: number;
}) {
  projectStore.project = {
    levelId: 'level-1',
    sceneGraph: {
      terrain: terrain ? { version: 1, ...terrain } : undefined,
    },
  } as never;
}

// Mounted so the Modal renders its own Apply/Cancel buttons and the tests go
// through its real onOk → onClose sequence.
function createDialog(onClose = jest.fn()) {
  const comp = new TerrainSettingsDialog();
  comp._props = { onClose } as never;
  comp._createRenderer();
  document.body.appendChild(comp);
  return { comp, onClose };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function getModal(comp: TerrainSettingsDialog): Modal {
  return comp.shadow!.querySelector('x-modal') as Modal;
}

function getInputs(comp: TerrainSettingsDialog): Input[] {
  return Array.from(comp.shadow!.querySelectorAll('x-input')) as Input[];
}

function getSelect(comp: TerrainSettingsDialog): Select {
  return comp.shadow!.querySelector('x-select') as Select;
}

function findButton(root: ParentNode, label: string): HTMLElement | undefined {
  return Array.from(root.querySelectorAll('x-button')).find(
    (b) => b.textContent?.trim() === label
  ) as HTMLElement | undefined;
}

function clickApply(comp: TerrainSettingsDialog) {
  findButton(getModal(comp).shadow!, 'Apply')!.click();
}

function getWarning(comp: TerrainSettingsDialog): Element | null {
  return comp.shadow!.querySelector('.warning');
}

function getWarningTitle(comp: TerrainSettingsDialog): string | undefined {
  const box = getWarning(comp)?.querySelector('x-info-box') as
    | InfoBox
    | undefined;
  return box?.props.title as string | undefined;
}

describe('TerrainSettingsDialog', () => {
  let clearLevelChunks: jest.SpyInstance;

  beforeEach(() => {
    terrainRenderer = {
      seed: 7,
      climatePreset: DEFAULT_CLIMATE_PRESET,
      seaLevel: 0,
      reset: jest.fn(),
    };
    document.addEventListener('request-renderer', provideRenderer);
    clearLevelChunks = jest
      .spyOn(db, 'clearLevelChunks')
      .mockResolvedValue(undefined);
    projectStore.dirty = false;
    setProject({ seed: 42, climatePreset: DEFAULT_CLIMATE_PRESET, seaLevel: 3 });
  });

  afterEach(() => {
    document.removeEventListener('request-renderer', provideRenderer);
    document.body.innerHTML = '';
    projectStore.project = null;
    jest.restoreAllMocks();
  });

  describe('initial values', () => {
    it('fills the fields from the saved terrain settings', () => {
      const { comp } = createDialog();
      const [seed, seaLevel] = getInputs(comp);
      expect(seed.props.value).toBe('42');
      expect(seaLevel.props.value).toBe('3');
      expect(getSelect(comp).props.value).toBe(DEFAULT_CLIMATE_PRESET);
    });

    it('falls back to the default climate and sea level 0', () => {
      setProject({ seed: 5 });
      const { comp } = createDialog();
      expect(getSelect(comp).props.value).toBe(DEFAULT_CLIMATE_PRESET);
      expect(getInputs(comp)[1].props.value).toBe('0');
    });

    it('lists every climate preset', () => {
      const { comp } = createDialog();
      const values = getSelect(comp).props.options.map((o) => o.value);
      expect(values).toContain(DEFAULT_CLIMATE_PRESET);
      expect(values).toContain(ARID_CLIMATE_PRESET);
    });

    it('shows no warning banner', () => {
      const { comp } = createDialog();
      expect(getWarning(comp)).toBeNull();
    });
  });

  describe('Apply', () => {
    it('closes without a confirmation when nothing changed', () => {
      const { comp, onClose } = createDialog();
      clickApply(comp);
      expect(onClose).toHaveBeenCalled();
      expect(clearLevelChunks).not.toHaveBeenCalled();
    });

    it('stays open and asks to regenerate when the climate changed', async () => {
      const { comp, onClose } = createDialog();
      getSelect(comp).props.onChange!(ARID_CLIMATE_PRESET);
      await flush();

      clickApply(comp);
      await flush();

      expect(onClose).not.toHaveBeenCalled();
      expect(getWarningTitle(comp)).toBe('Regenerate terrain?');
      expect(getModal(comp).props.hideConfirmButtons).toBe(true);
    });

    it('asks to regenerate when the seed changed', async () => {
      const { comp } = createDialog();
      getInputs(comp)[0].props.onChange!('99');
      clickApply(comp);
      await flush();
      expect(getWarningTitle(comp)).toBe('Regenerate terrain?');
    });

    it('asks to regenerate when the sea level changed', async () => {
      const { comp } = createDialog();
      getInputs(comp)[1].props.onChange!('-12.5');
      clickApply(comp);
      await flush();
      expect(getWarningTitle(comp)).toBe('Regenerate terrain?');
    });

    it('does nothing for a seed that is not a number', async () => {
      const { comp } = createDialog();
      getInputs(comp)[0].props.onChange!('abc');
      clickApply(comp);
      await flush();
      expect(getWarning(comp)).toBeNull();
      expect(clearLevelChunks).not.toHaveBeenCalled();
    });

    it('does nothing for a sea level that is not a number', async () => {
      const { comp } = createDialog();
      getInputs(comp)[1].props.onChange!('deep');
      clickApply(comp);
      await flush();
      expect(getWarning(comp)).toBeNull();
    });
  });

  describe('confirming a regenerate', () => {
    async function applyAndConfirm(comp: TerrainSettingsDialog) {
      clickApply(comp);
      await flush();
      findButton(getWarning(comp)!, 'Regenerate')!.click();
      await flush();
    }

    it('clears the level chunks and saves the new settings', async () => {
      const { comp, onClose } = createDialog();
      getInputs(comp)[0].props.onChange!('99');
      getInputs(comp)[1].props.onChange!('-4');
      getSelect(comp).props.onChange!(ARID_CLIMATE_PRESET);
      await flush();

      await applyAndConfirm(comp);

      expect(clearLevelChunks).toHaveBeenCalledWith('level-1');
      expect(projectStore.project!.sceneGraph.terrain).toEqual({
        version: 1,
        seed: 99,
        climatePreset: ARID_CLIMATE_PRESET,
        seaLevel: -4,
      });
      expect(projectStore.dirty).toBe(true);
      expect(onClose).toHaveBeenCalled();
    });

    it('pushes the climate and sea level to the renderer before resetting it', async () => {
      const seen: { climate: string; seaLevel: number }[] = [];
      const { comp } = createDialog();
      terrainRenderer.reset.mockImplementation(() =>
        seen.push({
          climate: terrainRenderer.climatePreset,
          seaLevel: terrainRenderer.seaLevel,
        })
      );
      getSelect(comp).props.onChange!(ARID_CLIMATE_PRESET);
      getInputs(comp)[1].props.onChange!('8');
      await flush();

      await applyAndConfirm(comp);

      expect(terrainRenderer.reset).toHaveBeenCalledWith(42, expect.anything());
      expect(seen).toEqual([{ climate: ARID_CLIMATE_PRESET, seaLevel: 8 }]);
    });

    it('keeps the dialog open when clearing the chunks fails', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      clearLevelChunks.mockRejectedValue(new Error('offline'));
      const { comp, onClose } = createDialog();
      getInputs(comp)[0].props.onChange!('99');

      await applyAndConfirm(comp);

      expect(onClose).not.toHaveBeenCalled();
      expect(terrainRenderer.reset).not.toHaveBeenCalled();
      expect(findButton(getWarning(comp)!, 'Regenerate')).toBeDefined();
    });
  });

  describe('the warning banner', () => {
    it('Cancel dismisses it without regenerating', async () => {
      const { comp, onClose } = createDialog();
      getInputs(comp)[0].props.onChange!('99');
      clickApply(comp);
      await flush();

      findButton(getWarning(comp)!, 'Cancel')!.click();
      await flush();

      expect(getWarning(comp)).toBeNull();
      expect(clearLevelChunks).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('stops a backdrop close while it is showing', async () => {
      const { comp, onClose } = createDialog();
      getInputs(comp)[0].props.onChange!('99');
      clickApply(comp);
      await flush();

      getModal(comp).props.onClose!();
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('Reset saved terrain', () => {
    async function resetAndConfirm(comp: TerrainSettingsDialog) {
      findButton(comp.shadow!, 'Reset saved terrain')!.click();
      await flush();
      findButton(getWarning(comp)!, 'Reset terrain')!.click();
      await flush();
    }

    it('asks for confirmation first', async () => {
      const { comp } = createDialog();
      findButton(comp.shadow!, 'Reset saved terrain')!.click();
      await flush();
      expect(getWarningTitle(comp)).toBe('Reset saved terrain?');
      expect(clearLevelChunks).not.toHaveBeenCalled();
    });

    it('rebuilds from the saved settings, ignoring unapplied edits', async () => {
      const { comp, onClose } = createDialog();
      getInputs(comp)[0].props.onChange!('99');
      getSelect(comp).props.onChange!(ARID_CLIMATE_PRESET);
      await flush();

      await resetAndConfirm(comp);

      expect(clearLevelChunks).toHaveBeenCalledWith('level-1');
      expect(terrainRenderer.climatePreset).toBe(DEFAULT_CLIMATE_PRESET);
      expect(terrainRenderer.seaLevel).toBe(3);
      expect(terrainRenderer.reset).toHaveBeenCalledWith(42, expect.anything());
      expect(projectStore.project!.sceneGraph.terrain!.seed).toBe(42);
      expect(onClose).toHaveBeenCalled();
    });

    it("uses the renderer's seed when the project has no terrain saved", async () => {
      setProject();
      const { comp } = createDialog();
      await resetAndConfirm(comp);
      expect(terrainRenderer.reset).toHaveBeenCalledWith(7, expect.anything());
    });
  });

  describe('Cancel', () => {
    it('closes without touching the terrain', () => {
      const { comp, onClose } = createDialog();
      getInputs(comp)[0].props.onChange!('99');
      findButton(getModal(comp).shadow!, 'Cancel')!.click();
      expect(onClose).toHaveBeenCalled();
      expect(clearLevelChunks).not.toHaveBeenCalled();
      expect(terrainRenderer.reset).not.toHaveBeenCalled();
    });
  });
});
