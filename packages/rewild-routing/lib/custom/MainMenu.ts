import { DirectionalLight } from "../../../lights/DirectionalLight";
import { Color, degToRad, ApplicationEventType, UIEventType, Listener, Event } from "rewild-common";
import { Container } from "../Container";
import { uiSignaller } from "../../../extras/ui/uiSignalManager";
import { ApplicationEvent } from "../../../extras/ui/ApplicationEvent";
import { Link } from "../core/Link";
import { Portal } from "../core/Portal";

export class MainMenu extends Container implements Listener {
  private sun!: DirectionalLight;

  constructor(name: string) {
    super(name, true);
    this.addPortal(new Portal("Enter"));
    this.addPortal(new Portal("Exit - Start Game"));
    this.addPortal(new Portal("Exit - Start Editor"));
  }

  init(): void {
    super.init();
    const link1 = new Link();
    const link2 = new Link();
    const level1 = this.runtime!.getNode("Level1");
    const editor = this.runtime!.getNode("Editor");

    if (!level1) throw new Error(`dont have level`);
    if (!editor) throw new Error(`dont have editor`);

    link1.connect(this.getPortal("Exit - Start Game")!, level1.getPortal("Enter")!);
    link2.connect(this.getPortal("Exit - Start Editor")!, editor.getPortal("Enter")!);

    this.sun = new DirectionalLight(new Color(1, 1, 1), 6);
    this.sun.position.set(10, 10, 0);
    this.sun.target.position.set(0, 0, 0);
    this.addAsset(this.sun);
  }

  onEvent(event: Event): void {
    const uiEvent = event.attachment as ApplicationEvent;
    if (uiEvent.eventType == ApplicationEventType.StartGame)
      this.runtime!.sendSignal(this.getPortal("Exit - Start Game")!, true);
    else if (uiEvent.eventType == ApplicationEventType.StartEditor)
      this.runtime!.sendSignal(this.getPortal("Exit - Start Editor")!, true);
  }

  onUpdate(delta: f32, total: u32): void {
    this.objects[0].rotation.y += delta * 0.1;
  }

  mount(): void {
    super.mount();

    this.runtime!.camera.position.set(0, 5, 10);
    this.runtime!.camera.lookAt(0, 0, 0);

    this.objects[0].position.set(0, -40, -50);
    this.objects[0].scale.set(30, 30, 30);
    this.objects[0].rotation.x = degToRad(180);

    const sbybox = this.findObjectByName("skybox")!;
    sbybox.scale.set(200, 200, 200);
    sbybox.position.set(0, 0, 0);

    uiSignaller.addEventListener(UIEventType, this);
  }

  unMount(): void {
    super.unMount();
    uiSignaller.removeEventListener(UIEventType, this);
  }
}
