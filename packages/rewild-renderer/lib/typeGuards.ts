export const IS_VISUAL_COMPONENT: unique symbol = Symbol('VisualComponent');

export function isVisualComponent(
  obj: any
): obj is import('../types/interfaces').IVisualComponent {
  return !!(obj && obj[IS_VISUAL_COMPONENT]);
}
