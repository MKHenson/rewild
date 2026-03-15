import { GuiManager } from './GuiManager';
import { UIElement } from '../core/UIElement';
import { UIPointerEvent } from '../core/UIPointerEvent';
import { Transform } from '../core/Transform';
import { Geometry } from '../geometry/Geometry';
import { IMaterialPass } from '../materials/IMaterialPass';

function createMockMaterial(): IMaterialPass {
  return {
    isGeometryCompatible: () => true,
    perMeshTracker: undefined,
    sharedUniformsTracker: undefined,
  } as unknown as IMaterialPass;
}

function createUIElement(): UIElement {
  const geometry = new Geometry();
  const material = createMockMaterial();
  return new UIElement(geometry, material);
}

function createMockRenderer(uiRoot: Transform) {
  const canvas = document.createElement('canvas');
  canvas.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      right: 800,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => {},
    } as DOMRect);

  return {
    canvas,
    ui: uiRoot,
    geometryManager: { get: () => new Geometry() },
  } as any;
}

function fireClick(canvas: HTMLCanvasElement, x: number, y: number) {
  const event = new MouseEvent('click', {
    clientX: x,
    clientY: y,
    bubbles: true,
  });
  canvas.dispatchEvent(event);
}

function fireMouseMove(canvas: HTMLCanvasElement, x: number, y: number) {
  const event = new MouseEvent('mousemove', {
    clientX: x,
    clientY: y,
    bubbles: true,
  });
  canvas.dispatchEvent(event);
}

function fireMouseDown(canvas: HTMLCanvasElement, x: number, y: number) {
  const event = new MouseEvent('mousedown', {
    clientX: x,
    clientY: y,
    bubbles: true,
  });
  canvas.dispatchEvent(event);
}

function fireMouseUp(canvas: HTMLCanvasElement, x: number, y: number) {
  const event = new MouseEvent('mouseup', {
    clientX: x,
    clientY: y,
    bubbles: true,
  });
  canvas.dispatchEvent(event);
}

describe('GuiManager click events', () => {
  let guiManager: GuiManager;
  let uiRoot: Transform;

  beforeEach(() => {
    uiRoot = new Transform();
    guiManager = new GuiManager();
  });

  afterEach(() => {
    guiManager.dispose();
  });

  it('dispatches a click event on a hit UIElement', async () => {
    const renderer = createMockRenderer(uiRoot);
    await guiManager.initialize(renderer);

    const element = createUIElement();
    element.x = 100;
    element.y = 100;
    element.width = 200;
    element.height = 100;
    uiRoot.addChild(element.transform);

    const handler = jest.fn();
    element.dispatcher.add(handler);

    fireClick(renderer.canvas, 150, 150);

    expect(handler).toHaveBeenCalledTimes(1);
    const event: UIPointerEvent = handler.mock.calls[0][0];
    expect(event.type).toBe('click');
    expect(event.target).toBe(element);
    expect(event.currentTarget).toBe(element);
    expect(event.clientX).toBe(150);
    expect(event.clientY).toBe(150);
  });

  it('does not dispatch when clicking outside all UIElements', async () => {
    const renderer = createMockRenderer(uiRoot);
    await guiManager.initialize(renderer);

    const element = createUIElement();
    element.x = 100;
    element.y = 100;
    element.width = 50;
    element.height = 50;
    uiRoot.addChild(element.transform);

    const handler = jest.fn();
    element.dispatcher.add(handler);

    fireClick(renderer.canvas, 10, 10);

    expect(handler).not.toHaveBeenCalled();
  });

  it('bubbles click events from child to parent UIElements', async () => {
    const renderer = createMockRenderer(uiRoot);
    await guiManager.initialize(renderer);

    const parent = createUIElement();
    parent.x = 50;
    parent.y = 50;
    parent.width = 300;
    parent.height = 300;
    uiRoot.addChild(parent.transform);

    const child = createUIElement();
    child.x = 10;
    child.y = 10;
    child.width = 100;
    child.height = 100;
    parent.transform.addChild(child.transform);

    const callOrder: string[] = [];
    child.dispatcher.add(() => callOrder.push('child'));
    parent.dispatcher.add(() => callOrder.push('parent'));

    // Click inside the child (child is at parent.x+child.x=60, parent.y+child.y=60)
    fireClick(renderer.canvas, 70, 70);

    expect(callOrder).toEqual(['child', 'parent']);
  });

  it('sets target to the deepest hit element and currentTarget to each element during bubbling', async () => {
    const renderer = createMockRenderer(uiRoot);
    await guiManager.initialize(renderer);

    const parent = createUIElement();
    parent.x = 0;
    parent.y = 0;
    parent.width = 400;
    parent.height = 400;
    uiRoot.addChild(parent.transform);

    const child = createUIElement();
    child.x = 10;
    child.y = 10;
    child.width = 100;
    child.height = 100;
    parent.transform.addChild(child.transform);

    // Capture target and currentTarget at the moment each handler fires,
    // since currentTarget is mutated on the shared event object during bubbling
    let childTarget: UIElement | null = null;
    let childCurrentTarget: UIElement | null = null;
    let parentTarget: UIElement | null = null;
    let parentCurrentTarget: UIElement | null = null;

    child.dispatcher.add((event) => {
      childTarget = event.target;
      childCurrentTarget = event.currentTarget;
    });
    parent.dispatcher.add((event) => {
      parentTarget = event.target;
      parentCurrentTarget = event.currentTarget;
    });

    fireClick(renderer.canvas, 20, 20);

    // Child handler: target = child, currentTarget = child
    expect(childTarget).toBe(child);
    expect(childCurrentTarget).toBe(child);

    // Parent handler: target = child (original), currentTarget = parent
    expect(parentTarget).toBe(child);
    expect(parentCurrentTarget).toBe(parent);
  });

  it('stopPropagation prevents bubbling to parent', async () => {
    const renderer = createMockRenderer(uiRoot);
    await guiManager.initialize(renderer);

    const parent = createUIElement();
    parent.x = 0;
    parent.y = 0;
    parent.width = 400;
    parent.height = 400;
    uiRoot.addChild(parent.transform);

    const child = createUIElement();
    child.x = 10;
    child.y = 10;
    child.width = 100;
    child.height = 100;
    parent.transform.addChild(child.transform);

    const parentHandler = jest.fn();
    child.dispatcher.add((event) => {
      event.stopPropagation();
    });
    parent.dispatcher.add(parentHandler);

    fireClick(renderer.canvas, 20, 20);

    expect(parentHandler).not.toHaveBeenCalled();
  });

  it('bubbles through multiple ancestor levels', async () => {
    const renderer = createMockRenderer(uiRoot);
    await guiManager.initialize(renderer);

    const grandparent = createUIElement();
    grandparent.x = 0;
    grandparent.y = 0;
    grandparent.width = 500;
    grandparent.height = 500;
    uiRoot.addChild(grandparent.transform);

    const parent = createUIElement();
    parent.x = 10;
    parent.y = 10;
    parent.width = 300;
    parent.height = 300;
    grandparent.transform.addChild(parent.transform);

    const child = createUIElement();
    child.x = 5;
    child.y = 5;
    child.width = 100;
    child.height = 100;
    parent.transform.addChild(child.transform);

    const callOrder: string[] = [];
    child.dispatcher.add(() => callOrder.push('child'));
    parent.dispatcher.add(() => callOrder.push('parent'));
    grandparent.dispatcher.add(() => callOrder.push('grandparent'));

    // child absolute pos: 0+10+5=15, 0+10+5=15
    fireClick(renderer.canvas, 20, 20);

    expect(callOrder).toEqual(['child', 'parent', 'grandparent']);
  });

  it('stopPropagation at middle level prevents further bubbling', async () => {
    const renderer = createMockRenderer(uiRoot);
    await guiManager.initialize(renderer);

    const grandparent = createUIElement();
    grandparent.x = 0;
    grandparent.y = 0;
    grandparent.width = 500;
    grandparent.height = 500;
    uiRoot.addChild(grandparent.transform);

    const parent = createUIElement();
    parent.x = 10;
    parent.y = 10;
    parent.width = 300;
    parent.height = 300;
    grandparent.transform.addChild(parent.transform);

    const child = createUIElement();
    child.x = 5;
    child.y = 5;
    child.width = 100;
    child.height = 100;
    parent.transform.addChild(child.transform);

    const callOrder: string[] = [];
    child.dispatcher.add(() => callOrder.push('child'));
    parent.dispatcher.add((event) => {
      callOrder.push('parent');
      event.stopPropagation();
    });
    grandparent.dispatcher.add(() => callOrder.push('grandparent'));

    fireClick(renderer.canvas, 20, 20);

    expect(callOrder).toEqual(['child', 'parent']);
  });

  it('clicks a parent-only area when child does not cover it', async () => {
    const renderer = createMockRenderer(uiRoot);
    await guiManager.initialize(renderer);

    const parent = createUIElement();
    parent.x = 0;
    parent.y = 0;
    parent.width = 400;
    parent.height = 400;
    uiRoot.addChild(parent.transform);

    const child = createUIElement();
    child.x = 200;
    child.y = 200;
    child.width = 50;
    child.height = 50;
    parent.transform.addChild(child.transform);

    const parentHandler = jest.fn();
    const childHandler = jest.fn();
    parent.dispatcher.add(parentHandler);
    child.dispatcher.add(childHandler);

    // Click in parent area outside the child
    fireClick(renderer.canvas, 10, 10);

    expect(parentHandler).toHaveBeenCalledTimes(1);
    expect(childHandler).not.toHaveBeenCalled();
    expect(parentHandler.mock.calls[0][0].target).toBe(parent);
  });

  it('does not dispatch events after dispose', async () => {
    const renderer = createMockRenderer(uiRoot);
    await guiManager.initialize(renderer);

    const element = createUIElement();
    element.x = 0;
    element.y = 0;
    element.width = 200;
    element.height = 200;
    uiRoot.addChild(element.transform);

    const handler = jest.fn();
    element.dispatcher.add(handler);

    guiManager.dispose();

    fireClick(renderer.canvas, 50, 50);

    expect(handler).not.toHaveBeenCalled();
  });

  it('skips non-UIElement transforms during bubbling', async () => {
    const renderer = createMockRenderer(uiRoot);
    await guiManager.initialize(renderer);

    // grandparent is a UIElement
    const grandparent = createUIElement();
    grandparent.x = 0;
    grandparent.y = 0;
    grandparent.width = 500;
    grandparent.height = 500;
    uiRoot.addChild(grandparent.transform);

    // middle is a plain Transform (not a UIElement)
    const middle = new Transform();
    grandparent.transform.addChild(middle);

    const child = createUIElement();
    child.x = 10;
    child.y = 10;
    child.width = 100;
    child.height = 100;
    middle.addChild(child.transform);

    const callOrder: string[] = [];
    child.dispatcher.add(() => callOrder.push('child'));
    grandparent.dispatcher.add(() => callOrder.push('grandparent'));

    fireClick(renderer.canvas, 15, 15);

    // Middle transform is skipped, bubbles from child to grandparent
    expect(callOrder).toEqual(['child', 'grandparent']);
  });
});

describe('GuiManager mouseenter/mouseleave events', () => {
  let guiManager: GuiManager;
  let uiRoot: Transform;

  beforeEach(() => {
    uiRoot = new Transform();
    guiManager = new GuiManager();
  });

  afterEach(() => {
    guiManager.dispose();
  });

  it('dispatches mouseenter when pointer moves over a UIElement', async () => {
    const renderer = createMockRenderer(uiRoot);
    await guiManager.initialize(renderer);

    const element = createUIElement();
    element.x = 100;
    element.y = 100;
    element.width = 200;
    element.height = 100;
    uiRoot.addChild(element.transform);

    const handler = jest.fn();
    element.dispatcher.add(handler);

    // Move pointer into the element
    fireMouseMove(renderer.canvas, 150, 150);

    expect(handler).toHaveBeenCalledTimes(1);
    const event: UIPointerEvent = handler.mock.calls[0][0];
    expect(event.type).toBe('mouseenter');
    expect(event.target).toBe(element);
    expect(event.clientX).toBe(150);
    expect(event.clientY).toBe(150);
  });

  it('dispatches mouseleave when pointer moves out of a UIElement', async () => {
    const renderer = createMockRenderer(uiRoot);
    await guiManager.initialize(renderer);

    const element = createUIElement();
    element.x = 100;
    element.y = 100;
    element.width = 200;
    element.height = 100;
    uiRoot.addChild(element.transform);

    const types: string[] = [];
    element.dispatcher.add((e) => types.push(e.type));

    // Move into the element, then out
    fireMouseMove(renderer.canvas, 150, 150);
    fireMouseMove(renderer.canvas, 10, 10);

    expect(types).toEqual(['mouseenter', 'mouseleave']);
  });

  it('does not dispatch duplicate mouseenter while pointer stays inside', async () => {
    const renderer = createMockRenderer(uiRoot);
    await guiManager.initialize(renderer);

    const element = createUIElement();
    element.x = 100;
    element.y = 100;
    element.width = 200;
    element.height = 100;
    uiRoot.addChild(element.transform);

    const handler = jest.fn();
    element.dispatcher.add(handler);

    fireMouseMove(renderer.canvas, 150, 150);
    fireMouseMove(renderer.canvas, 160, 160);
    fireMouseMove(renderer.canvas, 170, 170);

    // Only one mouseenter, no mouseleave
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].type).toBe('mouseenter');
  });

  it('dispatches mouseenter independently on parent and child', async () => {
    const renderer = createMockRenderer(uiRoot);
    await guiManager.initialize(renderer);

    const parent = createUIElement();
    parent.x = 0;
    parent.y = 0;
    parent.width = 400;
    parent.height = 400;
    uiRoot.addChild(parent.transform);

    const child = createUIElement();
    child.x = 10;
    child.y = 10;
    child.width = 100;
    child.height = 100;
    parent.transform.addChild(child.transform);

    const events: string[] = [];
    parent.dispatcher.add((e) => events.push(`parent:${e.type}`));
    child.dispatcher.add((e) => events.push(`child:${e.type}`));

    // Move into the child area (both parent and child contain this point)
    fireMouseMove(renderer.canvas, 20, 20);

    expect(events).toContain('parent:mouseenter');
    expect(events).toContain('child:mouseenter');
  });

  it('dispatches mouseleave on child but not parent when moving within parent', async () => {
    const renderer = createMockRenderer(uiRoot);
    await guiManager.initialize(renderer);

    const parent = createUIElement();
    parent.x = 0;
    parent.y = 0;
    parent.width = 400;
    parent.height = 400;
    uiRoot.addChild(parent.transform);

    const child = createUIElement();
    child.x = 10;
    child.y = 10;
    child.width = 100;
    child.height = 100;
    parent.transform.addChild(child.transform);

    const events: string[] = [];
    parent.dispatcher.add((e) => events.push(`parent:${e.type}`));
    child.dispatcher.add((e) => events.push(`child:${e.type}`));

    // Move into child area (hits both parent and child)
    fireMouseMove(renderer.canvas, 20, 20);

    // Move to parent-only area (outside child)
    events.length = 0;
    fireMouseMove(renderer.canvas, 300, 300);

    // Child leaves, parent stays — no parent leave or re-enter
    expect(events).toEqual(['child:mouseleave']);
  });

  it('dispatches mouseleave on all elements when pointer leaves the UI entirely', async () => {
    const renderer = createMockRenderer(uiRoot);
    await guiManager.initialize(renderer);

    const parent = createUIElement();
    parent.x = 100;
    parent.y = 100;
    parent.width = 200;
    parent.height = 200;
    uiRoot.addChild(parent.transform);

    const child = createUIElement();
    child.x = 10;
    child.y = 10;
    child.width = 50;
    child.height = 50;
    parent.transform.addChild(child.transform);

    const events: string[] = [];
    parent.dispatcher.add((e) => events.push(`parent:${e.type}`));
    child.dispatcher.add((e) => events.push(`child:${e.type}`));

    // Enter both
    fireMouseMove(renderer.canvas, 120, 120);
    expect(events).toContain('parent:mouseenter');
    expect(events).toContain('child:mouseenter');

    // Leave entirely
    events.length = 0;
    fireMouseMove(renderer.canvas, 10, 10);

    expect(events).toContain('parent:mouseleave');
    expect(events).toContain('child:mouseleave');
    expect(events).toHaveLength(2);
  });

  it('dispatches mouseenter when entering a sibling element', async () => {
    const renderer = createMockRenderer(uiRoot);
    await guiManager.initialize(renderer);

    const siblingA = createUIElement();
    siblingA.x = 0;
    siblingA.y = 0;
    siblingA.width = 100;
    siblingA.height = 100;
    uiRoot.addChild(siblingA.transform);

    const siblingB = createUIElement();
    siblingB.x = 200;
    siblingB.y = 0;
    siblingB.width = 100;
    siblingB.height = 100;
    uiRoot.addChild(siblingB.transform);

    const events: string[] = [];
    siblingA.dispatcher.add((e) => events.push(`A:${e.type}`));
    siblingB.dispatcher.add((e) => events.push(`B:${e.type}`));

    // Hover over A
    fireMouseMove(renderer.canvas, 50, 50);
    expect(events).toEqual(['A:mouseenter']);

    // Move to B
    events.length = 0;
    fireMouseMove(renderer.canvas, 250, 50);
    expect(events).toContain('A:mouseleave');
    expect(events).toContain('B:mouseenter');
  });

  it('does not dispatch mouseenter/mouseleave after dispose', async () => {
    const renderer = createMockRenderer(uiRoot);
    await guiManager.initialize(renderer);

    const element = createUIElement();
    element.x = 0;
    element.y = 0;
    element.width = 200;
    element.height = 200;
    uiRoot.addChild(element.transform);

    const handler = jest.fn();
    element.dispatcher.add(handler);

    guiManager.dispose();

    fireMouseMove(renderer.canvas, 50, 50);

    expect(handler).not.toHaveBeenCalled();
  });

  it('mouseenter/mouseleave do not bubble', async () => {
    const renderer = createMockRenderer(uiRoot);
    await guiManager.initialize(renderer);

    const parent = createUIElement();
    parent.x = 0;
    parent.y = 0;
    parent.width = 400;
    parent.height = 400;
    uiRoot.addChild(parent.transform);

    const child = createUIElement();
    child.x = 10;
    child.y = 10;
    child.width = 100;
    child.height = 100;
    parent.transform.addChild(child.transform);

    // Capture target at handler call time since the event object is reused
    let parentEnterTarget: UIElement | null = null;
    let childEnterTarget: UIElement | null = null;
    parent.dispatcher.add((e) => {
      if (e.type === 'mouseenter') parentEnterTarget = e.target;
    });
    child.dispatcher.add((e) => {
      if (e.type === 'mouseenter') childEnterTarget = e.target;
    });

    // Move into child area
    fireMouseMove(renderer.canvas, 20, 20);

    // Parent's mouseenter has target = parent (not child)
    expect(parentEnterTarget).toBe(parent);
    // Child's mouseenter has target = child
    expect(childEnterTarget).toBe(child);
  });
});

describe('GuiManager mousedown/mouseup events', () => {
  let guiManager: GuiManager;
  let uiRoot: Transform;

  beforeEach(() => {
    uiRoot = new Transform();
    guiManager = new GuiManager();
  });

  afterEach(() => {
    guiManager.dispose();
  });

  it('dispatches mousedown on a hit UIElement', async () => {
    const renderer = createMockRenderer(uiRoot);
    await guiManager.initialize(renderer);

    const element = createUIElement();
    element.x = 100;
    element.y = 100;
    element.width = 200;
    element.height = 100;
    uiRoot.addChild(element.transform);

    const handler = jest.fn();
    element.dispatcher.add(handler);

    fireMouseDown(renderer.canvas, 150, 150);

    expect(handler).toHaveBeenCalledTimes(1);
    const event: UIPointerEvent = handler.mock.calls[0][0];
    expect(event.type).toBe('mousedown');
    expect(event.target).toBe(element);
    expect(event.clientX).toBe(150);
    expect(event.clientY).toBe(150);
  });

  it('dispatches mouseup on a hit UIElement', async () => {
    const renderer = createMockRenderer(uiRoot);
    await guiManager.initialize(renderer);

    const element = createUIElement();
    element.x = 100;
    element.y = 100;
    element.width = 200;
    element.height = 100;
    uiRoot.addChild(element.transform);

    const handler = jest.fn();
    element.dispatcher.add(handler);

    fireMouseUp(renderer.canvas, 150, 150);

    expect(handler).toHaveBeenCalledTimes(1);
    const event: UIPointerEvent = handler.mock.calls[0][0];
    expect(event.type).toBe('mouseup');
    expect(event.target).toBe(element);
    expect(event.clientX).toBe(150);
    expect(event.clientY).toBe(150);
  });

  it('does not dispatch when mousedown is outside all UIElements', async () => {
    const renderer = createMockRenderer(uiRoot);
    await guiManager.initialize(renderer);

    const element = createUIElement();
    element.x = 100;
    element.y = 100;
    element.width = 50;
    element.height = 50;
    uiRoot.addChild(element.transform);

    const handler = jest.fn();
    element.dispatcher.add(handler);

    fireMouseDown(renderer.canvas, 10, 10);

    expect(handler).not.toHaveBeenCalled();
  });

  it('mousedown bubbles from child to parent', async () => {
    const renderer = createMockRenderer(uiRoot);
    await guiManager.initialize(renderer);

    const parent = createUIElement();
    parent.x = 50;
    parent.y = 50;
    parent.width = 300;
    parent.height = 300;
    uiRoot.addChild(parent.transform);

    const child = createUIElement();
    child.x = 10;
    child.y = 10;
    child.width = 100;
    child.height = 100;
    parent.transform.addChild(child.transform);

    const callOrder: string[] = [];
    child.dispatcher.add(() => callOrder.push('child'));
    parent.dispatcher.add(() => callOrder.push('parent'));

    fireMouseDown(renderer.canvas, 70, 70);

    expect(callOrder).toEqual(['child', 'parent']);
  });

  it('mouseup bubbles from child to parent', async () => {
    const renderer = createMockRenderer(uiRoot);
    await guiManager.initialize(renderer);

    const parent = createUIElement();
    parent.x = 50;
    parent.y = 50;
    parent.width = 300;
    parent.height = 300;
    uiRoot.addChild(parent.transform);

    const child = createUIElement();
    child.x = 10;
    child.y = 10;
    child.width = 100;
    child.height = 100;
    parent.transform.addChild(child.transform);

    const callOrder: string[] = [];
    child.dispatcher.add(() => callOrder.push('child'));
    parent.dispatcher.add(() => callOrder.push('parent'));

    fireMouseUp(renderer.canvas, 70, 70);

    expect(callOrder).toEqual(['child', 'parent']);
  });

  it('stopPropagation on mousedown prevents bubbling', async () => {
    const renderer = createMockRenderer(uiRoot);
    await guiManager.initialize(renderer);

    const parent = createUIElement();
    parent.x = 0;
    parent.y = 0;
    parent.width = 400;
    parent.height = 400;
    uiRoot.addChild(parent.transform);

    const child = createUIElement();
    child.x = 10;
    child.y = 10;
    child.width = 100;
    child.height = 100;
    parent.transform.addChild(child.transform);

    const parentHandler = jest.fn();
    child.dispatcher.add((event) => {
      event.stopPropagation();
    });
    parent.dispatcher.add(parentHandler);

    fireMouseDown(renderer.canvas, 20, 20);

    expect(parentHandler).not.toHaveBeenCalled();
  });

  it('does not dispatch mousedown/mouseup after dispose', async () => {
    const renderer = createMockRenderer(uiRoot);
    await guiManager.initialize(renderer);

    const element = createUIElement();
    element.x = 0;
    element.y = 0;
    element.width = 200;
    element.height = 200;
    uiRoot.addChild(element.transform);

    const handler = jest.fn();
    element.dispatcher.add(handler);

    guiManager.dispose();

    fireMouseDown(renderer.canvas, 50, 50);
    fireMouseUp(renderer.canvas, 50, 50);

    expect(handler).not.toHaveBeenCalled();
  });
});
