import { ConvexPolyhedron } from '../shapes/ConvexPolyhedron';
import { Vec3 } from '../math/Vec3';
import { Shape } from './Shape';

/**
 * Cylinder class.
 * @example
 *     const radiusTop = 0.5
 *     const radiusBottom = 0.5
 *     const height = 2
 *     const numSegments = 12
 *     const cylinderShape = new CANNON.Cylinder(radiusTop, radiusBottom, height, numSegments)
 *     const cylinderBody = new CANNON.Body({ mass: 1, shape: cylinderShape })
 *     world.addBody(cylinderBody)
 */
export class Cylinder extends ConvexPolyhedron {
  /** The radius of the top of the Cylinder. */
  radiusTop: f32;
  /** The radius of the bottom of the Cylinder. */
  radiusBottom: f32;
  /** The height of the Cylinder. */
  height: f32;
  /** The number of segments to build the cylinder out of. */
  numSegments: i32;

  /**
   * @param radiusTop The radius of the top of the Cylinder.
   * @param radiusBottom The radius of the bottom of the Cylinder.
   * @param height The height of the Cylinder.
   * @param numSegments The number of segments to build the cylinder out of.
   */
  constructor(
    radiusTop: f32 = 1,
    radiusBottom: f32 = 1,
    height: f32 = 1,
    numSegments: i32 = 8
  ) {
    if (radiusTop < 0) {
      throw new Error('The cylinder radiusTop cannot be negative.');
    }

    if (radiusBottom < 0) {
      throw new Error('The cylinder radiusBottom cannot be negative.');
    }

    const N = numSegments;
    const vertices: (Vec3 | null)[] = [];
    const axes: Vec3[] = [];
    const faces: (Array<i32> | null)[] = [];
    const bottomface: i32[] = [];
    const topface: i32[] = [];

    // First bottom point
    vertices.push(
      new Vec3(
        -radiusBottom * Mathf.sin(0),
        -height * 0.5,
        radiusBottom * Mathf.cos(0)
      )
    );
    bottomface.push(0);

    // First top point
    vertices.push(
      new Vec3(
        -radiusTop * Mathf.sin(0),
        height * 0.5,
        radiusTop * Mathf.cos(0)
      )
    );
    topface.push(1);

    for (let i: i32 = 0; i < N; i++) {
      const theta: f32 = ((2.0 * Mathf.PI) / f32(N)) * (f32(i) + 1);
      const thetaN: f32 = ((2.0 * Mathf.PI) / f32(N)) * (f32(i) + 0.5);
      if (i < N - 1) {
        // Bottom
        vertices.push(
          new Vec3(
            -radiusBottom * Mathf.sin(theta),
            -height * 0.5,
            radiusBottom * Mathf.cos(theta)
          )
        );
        bottomface.push(2 * i + 2);
        // Top
        vertices.push(
          new Vec3(
            -radiusTop * Mathf.sin(theta),
            height * 0.5,
            radiusTop * Mathf.cos(theta)
          )
        );
        topface.push(2 * i + 3);

        // Face
        faces.push([2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2]);
      } else {
        faces.push([2 * i, 2 * i + 1, 1, 0]); // Connect
      }

      // Axis: we can cut off half of them if we have even number of segments
      if (N % 2 == 1 || i < N / 2) {
        axes.push(new Vec3(-Mathf.sin(thetaN), 0, Mathf.cos(thetaN)));
      }
    }
    faces.push(bottomface);
    axes.push(new Vec3(0, 1, 0));

    // Reorder top face
    const temp: i32[] = [];
    for (let i: i32 = 0; i < topface.length; i++) {
      temp.push(topface[topface.length - i - 1]);
    }
    faces.push(temp);

    super(vertices, faces, [], axes);

    this.type = Shape.CYLINDER;
    this.radiusTop = radiusTop;
    this.radiusBottom = radiusBottom;
    this.height = height;
    this.numSegments = numSegments;
  }
}
