import { UIElement } from '../core/UIElement';
import { IMaterialPass } from '../materials/IMaterialPass';
import { UIElementHealthPass } from '../materials/UIElementHealthPass';
import { Renderer } from '../Renderer';

export class GuiManager {
  renderer: Renderer;

  dispose(): void {}

  async initialize(renderer: Renderer) {
    this.renderer = renderer;
    const { canvas } = renderer;

    const uiMaterial = renderer.materialManager.get('ui-material');
    const uiHealthMaterial = renderer.materialManager.get(
      'ui-health-material'
    ) as UIElementHealthPass;

    canvas.addEventListener('click', (e) => {
      if (!e.altKey) {
        uiHealthMaterial.healthUniforms.health += 0.1;
        return;
      }
      uiHealthMaterial.healthUniforms.health -= 0.1;

      const newElement = this.createElement(uiMaterial);
      renderer.ui.addChild(newElement.transform);
      newElement.x = Math.random() * 800;
      newElement.y = Math.random() * 800;
      newElement.width = Math.random() * 500;
      newElement.height = Math.random() * 300;
    });

    const elmA = this.createElement(uiMaterial);
    const elmB = this.createElement(uiMaterial);

    const healthBar = this.createElement(uiHealthMaterial);
    renderer.ui.addChild(elmA.transform);
    elmA.transform.addChild(elmB.transform);
    renderer.ui.addChild(healthBar.transform);

    elmA.x = 100;
    elmA.y = 100;
    elmA.width = 100;
    elmA.height = 100;

    elmB.x = 50;
    elmB.y = 50;
    elmB.width = 100;
    elmB.height = 100;
    elmB.backgroundColor.setRGB(0.9, 0.9, 0.9);

    healthBar.width = 250;
    healthBar.height = 40;
    healthBar.x = renderer.canvas.width / 2 - healthBar.width / 2;
    healthBar.y = renderer.canvas.height - healthBar.height - 30;

    return this;
  }

  createElement(material: IMaterialPass): UIElement {
    const newElement = new UIElement(
      this.renderer.geometryManager.get('gui-quad'),
      material
    );

    return newElement;
  }
}
