import type { UISlot } from './UICarry';
import type { UIInput } from './UIInput';
import type { UINode } from './UINode';
import type { UISurface } from './UISurface';

/** The node's place in its tree, such as `root/0/2`: the child index at each level. */
export function nodePath(node: UINode): string {
  const indexes: number[] = [];
  for (let at = node; at.parent; at = at.parent)
    indexes.unshift(at.parent.children.indexOf(at));
  return ['root', ...indexes].join('/');
}

/** The node's path and name, then its text, icon or effect when it has one. */
export function describeNode(node: UINode): string {
  return [nodePath(node) + nameOf(node), ...contents(node)].join(' ');
}

/**
 * The surface's tree as text, one node on each line: its index and name, its
 * rectangle in CSS pixels, what it holds and the style it sets. The
 * rectangles are from the last layout.
 */
export function printTree(surface: UISurface): string {
  const { name, kind, order, input, width, height, size } = surface;
  const metres =
    kind === 'world' ? ` · ${num(size.width)} × ${num(size.height)} m` : '';
  const lines = [
    `${name} · ${kind} · order ${order} · input ${input} · ` +
      `${num(width)} × ${num(height)}${metres}`,
  ];
  const write = (node: UINode, label: string, depth: number) => {
    const { x, y, width, height } = node.rect;
    const style = Object.entries(node.style)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join(', ');
    const parts = [
      '  '.repeat(depth) + label + nameOf(node),
      `${num(x)}, ${num(y)}`,
      `${num(width)} × ${num(height)}`,
      ...contents(node),
    ];
    if (style) parts.push(`{ ${style} }`);
    lines.push(parts.join('  '));
    node.children.forEach((child, i) => write(child, String(i), depth + 1));
  };
  write(surface.root, 'root', 0);
  return lines.join('\n');
}

/**
 * Where keys and pointers go: the focus scope, the focused node of each
 * surface, and the node under each pointer.
 */
export function printFocus(
  surfaces: readonly UISurface[],
  input: UIInput
): string {
  const scope = input.focusScope();
  const lines = [`Focus scope: ${scope ? scope.name : 'none'}`];
  for (const surface of surfaces) {
    const node = surface.focused;
    const ring = surface.focusVisible ? ', ring shows' : '';
    lines.push(
      `  ${surface.name}: ${node ? describeNode(node) + ring : 'nothing'}`
    );
  }
  const hits = input.pointerHits();
  if (!hits.length) lines.push('No pointer. A locked mouse has none.');
  for (const hit of hits) {
    const at = `Pointer ${hit.pointerId} (${hit.pointerType}) at ${num(
      hit.x
    )}, ${num(hit.y)}`;
    const over = hit.game
      ? 'the game has its press'
      : hit.node
      ? `${hit.node.surface?.name ?? 'no surface'} ${describeNode(hit.node)}`
      : 'no node';
    lines.push(`${at}: ${over}`);
  }
  const carry = input.carry;
  if (carry?.held != null) {
    lines.push(
      `Carried: ${carry.describe(carry.held)} from ${slotName(carry.from)}`
    );
    lines.push(`  over: ${slotName(carry.over)}`);
  } else if (carry) {
    lines.push('Carried: nothing');
  }
  return lines.join('\n');
}

function slotName(slot: UISlot | null): string {
  if (!slot) return 'none';
  const surface = slot.node.surface?.name ?? 'no surface';
  return `${surface} ${describeNode(slot.node)}`;
}

/** ` #name` for a named node, or else nothing. */
function nameOf(node: UINode): string {
  return node.name ? ` #${node.name}` : '';
}

function contents(node: UINode): string[] {
  const parts: string[] = [];
  if (node.text !== null) parts.push(`text ${JSON.stringify(node.text)}`);
  if (node.icon !== null) parts.push(`icon ${node.icon}`);
  if (node.image !== null) parts.push(`image ${node.image}`);
  if (node.effect !== null) parts.push(`effect ${node.effect}`);
  return parts;
}

/** A number with at most two decimals. */
function num(value: number): string {
  return String(Math.round(value * 100) / 100);
}
