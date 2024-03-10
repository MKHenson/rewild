// var Vec3 = require("../src/math/Vec3");
// var Quaternion = require("../src/math/Quaternion");
// var Box = require('../src/shapes/Box');
// var Heightfield = require('../src/shapes/Heightfield');
// var ConvexPolyhedron = require('../src/shapes/ConvexPolyhedron');

// module.exports = {

//     updateMaxValue: function(test){
//         var hfShape = createHeightfield();
//         hfShape.data[0][0] = 10;
//         hfShape.updateMaxValue();
//         test.equal(hfShape.maxValue, 10);
//         test.done();
//     },

//     updateMinValue: function(test){
//         var hfShape = createHeightfield();
//         hfShape.data[0][0] = -10;
//         hfShape.updateMinValue();
//         test.equal(hfShape.minValue, -10);
//         test.done();
//     },

//     setHeightValueAtIndex: function(test){
//         var hfShape = createHeightfield();
//         hfShape.setHeightValueAtIndex(0, 0, 10);
//         test.equal(hfShape.data[0][0], 10);
//         test.done();
//     },

//     getIndexOfPosition: function(test){
//         var hfShape = createHeightfield();
//         var result = [];
//         hfShape.getIndexOfPosition(0, 0, result);
//         test.deepEqual(result, [0,0]);
//         test.done();
//     },
// };

import { init, wasm } from './utils/wasm-module';

describe('Heightfield', () => {
  beforeAll(async () => {
    await init();
  });

  it('correctly calculates the AABB', () => {
    const hfShape = wasm.createHeightfield(1, false, 20, wasm.f32NaN(), 0);

    const min = wasm.createPhysicsVec3(0, 0, 0);
    const max = wasm.createPhysicsVec3(0, 0, 0);

    wasm.heightField_calculateWorldAABB(hfShape, min, max);

    expect(wasm.physicsVec3X(min)).toBe(-wasm.f32Max());
    expect(wasm.physicsVec3X(max)).toBe(wasm.f32Max());

    expect(wasm.physicsVec3Y(min)).toBe(-wasm.f32Max());
    expect(wasm.physicsVec3Y(max)).toBe(wasm.f32Max());
  });

  it('correctly gets the getConvexTrianglePillar', () => {
    const hfShape = wasm.createHeightfield(1, false, 2, wasm.f32NaN(), 0);
    wasm.heightField_getConvexTrianglePillar(hfShape, 0, 0, false);
    expect(wasm.heightfield_pillarConvexVerticesLength(hfShape)).toBe(6);
    // prettier-ignore
    expect(wasm.physicsVec3X(wasm.heightfield_pillarConvexVerticesGetAt(hfShape, 0))).toBe(-0.25);
    // prettier-ignore
    expect(wasm.physicsVec3Y(wasm.heightfield_pillarConvexVerticesGetAt(hfShape, 0))).toBe(-0.25);
    // prettier-ignore
    expect(wasm.physicsVec3Z(wasm.heightfield_pillarConvexVerticesGetAt(hfShape, 0))).toBe(0.5);

    // prettier-ignore
    expect(wasm.physicsVec3X(wasm.heightfield_pillarConvexVerticesGetAt(hfShape, 1))).toBe(0.75);
    // prettier-ignore
    expect(wasm.physicsVec3Y(wasm.heightfield_pillarConvexVerticesGetAt(hfShape, 1))).toBe(-0.25);
    // prettier-ignore
    expect(wasm.physicsVec3Z(wasm.heightfield_pillarConvexVerticesGetAt(hfShape, 1))).toBe(0.5);

    // prettier-ignore
    expect(wasm.physicsVec3X(wasm.heightfield_pillarConvexVerticesGetAt(hfShape, 2))).toBe(-0.25);
    // prettier-ignore
    expect(wasm.physicsVec3Y(wasm.heightfield_pillarConvexVerticesGetAt(hfShape, 2))).toBe(0.75);
    // prettier-ignore
    expect(wasm.physicsVec3Z(wasm.heightfield_pillarConvexVerticesGetAt(hfShape, 2))).toBe(0.5);

    let pillarOffset = wasm.heightfield_pillarOffset(hfShape);
    expect(wasm.physicsVec3X(pillarOffset)).toBe(0.25);
    expect(wasm.physicsVec3Y(pillarOffset)).toBe(0.25);
    expect(wasm.physicsVec3Z(pillarOffset)).toBe(0.5);

    wasm.heightField_getConvexTrianglePillar(hfShape, 0, 0, true);
    expect(wasm.heightfield_pillarConvexVerticesLength(hfShape)).toBe(6);

    // prettier-ignore
    expect(wasm.physicsVec3X(wasm.heightfield_pillarConvexVerticesGetAt(hfShape, 0))).toBe(0.25);
    // prettier-ignore
    expect(wasm.physicsVec3Y(wasm.heightfield_pillarConvexVerticesGetAt(hfShape, 0))).toBe(0.25);
    // prettier-ignore
    expect(wasm.physicsVec3Z(wasm.heightfield_pillarConvexVerticesGetAt(hfShape, 0))).toBe(0.5);

    // prettier-ignore
    expect(wasm.physicsVec3X(wasm.heightfield_pillarConvexVerticesGetAt(hfShape, 1))).toBe(-0.75);
    // prettier-ignore
    expect(wasm.physicsVec3Y(wasm.heightfield_pillarConvexVerticesGetAt(hfShape, 1))).toBe(0.25);
    // prettier-ignore
    expect(wasm.physicsVec3Z(wasm.heightfield_pillarConvexVerticesGetAt(hfShape, 1))).toBe(0.5);

    // prettier-ignore
    expect(wasm.physicsVec3X(wasm.heightfield_pillarConvexVerticesGetAt(hfShape, 2))).toBe(0.25);
    // prettier-ignore
    expect(wasm.physicsVec3Y(wasm.heightfield_pillarConvexVerticesGetAt(hfShape, 2))).toBe(-0.75);
    // prettier-ignore
    expect(wasm.physicsVec3Z(wasm.heightfield_pillarConvexVerticesGetAt(hfShape, 2))).toBe(0.5);

    pillarOffset = wasm.heightfield_pillarOffset(hfShape);
    expect(wasm.physicsVec3X(pillarOffset)).toBe(0.75);
    expect(wasm.physicsVec3Y(pillarOffset)).toBe(0.75);
    expect(wasm.physicsVec3Z(pillarOffset)).toBe(0.5);
  });

  it('correctly gets the triangle', () => {
    const hfShape = wasm.createHeightfield(1, false, 2, wasm.f32NaN(), 0);
    const a = wasm.createPhysicsVec3(0, 0, 0);
    const b = wasm.createPhysicsVec3(0, 0, 0);
    const c = wasm.createPhysicsVec3(0, 0, 0);

    wasm.heightfield_getTriangle(hfShape, 0, 0, false, a, b, c);
    expect(wasm.physicsVec3X(a)).toBe(0);
    expect(wasm.physicsVec3Y(a)).toBe(0);
    expect(wasm.physicsVec3Z(a)).toBe(1);

    expect(wasm.physicsVec3X(b)).toBe(1);
    expect(wasm.physicsVec3Y(b)).toBe(0);
    expect(wasm.physicsVec3Z(b)).toBe(1);

    expect(wasm.physicsVec3X(c)).toBe(0);
    expect(wasm.physicsVec3Y(c)).toBe(1);
    expect(wasm.physicsVec3Z(c)).toBe(1);

    wasm.heightfield_getTriangle(hfShape, 0, 0, true, a, b, c);
    expect(wasm.physicsVec3X(a)).toBe(1);
    expect(wasm.physicsVec3Y(a)).toBe(1);
    expect(wasm.physicsVec3Z(a)).toBe(1);

    expect(wasm.physicsVec3X(b)).toBe(0);
    expect(wasm.physicsVec3Y(b)).toBe(1);
    expect(wasm.physicsVec3Z(b)).toBe(1);

    expect(wasm.physicsVec3X(c)).toBe(1);
    expect(wasm.physicsVec3Y(c)).toBe(0);
    expect(wasm.physicsVec3Z(c)).toBe(1);
  });

  it('can call update on a heightfield', () => {
    const hfShape = wasm.createHeightfield();
    wasm.heightUpdate(hfShape);
  });

  it('correctly gets the height at a point', () => {
    const hfShape = wasm.createHeightfield(1, true, 2);
    const h0 = wasm.heightfield_getHeightAt(hfShape, 0, 0);
    const h1 = wasm.heightfield_getHeightAt(hfShape, 0.25, 0.25);
    const h2 = wasm.heightfield_getHeightAt(hfShape, 0.75, 0.75);
    const h3 = wasm.heightfield_getHeightAt(hfShape, 0.99, 0.99);

    expect(h0).toBe(0);
    expect(h0).toBeLessThan(h1);
    expect(h1).toBeLessThan(h2);
    expect(h2).toBeLessThan(h3);
  });

  it('correctly gets the min and max values', () => {
    const hfShape = wasm.createHeightfield();
    expect(wasm.heightfield_getRectMin(hfShape, 0, 0, 1, 1)).toBe(1);
    expect(wasm.heightfield_getRectMax(hfShape, 0, 0, 1, 1)).toBe(1);
  });
});
