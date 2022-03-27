import { BoxGeometry } from "../geometries/BoxGeometry";
import { PlaneGeometry } from "../geometries/PlaneGeometry";
import { SphereGeometry } from "../geometries/SphereGeometry";
import { print } from "../Imports";

export function createBox(
  width: f32 = 1,
  height: f32 = 1,
  depth: f32 = 1,
  widthSegments: u16 = 1,
  heightSegments: u16 = 1,
  depthSegments: u16 = 1
): BoxGeometry {
  const geometry = new BoxGeometry(width, height, depth, widthSegments, heightSegments, depthSegments);
  return geometry;
}

export function createPlane(
  width: f32 = 1,
  height: f32 = 1,
  widthSegments: u16 = 1,
  heightSegments: u16 = 1
): PlaneGeometry {
  const geometry = new PlaneGeometry(width, height, widthSegments, heightSegments);
  return geometry;
}

export function createSphere(radius: f32 = 1, widthSegments: u16 = 32, heightSegments: u16 = 16): SphereGeometry {
  const geometry = new SphereGeometry(radius, widthSegments, heightSegments);
  return geometry;
}

export function addVertGeometry(verts: Float32Array): i32 {
  print("Added a new object");
  print(`We received your vector ${verts[0]}, ${verts[1]}, ${verts[2]}`);
  return 0;
}
