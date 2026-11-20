import { UINode } from '../UINode';
import { Divider } from './Divider';
import { Field } from './Field';
import { InfoBox } from './InfoBox';
import { Switch } from './Switch';
import { formSetup } from './testing';

describe('Field', () => {
  it('puts the label in a column and stretches the control', () => {
    const control = new UINode({ style: { height: 32 } });
    const field = new Field({
      label: 'Render Quality',
      control,
      description: 'Sets each section below at once.',
      labelWidth: 120,
      style: { width: 400 },
    });
    const { update } = formSetup(field);
    update();
    const [label, column] = field.node.children;
    expect(label.rect).toMatchObject({ x: 0, width: 120, height: 32 });
    expect(control.rect).toMatchObject({ x: 136, y: 0, width: 264 });
    const description = column.children[1];
    expect(description.text).toBe('Sets each section below at once.');
    expect(description.rect).toMatchObject({ x: 136, y: 36, width: 264 });
  });

  it('keeps the width of a switch', () => {
    const toggle = new Switch();
    const field = new Field({
      label: 'Mute',
      control: toggle,
      style: { width: 400 },
    });
    const { update } = formSetup(field);
    update();
    expect(toggle.node.rect.width).toBe(44);
  });
});

describe('Divider and InfoBox', () => {
  it('draws a line across its parent', () => {
    const divider = new Divider();
    const { menu, update } = formSetup(divider);
    update();
    expect(divider.node.rect).toMatchObject({ width: menu.width, height: 1 });
  });

  it('shows the icon and colour of its variant', () => {
    const box = new InfoBox({
      variant: 'warning',
      title: 'Heads up',
      text: 'Applies at once.',
    });
    const [icon, content] = box.node.children;
    expect(icon.icon).toBe('triangle-alert');
    expect(icon.style.color).toBe('warning400');
    expect(box.node.style.boxShadow).toMatchObject({
      x: 4,
      color: 'warning400',
    });
    expect(content.children.map((n) => n.text)).toEqual([
      'Heads up',
      'Applies at once.',
    ]);
  });
});
