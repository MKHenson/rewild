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
