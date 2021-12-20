import { EventAttachable } from "../core/EventAttachable";
import { Event } from "../core/Event";
import { EventDispatcher } from "../core/EventDispatcher";
import { print } from "../Imports";

const moveEventDown: Event = new Event("mousedown");
const moveEventUp: Event = new Event("mouseup");
const moveEventMove: Event = new Event("mousemove");
const moveEventWheel: Event = new Event("wheel");

export namespace ASInputManager {
  export class InputManager extends EventDispatcher {
    onWheel(event: ASInputManager.MouseEvent): void {
      moveEventWheel.target = this;
      moveEventWheel.attachment = event;
      this.dispatchEvent(moveEventWheel);
    }

    onMouseDown(event: ASInputManager.MouseEvent): void {
      moveEventDown.target = this;
      moveEventDown.attachment = event;
      this.dispatchEvent(moveEventDown);
    }

    onMouseUp(event: ASInputManager.MouseEvent): void {
      moveEventUp.target = this;
      moveEventUp.attachment = event;
      this.dispatchEvent(moveEventUp);
      print(`Mouse Click [${event.clientX}, ${event.clientY}]`);
    }

    onMouseMove(event: ASInputManager.MouseEvent): void {
      moveEventMove.target = this;
      moveEventMove.attachment = event;
      this.dispatchEvent(moveEventMove);
    }
  }

  export function getInputManager(): InputManager {
    return inputManager;
  }

  export class MouseEvent extends EventAttachable {
    constructor(
      public clientX: i32,
      public clientY: i32,
      public pageX: i32,
      public pageY: i32,
      public ctrlKey: boolean,
      public shiftKey: boolean,
      public altKey: boolean,
      public button: i32,
      public buttons: i32,
      public targetX: i32,
      public targetY: i32,
      public targetWidth: i32,
      public targetHeight: i32,
      public delta: i16
    ) {
      super();
    }
  }

  export function createMouseEvent(
    clientX: i32,
    clientY: i32,
    pageX: i32,
    pageY: i32,
    ctrlKey: boolean,
    shiftKey: boolean,
    altKey: boolean,
    button: i32,
    buttons: i32,
    targetX: i32,
    targetY: i32,
    targetWidth: i32,
    targetHeight: i32,
    delta: i16
  ): MouseEvent {
    return new MouseEvent(
      clientX,
      clientY,
      pageX,
      pageY,
      ctrlKey,
      shiftKey,
      altKey,
      button,
      buttons,
      targetX,
      targetY,
      targetWidth,
      targetHeight,
      delta
    );
  }
}

export const inputManager = new ASInputManager.InputManager();

//   // Set all geometry to the original material
//   const keys = materialsMap.keys();
//   for (let i: i32 = 0; i < keys.length; i++) {
//     keys[i].materials = [materialsMap.get(keys[i])];
//   }

//   const getCanvasRelativePositionX: f32 = (f32(event.clientX - event.targetX) * width) / f32(event.targetWidth);
//   const getCanvasRelativePositionY: f32 = (f32(event.clientY - event.targetY) * height) / f32(event.targetHeight);

//   const normalizedCoords = toNormalizedCoord(getCanvasRelativePositionX, getCanvasRelativePositionY, width, height);
//   raycaster.setFromCamera(normalizedCoords, activeCamera);
//   const intersection = raycaster.intersectObjects(scene.children);
//   if (intersection) {
//     for (let i: i32 = 0; i < intersection.length; i++)
//       if (intersection[i].object instanceof Mesh) {
//         const mesh = intersection[i].object as Mesh;
//         mesh.materials.splice(0, 1);
//         mesh.materials.push(debugMat);
//       }
//   }
// }
