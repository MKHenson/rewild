import { UIElement } from '../core/UIElement';
import { UIPointerEvent } from '../core/UIPointerEvent';
import { UIRaycaster, Intersection } from '../core/Raycaster';
import { Transform } from '../core/Transform';
import { IMaterialPass } from '../materials/IMaterialPass';
import { Renderer } from '../Renderer';

export class GuiManager {
  renderer: Renderer;
  onClickDelegate: (e: MouseEvent) => void;
  private onMouseMoveDelegate: (e: MouseEvent) => void;
  private onMouseDownDelegate: (e: MouseEvent) => void;
  private onMouseUpDelegate: (e: MouseEvent) => void;
  private uiRaycaster: UIRaycaster | null = null;
  private hoveredElements: Set<UIElement> = new Set();
  private readonly _event: UIPointerEvent = new UIPointerEvent(
    'click',
    null!,
    0,
    0
  );

  constructor() {
    this.onClickDelegate = this.onClick.bind(this);
    this.onMouseMoveDelegate = this.onMouseMove.bind(this);
    this.onMouseDownDelegate = this.onMouseDown.bind(this);
    this.onMouseUpDelegate = this.onMouseUp.bind(this);
  }

  dispose(): void {
    const { canvas } = this.renderer;
    this.uiRaycaster = null;
    this.hoveredElements.clear();
    canvas.removeEventListener('click', this.onClickDelegate);
    canvas.removeEventListener('mousemove', this.onMouseMoveDelegate);
    canvas.removeEventListener('mousedown', this.onMouseDownDelegate);
    canvas.removeEventListener('mouseup', this.onMouseUpDelegate);
  }

  async initialize(renderer: Renderer) {
    this.renderer = renderer;
    this.uiRaycaster = new UIRaycaster(renderer);
    const { canvas } = renderer;

    canvas.removeEventListener('click', this.onClickDelegate);
    canvas.addEventListener('click', this.onClickDelegate);
    canvas.removeEventListener('mousemove', this.onMouseMoveDelegate);
    canvas.addEventListener('mousemove', this.onMouseMoveDelegate);
    canvas.removeEventListener('mousedown', this.onMouseDownDelegate);
    canvas.addEventListener('mousedown', this.onMouseDownDelegate);
    canvas.removeEventListener('mouseup', this.onMouseUpDelegate);
    canvas.addEventListener('mouseup', this.onMouseUpDelegate);
    return this;
  }

  private onClick(e: MouseEvent): void {
    this.dispatchPointerEvent(e, 'click');
  }

  private onMouseDown(e: MouseEvent): void {
    this.dispatchPointerEvent(e, 'mousedown');
  }

  private onMouseUp(e: MouseEvent): void {
    this.dispatchPointerEvent(e, 'mouseup');
  }

  private dispatchPointerEvent(
    e: MouseEvent,
    type: 'click' | 'mousedown' | 'mouseup'
  ): void {
    const renderer = this.renderer;
    if (!renderer || !this.uiRaycaster) return;

    const canvas = renderer.canvas;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    this.uiRaycaster.set(clientX, clientY);

    const intersects: Intersection[] = this.uiRaycaster.intersectObject(
      renderer.ui,
      true
    );

    if (intersects.length === 0) return;

    const topHit = intersects[intersects.length - 1];
    const targetElement = topHit.object.component as UIElement;
    if (!targetElement) return;

    this._event.reset(type, targetElement, clientX, clientY);
    this.dispatchWithBubbling(this._event);
  }

  private onMouseMove(e: MouseEvent): void {
    const renderer = this.renderer;
    if (!renderer || !this.uiRaycaster) return;

    const canvas = renderer.canvas;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    this.uiRaycaster.set(clientX, clientY);

    const intersects: Intersection[] = this.uiRaycaster.intersectObject(
      renderer.ui,
      true
    );

    // Build set of currently hovered UIElements
    const nowHovered = new Set<UIElement>();
    for (let i = 0; i < intersects.length; i++) {
      const component = intersects[i].object.component;
      if (component instanceof UIElement) {
        nowHovered.add(component);
      }
    }

    // Dispatch mouseleave for elements no longer hovered
    for (const element of this.hoveredElements) {
      if (!nowHovered.has(element)) {
        this._event.reset('mouseleave', element, clientX, clientY);
        element.dispatcher.dispatch(this._event);
      }
    }

    // Dispatch mouseenter for newly hovered elements
    for (const element of nowHovered) {
      if (!this.hoveredElements.has(element)) {
        this._event.reset('mouseenter', element, clientX, clientY);
        element.dispatcher.dispatch(this._event);
      }
    }

    this.hoveredElements = nowHovered;
  }

  private dispatchWithBubbling(event: UIPointerEvent): void {
    // Dispatch on the target element
    event.currentTarget = event.target;
    event.target.dispatcher.dispatch(event);

    if (event.propagationStopped) return;

    // Bubble up through parent transforms
    let parent: Transform | null = event.target.transform.parent;
    while (parent) {
      if (event.propagationStopped) break;

      if (parent.component instanceof UIElement) {
        const parentElement = parent.component as UIElement;
        event.currentTarget = parentElement;
        parentElement.dispatcher.dispatch(event);
      }

      parent = parent.parent;
    }
  }

  createElement(material: IMaterialPass): UIElement {
    const newElement = new UIElement(
      this.renderer.geometryManager.get('gui-quad'),
      material
    );

    return newElement;
  }
}
