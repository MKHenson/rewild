import { QualitySettings } from './QualitySettings';

const STORAGE_KEY = 'rewild.render.quality';

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
  });
});
