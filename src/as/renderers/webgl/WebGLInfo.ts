import { PrimitiveType } from "../../../common/GLEnums";

export class WebGLInfoMemory {
  geometries: i32;
  textures: i32;
}

export class WebGLInfoRender {
  frame: i32;
  calls: i32;
  triangles: i32;
  points: i32;
  lines: i32;
}

export class WebGLInfo {
  memory: WebGLInfoMemory;
  render: WebGLInfoRender;

  constructor() {
    this.memory = {
      geometries: 0,
      textures: 0,
    };

    this.render = {
      frame: 0,
      calls: 0,
      triangles: 0,
      points: 0,
      lines: 0,
    };
  }

  update(count: i32, mode: PrimitiveType, instanceCount: i32): void {
    const render = this.render;
    render.calls++;

    switch (mode) {
      case PrimitiveType.TRIANGLES:
        render.triangles += instanceCount * (count / 3);
        break;

      case PrimitiveType.LINES:
        render.lines += instanceCount * (count / 2);
        break;

      case PrimitiveType.LINE_STRIP:
        render.lines += instanceCount * (count - 1);
        break;

      case PrimitiveType.LINE_LOOP:
        render.lines += instanceCount * count;
        break;

      case PrimitiveType.POINTS:
        render.points += instanceCount * count;
        break;

      default:
        throw new Error("WebGLInfo: Unknown draw mode: " + mode);
    }
  }

  reset(): void {
    const render = this.render;
    render.frame++;
    render.calls = 0;
    render.triangles = 0;
    render.points = 0;
    render.lines = 0;
  }
}
