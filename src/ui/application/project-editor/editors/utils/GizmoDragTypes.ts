import { Vector3 } from 'rewild-common';

export enum GizmoDragMode {
  None = 'none',
  AxisX = 'axis-x',
  AxisY = 'axis-y',
  AxisZ = 'axis-z',
  PlaneXY = 'plane-xy',
  PlaneXZ = 'plane-xz',
  PlaneYZ = 'plane-yz',
}

export const AXIS_DIRECTIONS: Record<string, Vector3> = {
  [GizmoDragMode.AxisX]: new Vector3(1, 0, 0),
  [GizmoDragMode.AxisY]: new Vector3(0, 1, 0),
  [GizmoDragMode.AxisZ]: new Vector3(0, 0, 1),
};

export const PLANE_NORMALS: Record<string, Vector3> = {
  [GizmoDragMode.PlaneXY]: new Vector3(0, 0, 1),
  [GizmoDragMode.PlaneXZ]: new Vector3(0, 1, 0),
  [GizmoDragMode.PlaneYZ]: new Vector3(1, 0, 0),
};

export function isAxisMode(mode: GizmoDragMode): boolean {
  return (
    mode === GizmoDragMode.AxisX ||
    mode === GizmoDragMode.AxisY ||
    mode === GizmoDragMode.AxisZ
  );
}

export function dragModeInvolvesY(mode: GizmoDragMode): boolean {
  return (
    mode === GizmoDragMode.AxisY ||
    mode === GizmoDragMode.PlaneXY ||
    mode === GizmoDragMode.PlaneYZ
  );
}
