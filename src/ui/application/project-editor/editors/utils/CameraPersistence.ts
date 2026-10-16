import { Vector3 } from 'rewild-common';

// Persist the editor's orbit camera per level so reloading a scene keeps the
// last viewpoint instead of snapping back to the default. For an orbit camera
// the position + target pair fully determines the view — rotation is derived
// from lookAt(target), so there's no need to store a quaternion separately.
export interface SavedCameraState {
  position: [number, number, number];
  target: [number, number, number];
}

const KEY_PREFIX = 'rewild.editor.camera.';

/** Where a level with no saved camera opens: the renderer's starting pose. */
export const DEFAULT_CAMERA_STATE: SavedCameraState = {
  position: [0, 20, 50],
  target: [0, 0, 0],
};

export function loadCameraState(levelId: string): SavedCameraState | null {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + levelId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedCameraState;
    if (
      !Array.isArray(parsed.position) ||
      parsed.position.length !== 3 ||
      !Array.isArray(parsed.target) ||
      parsed.target.length !== 3
    )
      return null;
    return parsed;
  } catch {
    // Corrupt/unavailable storage — fall back to the default camera.
    return null;
  }
}

export function saveCameraState(
  levelId: string,
  position: Vector3,
  target: Vector3
): void {
  try {
    const state: SavedCameraState = {
      position: [position.x, position.y, position.z],
      target: [target.x, target.y, target.z],
    };
    localStorage.setItem(KEY_PREFIX + levelId, JSON.stringify(state));
  } catch {
    // localStorage may be full or blocked (private mode) — non-fatal.
  }
}
