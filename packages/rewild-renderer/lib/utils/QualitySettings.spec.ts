import { QualitySettings } from './QualitySettings';

const STORAGE_KEY = 'rewild.render.quality';
const OVERRIDES_STORAGE_KEY = 'rewild.render.quality.overrides';

describe('QualitySettings', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  describe('with nothing stored', () => {
    it('starts on high', () => {
      expect(new QualitySettings().level).toBe('high');
    });

    it('starts on the given fallback', () => {
      expect(new QualitySettings('low').level).toBe('low');
    });
  });

  describe('with a stored tier', () => {
    it('restores it', () => {
      localStorage.setItem(STORAGE_KEY, 'ultra');
      expect(new QualitySettings().level).toBe('ultra');
    });

    it('prefers it over the fallback', () => {
      localStorage.setItem(STORAGE_KEY, 'ultra');
      expect(new QualitySettings('low').level).toBe('ultra');
    });

    // A tier renamed or dropped by a later build would otherwise be handed
    // straight to a tier table that has no row for it.
    it('ignores a value that is not a tier', () => {
      localStorage.setItem(STORAGE_KEY, 'extreme');
      expect(new QualitySettings().level).toBe('high');
    });
  });

  describe('setting the level', () => {
    it('persists it', () => {
      new QualitySettings().level = 'ultra';
      expect(localStorage.getItem(STORAGE_KEY)).toBe('ultra');
    });

    it('survives a reload', () => {
      new QualitySettings().level = 'medium';
      expect(new QualitySettings().level).toBe('medium');
    });

    it('bumps the revision so consumers rebuild', () => {
      const quality = new QualitySettings();
      const before = quality.revision;

      quality.level = 'ultra';

      expect(quality.revision).not.toBe(before);
      expect(quality.hasChangedSince(before)).toBe(true);
    });

    it('is a no-op when the level is unchanged', () => {
      const quality = new QualitySettings();
      const before = quality.revision;

      quality.level = quality.level;

      expect(quality.revision).toBe(before);
    });
  });

  describe('per-aspect overrides', () => {
    it('falls back to the level for an unpinned aspect', () => {
      const quality = new QualitySettings('medium');

      expect(quality.aspect('clouds')).toBe('medium');
      expect(quality.aspect('bloom')).toBe('medium');
    });

    it('returns the pinned tier for a pinned aspect only', () => {
      const quality = new QualitySettings('high');

      quality.setAspect('clouds', 'low');

      expect(quality.aspect('clouds')).toBe('low');
      expect(quality.aspect('bloom')).toBe('high');
    });

    it('bumps the revision so consumers rebuild', () => {
      const quality = new QualitySettings('high');
      const before = quality.revision;

      quality.setAspect('clouds', 'low');

      expect(quality.hasChangedSince(before)).toBe(true);
    });

    it('is a no-op when the aspect already resolves to that tier', () => {
      const quality = new QualitySettings('high');
      const before = quality.revision;

      quality.setAspect('clouds', 'high');

      expect(quality.revision).toBe(before);
    });

    // An override equal to the level is not an override — kept, it would
    // survive a later level change as a pin the user never asked for.
    it('unpins an aspect set back to the level', () => {
      const quality = new QualitySettings('high');
      quality.setAspect('clouds', 'low');

      quality.setAspect('clouds', 'high');

      expect(quality.overrides.clouds).toBeUndefined();
    });

    it('persists and restores overrides', () => {
      const quality = new QualitySettings('high');
      quality.setAspect('godRays', 'low');

      expect(new QualitySettings().aspect('godRays')).toBe('low');
    });

    it('drops stored entries that are not a known aspect or tier', () => {
      localStorage.setItem(
        OVERRIDES_STORAGE_KEY,
        JSON.stringify({ clouds: 'extreme', shadows: 'low', bloom: 'low' })
      );

      const quality = new QualitySettings('high');

      expect(quality.overrides).toEqual({ bloom: 'low' });
    });

    it('ignores stored overrides that are not JSON', () => {
      localStorage.setItem(OVERRIDES_STORAGE_KEY, 'not json');

      expect(new QualitySettings('high').overrides).toEqual({});
    });
  });

  describe('setting the level with overrides in force', () => {
    it('clears them, since the level is the coarse control', () => {
      const quality = new QualitySettings('high');
      quality.setAspect('clouds', 'low');

      quality.level = 'medium';

      expect(quality.overrides).toEqual({});
      expect(quality.aspect('clouds')).toBe('medium');
    });

    // Re-picking the tier already showing in the dropdown is how a user asks
    // for "everything back to this", so it cannot short-circuit.
    it('clears them even when the level itself is unchanged', () => {
      const quality = new QualitySettings('high');
      quality.setAspect('clouds', 'low');

      quality.level = 'high';

      expect(quality.overrides).toEqual({});
    });
  });

  describe('apply', () => {
    it('sets the level and overrides together', () => {
      const quality = new QualitySettings('high');

      quality.apply('medium', { clouds: 'low', bloom: 'ultra' });

      expect(quality.level).toBe('medium');
      expect(quality.aspect('clouds')).toBe('low');
      expect(quality.aspect('bloom')).toBe('ultra');
      expect(quality.aspect('godRays')).toBe('medium');
    });

    // A form's Apply is one user action; several revision bumps would rebuild
    // the affected pipelines several times over for that one click.
    it('bumps the revision once', () => {
      const quality = new QualitySettings('high');
      const before = quality.revision;

      quality.apply('medium', { clouds: 'low', bloom: 'ultra' });

      expect(quality.revision).toBe(before + 1);
    });

    it('drops overrides equal to the new level', () => {
      const quality = new QualitySettings('high');

      quality.apply('low', { clouds: 'low' });

      expect(quality.overrides).toEqual({});
    });

    it('replaces the previous overrides rather than merging', () => {
      const quality = new QualitySettings('high');
      quality.setAspect('clouds', 'low');

      quality.apply('high', { bloom: 'low' });

      expect(quality.overrides).toEqual({ bloom: 'low' });
    });

    it('is a no-op when nothing changes', () => {
      const quality = new QualitySettings('high');
      quality.apply('medium', { clouds: 'low' });
      const before = quality.revision;

      quality.apply('medium', { clouds: 'low' });

      expect(quality.revision).toBe(before);
    });

    it('persists both halves', () => {
      new QualitySettings('high').apply('medium', { clouds: 'low' });

      expect(localStorage.getItem(STORAGE_KEY)).toBe('medium');
      expect(new QualitySettings().overrides).toEqual({ clouds: 'low' });
    });
  });

  // Private-mode browsers throw on both accessors rather than returning null.
  describe('when storage is unavailable', () => {
    it('falls back to the default rather than throwing', () => {
      jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked');
      });

      expect(new QualitySettings().level).toBe('high');
    });

    it('still applies the level for this session', () => {
      jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('blocked');
      });

      const quality = new QualitySettings();
      quality.level = 'ultra';

      expect(quality.level).toBe('ultra');
    });

    it('still applies overrides for this session', () => {
      jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('blocked');
      });

      const quality = new QualitySettings('high');
      quality.setAspect('clouds', 'low');

      expect(quality.aspect('clouds')).toBe('low');
    });
  });
});
