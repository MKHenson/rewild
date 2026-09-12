export const IS_VISUAL_COMPONENT: unique symbol = Symbol('VisualComponent');
export const IS_SCATTER_INSTANCE_GROUP: unique symbol = Symbol(
  'ScatterInstanceGroup'
);

export function isVisualComponent(
  obj: any
): obj is import('../types/interfaces').IVisualComponent {
  return !!(obj && obj[IS_VISUAL_COMPONENT]);
}

export function isScatterInstanceGroup(
  obj: any
): obj is import('../types/interfaces').IScatterInstanceGroup {
  return !!(obj && obj[IS_SCATTER_INSTANCE_GROUP]);
}

export const IS_SCATTER_IMPOSTOR_PASS: unique symbol = Symbol(
  'ScatterImpostorPass'
);

/** A pass drawing scatter billboards from a baked atlas, which the shadow
 *  renderer has to route through its own alpha-tested pipeline. */
export function isScatterImpostorPass(
  obj: any
): obj is { [IS_SCATTER_IMPOSTOR_PASS]: true } {
  return !!(obj && obj[IS_SCATTER_IMPOSTOR_PASS]);
}
