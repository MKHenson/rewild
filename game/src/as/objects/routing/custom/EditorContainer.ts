import { DirectionalLight } from "../../../lights/DirectionalLight";
import { Color } from "../../../../common/math/Color";
import { Container } from "../core/Container";
import { uiSignaller } from "../../../extras/ui/uiSignalManager";
import { Listener } from "../../../core/EventDispatcher";
import { Event } from "../../../core/Event";
import { ApplicationEvent } from "../../../extras/ui/ApplicationEvent";
import { ApplicationEventType, UIEventType } from "../../../../common/EventTypes";
import { Link } from "../core/Link";

export class EditorContainer extends Container implements Listener {
  private sun!: DirectionalLight;

  constructor() {
    super("Editor");
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
    if (uiEvent.eventType == ApplicationEventType.Quit) this.exit(this.getPortal("Exit")!, true);
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

export function createEditor(): Container {
  return new EditorContainer();
}
