import { Heightfield, Vec3, Quaternion, Body } from 'rewild-physics';

export function heightUpdate(terrain: Heightfield): void {
  terrain.update();
}

export function heightField_calculateWorldAABB(
  terrain: Heightfield,
  min: Vec3,
  max: Vec3
): void {
  terrain.calculateWorldAABB(new Vec3(), new Quaternion(), min, max);
}

export function heightField_getConvexTrianglePillar(
  terrain: Heightfield,
  x: i32,
  y: i32,
  reverse: boolean
): void {
  terrain.getConvexTrianglePillar(x, y, reverse);
}

export function heightfield_pillarConvexVerticesLength(
  terrain: Heightfield
): i32 {
  return terrain.pillarConvex.vertices.length;
}

export function heightfield_pillarConvexVerticesGetAt(
  terrain: Heightfield,
  i: i32
): Vec3 {
  return terrain.pillarConvex.vertices[i]!;
}

export function heightfield_pillarOffset(terrain: Heightfield): Vec3 {
  return terrain.pillarOffset;
}

export function heightfield_getTriangle(
  terrain: Heightfield,
  xi: i32,
  yi: i32,
  upper: boolean,
  a: Vec3,
  b: Vec3,
  c: Vec3
): void {
  return terrain.getTriangle(xi, yi, upper, a, b, c);
}

export function heightfield_getRectMin(
  terrain: Heightfield,
  iMinX: i32,
  iMinY: i32,
  iMaxX: i32,
  iMaxY: i32
): f32 {
  const values = new Array<f32>(2);
  terrain.getRectMinMax(iMinX, iMinY, iMaxX, iMaxY, values);
  return values[0];
}

export function heightfield_getRectMax(
  terrain: Heightfield,
  iMinX: i32,
  iMinY: i32,
  iMaxX: i32,
  iMaxY: i32
): f32 {
  const values = new Array<f32>(2);
  terrain.getRectMinMax(iMinX, iMinY, iMaxX, iMaxY, values);
  return values[1];
}

export function heightfield_getHeightAt(
  terrain: Heightfield,
  x: f32,
  y: f32,
  edgeClamp: boolean = false
): f32 {
  return terrain.getHeightAt(x, y, edgeClamp);
}

export function createHeightfield(
  elementSize: f32 = 1.0,
  linear: boolean = false,
  size: i32 = 20,
  maxValue: f32 = f32.NaN,
  minValue: f32 = f32.NaN,
  fillValue: f32 = 1
): Heightfield {
  const matrix: f32[][] = [];
  for (let i: f32 = 0; i < f32(size); i++) {
    matrix.push([]);
    for (let j: f32 = 0; j < f32(size); j++) {
      if (linear) {
        matrix[i32(i)].push(i + j);
      } else {
        matrix[i32(i)].push(fillValue);
      }
    }
  }

  return new Heightfield(matrix, maxValue, minValue, elementSize);
}

export function physicsCreateBodyForHeightfield(
  terrain: Heightfield,
  mass: f32 = 0
): Body {
  const body = new Body();
  body.addShape(terrain);
  body.mass = mass;
  return body;
}
