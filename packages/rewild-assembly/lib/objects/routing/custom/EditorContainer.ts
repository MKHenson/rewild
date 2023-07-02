import { DirectionalLight } from "../../../lights/DirectionalLight";
import {
  Color,
  ApplicationEventType,
  UIEventType,
  Event,
  Listener,
} from "rewild-common";
import { Container } from "../core/Container";
import { uiSignaller } from "../../../extras/ui/uiSignalManager";
import { ApplicationEvent } from "../../../extras/ui/ApplicationEvent";
import { Link } from "../core/Link";

export class EditorContainer extends Container implements Listener {
  private sun!: DirectionalLight;

  constructor(name: string) {
    super(name);
  }

  init(): void {
    super.init();

    const link = new Link();
    const mainMenu = this.runtime!.getNode("MainMenu");
    link.connect(this.getPortal("Exit")!, mainMenu!.getPortal("Enter")!);

    this.sun = new DirectionalLight(new Color(1, 1, 1), 6);
    this.sun.position.set(10, 10, 0);
    this.sun.target.position.set(0, 0, 0);
    this.addAsset(this.sun);
  }

  onEvent(event: Event): void {
    const uiEvent = event.attachment as ApplicationEvent;
    if (uiEvent.eventType == ApplicationEventType.Quit)
      this.exit(this.getPortal("Exit")!, true);
  }

  onUpdate(delta: f32, total: u32): void {}

  mount(): void {
    super.mount();

    this.runtime!.camera.position.set(0, 5, 10);
    this.runtime!.camera.lookAt(0, 0, 0);
    uiSignaller.addEventListener(UIEventType, this);
  }

  unMount(): void {
    super.unMount();
    uiSignaller.removeEventListener(UIEventType, this);
  }
}
