import { describeNode, nodePath, printFocus, printTree } from './debug';
import { UIInput } from './UIInput';
import { UINode } from './UINode';
import { UISurface } from './UISurface';

function setup() {
  const surface = new UISurface({ kind: 'screen', name: 'menu', input: 'all' });
  const panel = new UINode({
    style: { position: 'absolute', left: 10, top: 20, width: 100, height: 50 },
  });
  const label = new UINode({ text: 'Resume', icon: 'play' });
  const button = new UINode({
    name: 'resume',
    style: { width: 30, focusable: true },
  });
  panel.append(label, button);
  surface.root.append(panel);
  surface.update(200, 100);
  const input = new UIInput({ surfaces: [surface] });
  return { surface, panel, label, button, input };
}

describe('nodePath', () => {
  it('names a node by the child index at each level', () => {
    const { surface, button } = setup();
    expect(nodePath(surface.root)).toBe('root');
    expect(nodePath(button)).toBe('root/0/1');
  });

  it('adds what the node holds', () => {
    const { label } = setup();
    expect(describeNode(label)).toBe('root/0/0 text "Resume" icon play');
  });
});

describe('printTree', () => {
  it('prints each node with its rectangle and its style', () => {
    const { surface } = setup();
    const lines = printTree(surface).split('\n');
    expect(lines[0]).toBe('menu · screen · order 0 · input all · 200 × 100');
    expect(lines[1]).toBe('root  0, 0  200 × 100');
    expect(lines[2]).toBe(
      '  0  10, 20  100 × 50  { position: "absolute", left: 10, top: 20, ' +
        'width: 100, height: 50 }'
    );
    expect(lines[3]).toMatch(
      /^ {4}0 {2}10, 20 {2}.* {2}text "Resume" {2}icon play$/
    );
    expect(lines[4]).toMatch(
      /^ {4}1 #resume {2}.*\{ width: 30, focusable: true \}$/
    );
    expect(lines).toHaveLength(5);
  });
});

describe('printFocus', () => {
  it('names the focus scope, the focused node and the node under the pointer', () => {
    const { surface, button, input } = setup();
    expect(printFocus([surface], input)).toBe(
      'Focus scope: menu\n' +
        '  menu: nothing\n' +
        'No pointer. A locked mouse has none.'
    );
    surface.setFocus(button, true);
    input.pointer('move', { pointerId: 1, pointerType: 'mouse', x: 15, y: 25 });
    const lines = printFocus([surface], input).split('\n');
    expect(lines[1]).toBe('  menu: root/0/1 #resume, ring shows');
    expect(lines[2]).toMatch(/^Pointer 1 \(mouse\) at 15, 25: menu root\/0/);
  });
});
