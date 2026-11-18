import { UINode } from '../UINode';
import { UISurface } from '../UISurface';
import { Label } from './Label';
import { SPACE, Stack } from './Stack';

describe('Stack', () => {
  it('stacks its children in a column with a gap from the scale', () => {
    const surface = new UISurface({ kind: 'screen', name: 'test' });
    const a = new UINode({ style: { height: 10 } });
    const b = new UINode({ style: { height: 10 } });
    const stack = new Stack({ gap: 'l', children: [a, b] });
    surface.root.style.flexDirection = 'column';
    surface.root.append(stack);
    surface.update(100, 100);
    expect(b.rect.y - (a.rect.y + a.rect.height)).toBe(SPACE.l);
    expect(a.rect.width).toBe(100);
  });

  it('makes a row', () => {
    const stack = new Stack({ direction: 'row', gap: 'xs' });
    expect(stack.node.style.flexDirection).toBe('row');
    expect(stack.node.style.gap).toBe(4);
  });
});

describe('Label', () => {
  it('holds its text and lays out again when it changes', () => {
    const surface = new UISurface({ kind: 'screen', name: 'test' });
    const label = new Label({ text: 'Resume' });
    surface.root.append(label);
    surface.update(100, 100);
    label.text = 'Continue';
    expect(label.node.text).toBe('Continue');
    expect(surface.needsLayout).toBe(true);
  });
});
