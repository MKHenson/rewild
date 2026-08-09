/**
 * Nautilus shell geometry. The shell wall follows a logarithmic spiral
 * r = e^(growth * theta), and septa at even angular steps cut it into chambers.
 * Output is plain data (path strings + a viewBox) so the same description can
 * drive a non-DOM renderer later.
 */

export interface NautilusChamber {
  /** Path data for the chamber outline, in viewBox space. */
  d: string;
  /** Position along the shell: 0 at the innermost chamber, 1 at the outermost. */
  t: number;
}

export interface NautilusGeometry {
  chambers: NautilusChamber[];
  /** viewBox the chamber paths are authored against. */
  viewBox: string;
}

export interface NautilusOptions {
  /** Number of chambers the spiral is divided into. */
  chambers?: number;
  /** Total revolutions of the spiral. */
  turns?: number;
  /** Factor the radius grows by over one full revolution. */
  growthPerTurn?: number;
  /**
   * Inner wall radius as a fraction of the outer wall. Defaults to
   * 1 / growthPerTurn, which lands the inner wall exactly on the previous
   * whorl's outer wall so the whorls nest without a gap.
   */
  innerRatio?: number;
  /**
   * How far each septum bows back toward the apex, as a fraction of its own
   * length. 0 draws them as straight radial walls.
   */
  septumBow?: number;
  /** Points sampled along each spiral arc, per chamber. */
  segments?: number;
  /** Edge length of the square viewBox the shell is fitted into. */
  viewSize?: number;
  /** Margin around the shell, as a fraction of the viewBox. */
  padding?: number;
}

interface Command {
  cmd: 'M' | 'L' | 'Q';
  /** Raw x,y pairs — a Q carries its control point first. */
  pts: number[];
}

const round = (value: number) => Math.round(value * 1000) / 1000;

export function createNautilusGeometry(
  options: NautilusOptions = {}
): NautilusGeometry {
  const chamberCount = Math.max(1, Math.floor(options.chambers ?? 32));
  const turns = options.turns ?? 3;
  const growthPerTurn = options.growthPerTurn ?? 2.6;
  const innerRatio = options.innerRatio ?? 1 / growthPerTurn;
  const septumBow = options.septumBow ?? 0.14;
  const segments = Math.max(1, Math.floor(options.segments ?? 6));
  const viewSize = options.viewSize ?? 100;
  const padding = options.padding ?? 0.06;

  const growth = Math.log(growthPerTurn) / (Math.PI * 2);
  const totalTheta = turns * Math.PI * 2;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  // A point on the spiral. SVG y grows downward, so the sine is negated to
  // coil the shell anticlockwise on screen.
  const wall = (theta: number, ratio: number) => {
    const radius = Math.exp(growth * theta) * ratio;
    return [radius * Math.cos(theta), -radius * Math.sin(theta)];
  };

  // Control point for a septum, displaced along the tangent toward the apex so
  // the wall is concave on the aperture side, as it is in a real shell.
  const septumControl = (theta: number, from: number[], to: number[]) => {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const length = Math.sqrt(dx * dx + dy * dy) * septumBow;
    return [
      (from[0] + to[0]) / 2 + Math.sin(theta) * length,
      (from[1] + to[1]) / 2 + Math.cos(theta) * length,
    ];
  };

  const track = (point: number[]) => {
    if (point[0] < minX) minX = point[0];
    if (point[0] > maxX) maxX = point[0];
    if (point[1] < minY) minY = point[1];
    if (point[1] > maxY) maxY = point[1];
    return point;
  };

  const outlines: Command[][] = [];

  for (let i = 0; i < chamberCount; i++) {
    const theta0 = (i / chamberCount) * totalTheta;
    const theta1 = ((i + 1) / chamberCount) * totalTheta;
    const commands: Command[] = [];

    // Out along the shell wall...
    for (let s = 0; s <= segments; s++) {
      const theta = theta0 + ((theta1 - theta0) * s) / segments;
      commands.push({ cmd: s === 0 ? 'M' : 'L', pts: track(wall(theta, 1)) });
    }

    // ...across the leading septum, back along the inner wall...
    const outer1 = wall(theta1, 1);
    const inner1 = wall(theta1, innerRatio);
    commands.push({
      cmd: 'Q',
      pts: septumControl(theta1, outer1, inner1).concat(track(inner1)),
    });

    for (let s = segments - 1; s >= 0; s--) {
      const theta = theta0 + ((theta1 - theta0) * s) / segments;
      commands.push({ cmd: 'L', pts: track(wall(theta, innerRatio)) });
    }

    // ...and closed by the trailing septum.
    const inner0 = wall(theta0, innerRatio);
    const outer0 = wall(theta0, 1);
    commands.push({
      cmd: 'Q',
      pts: septumControl(theta0, inner0, outer0).concat(outer0),
    });

    outlines.push(commands);
  }

  // Fit the shell into a square viewBox, aspect preserved and centred, so a
  // consumer can use one stroke width regardless of the options above.
  const inset = viewSize * padding;
  const width = maxX - minX;
  const height = maxY - minY;
  const scale = (viewSize - inset * 2) / Math.max(width, height);
  const offsetX = (viewSize - width * scale) / 2 - minX * scale;
  const offsetY = (viewSize - height * scale) / 2 - minY * scale;

  const chambers: NautilusChamber[] = outlines.map((commands, i) => {
    let d = '';
    for (const command of commands) {
      const coords: string[] = [];
      for (let p = 0; p < command.pts.length; p += 2) {
        coords.push(
          `${round(command.pts[p] * scale + offsetX)} ${round(
            command.pts[p + 1] * scale + offsetY
          )}`
        );
      }
      d += command.cmd + coords.join(' ');
    }

    return {
      d: d + 'Z',
      t: chamberCount === 1 ? 0 : i / (chamberCount - 1),
    };
  });

  return { chambers, viewBox: `0 0 ${round(viewSize)} ${round(viewSize)}` };
}
