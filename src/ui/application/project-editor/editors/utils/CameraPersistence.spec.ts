import { Vector3 } from 'rewild-common';
import {
  loadCameraState,
  saveCameraState,
  SavedCameraState,
} from './CameraPersistence';

const PROJECT_ID = 'project-1';
const KEY = `rewild.editor.camera.${PROJECT_ID}`;

describe('CameraPersistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('saveCameraState', () => {
    it('writes position and target under the project-scoped key', () => {
      saveCameraState(
        PROJECT_ID,
        new Vector3(1, 2, 3),
        new Vector3(4, 5, 6)
      );

      const stored = JSON.parse(localStorage.getItem(KEY)!) as SavedCameraState;
      expect(stored).toEqual({
        position: [1, 2, 3],
        target: [4, 5, 6],
      });
    });

    it('keys separate projects independently', () => {
      saveCameraState('a', new Vector3(1, 0, 0), new Vector3(0, 0, 0));
      saveCameraState('b', new Vector3(2, 0, 0), new Vector3(0, 0, 0));

      expect(loadCameraState('a')!.position).toEqual([1, 0, 0]);
      expect(loadCameraState('b')!.position).toEqual([2, 0, 0]);
    });

    it('overwrites the previous state for the same project', () => {
      saveCameraState(PROJECT_ID, new Vector3(1, 1, 1), new Vector3(0, 0, 0));
      saveCameraState(PROJECT_ID, new Vector3(9, 9, 9), new Vector3(8, 8, 8));

      expect(loadCameraState(PROJECT_ID)).toEqual({
        position: [9, 9, 9],
        target: [8, 8, 8],
      });
    });

    it('does not throw when localStorage is unavailable', () => {
      const setItem = jest
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => {
          throw new Error('quota exceeded');
        });

      expect(() =>
        saveCameraState(PROJECT_ID, new Vector3(), new Vector3())
      ).not.toThrow();

      setItem.mockRestore();
    });
  });

  describe('loadCameraState', () => {
    it('round-trips a saved state', () => {
      saveCameraState(
        PROJECT_ID,
        new Vector3(10, 20, 30),
        new Vector3(-1, -2, -3)
      );

      expect(loadCameraState(PROJECT_ID)).toEqual({
        position: [10, 20, 30],
        target: [-1, -2, -3],
      });
    });

    it('returns null when nothing is stored', () => {
      expect(loadCameraState('never-saved')).toBeNull();
    });

    it('returns null for a corrupt (non-JSON) value', () => {
      localStorage.setItem(KEY, 'not json {');
      expect(loadCameraState(PROJECT_ID)).toBeNull();
    });

    it('returns null when position is missing or malformed', () => {
      localStorage.setItem(KEY, JSON.stringify({ target: [0, 0, 0] }));
      expect(loadCameraState(PROJECT_ID)).toBeNull();
    });

    it('returns null when a vector has the wrong length', () => {
      localStorage.setItem(
        KEY,
        JSON.stringify({ position: [1, 2], target: [0, 0, 0] })
      );
      expect(loadCameraState(PROJECT_ID)).toBeNull();
    });
  });
});
