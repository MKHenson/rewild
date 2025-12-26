import { UIElement } from '../core/UIElement';
import { IMaterialPass } from '../materials/IMaterialPass';
import { UIElementHealthPass } from '../materials/UIElementHealthPass';
import { Renderer } from '../Renderer';

export class GuiManager {
  renderer: Renderer;
  onClickDelegate: (e: MouseEvent) => void;

  constructor() {
    this.onClickDelegate = this.onClick.bind(this);
  }

  dispose(): void {
    const { canvas } = this.renderer;
    canvas.removeEventListener('click', this.onClickDelegate);
  }

  async initialize(renderer: Renderer) {
    this.renderer = renderer;
    const { canvas } = renderer;

    canvas.removeEventListener('click', this.onClickDelegate);
    canvas.addEventListener('click', this.onClickDelegate);

    const uiHealthMaterial = renderer.materialManager.get(
      'ui-health-material'
    ) as UIElementHealthPass;

    const healthBar = this.createElement(uiHealthMaterial);
    renderer.ui.addChild(healthBar.transform);
    healthBar.borderRadius = 20;
    healthBar.width = 0.4;
    healthBar.height = 0.05;
    healthBar.x = 0.3;
    healthBar.y = 0.92;
    healthBar.percentageBasedCalculation = true;

    return this;
  }

  onClick(e: MouseEvent): void {
    const uiMaterial = this.renderer.materialManager.get('ui-material');
    const newElement = this.createElement(uiMaterial);
    this.renderer.ui.addChild(newElement.transform);
    newElement.x = Math.random() * 800;
    newElement.y = Math.random() * 800;
    newElement.width = Math.random() * 500;
    newElement.height = Math.random() * 300;
    newElement.borderRadius = 10;
  }

  createElement(material: IMaterialPass): UIElement {
    const newElement = new UIElement(
      this.renderer.geometryManager.get('gui-quad'),
      material
    );

    return newElement;
  }
}
