/**
 * Builds the icon atlas that the GPU UI draws icons with, from the same lucide
 * icons as the DOM.
 *
 *     npm run ui-icons
 *
 * Writes `icons/lucide-icons.png` and `icons/lucide-icons.json`. Commit both,
 * so only someone who changes the atlas needs msdf-atlas-gen. See
 * `msdf-atlas-gen.mjs` for how to install it.
 *
 * The icons come from `UI_ICON_NAMES` in `lib/iconNames.ts`. To add an icon,
 * add its lucide name there and run the script again.
 *
 * Lucide draws with strokes, 2 units wide with round caps and joins, on a
 * 24-unit grid. A distance field needs filled shapes, so the script flattens
 * each stroke into line segments and fills each segment as a capsule: a
 * rectangle with a half circle on each end. The capsules overlap at each
 * joint, and their union is the round-joined stroke. msdf-atlas-gen reads
 * only fonts, so the script writes the capsules as glyphs in a font made
 * with opentype.js, one icon per private-use code point. msdf-atlas-gen
 * resolves the overlaps with the non-zero fill rule.
 *
 * The atlas is a single-channel SDF, not an MSDF. A round-capped, round-joined
 * stroke has no sharp outer corners, so the extra channels of an MSDF keep
 * nothing. And where many contours overlap, msdf-atlas-gen's MSDF has cracks
 * inside the strokes. The grey PNG loads with the same value in red, green
 * and blue, so the shader's median gives the distance, the same as for text.
 *
 * The JSON holds each icon by name. Plane bounds are in ems from the top left
 * of the icon's square, with y down: the 24-unit grid is one em. Atlas bounds
 * are in texels from the top left of the atlas.
 */
import { icons as lucideIcons } from 'lucide';
import opentype from 'opentype.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UI_ICON_NAMES as ICONS } from '../lib/iconNames.ts';
import { fail, findTool, runTool } from './msdf-atlas-gen.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.join(here, '..', 'icons');
const pngFile = path.join(iconsDir, 'lucide-icons.png');
const jsonFile = path.join(iconsDir, 'lucide-icons.json');

/** Atlas texels per em, which is one icon. */
const EM_SIZE = 64;
/** The width of the distance field in texels, across the edge. */
const DISTANCE_RANGE = 8;

/** Lucide's grid and stroke, in its own units. */
const GRID = 24;
const HALF_STROKE = 1;
/** Font units per grid unit. Large, so rounding to whole font units does not show. */
const UNIT = 100;
const UNITS_PER_EM = GRID * UNIT;
/** The largest distance from a curve to its flattened line segments, in grid units. */
const TOLERANCE = 0.01;
/** The first private-use code point. */
const FIRST_CODE = 0xe000;
/** Control point distance for a quarter circle as a cubic Bézier. */
const KAPPA = 0.5522847498;

function iconNode(name) {
  const pascal = name.replace(/(^|-)([a-z0-9])/g, (_, __, c) => c.toUpperCase());
  const node = lucideIcons[pascal];
  if (!node) fail(`lucide has no icon named "${name}". See https://lucide.dev/icons.`);
  return node;
}

// ---- Flattening: each SVG element to polylines in grid units ----

/** Points along a cubic Bézier, after `p0`, to within TOLERANCE. */
function flattenCubic(p0, p1, p2, p3, out) {
  // The control polygon bounds how far the curve strays from its chord.
  const deviation = Math.max(
    distanceToLine(p1, p0, p3),
    distanceToLine(p2, p0, p3)
  );
  const steps = Math.max(1, Math.ceil(Math.sqrt(deviation / TOLERANCE)));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const s = 1 - t;
    const a = s * s * s;
    const b = 3 * s * s * t;
    const c = 3 * s * t * t;
    const d = t * t * t;
    out.push([
      a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
      a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
    ]);
  }
}

function distanceToLine(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / length;
}

/** Points along an ellipse from `start` to `start + sweep` radians, after the first point. */
function flattenEllipse(cx, cy, rx, ry, rotation, start, sweep, out) {
  // A chord of angle θ strays r(1 - cos(θ/2)) from its arc.
  const r = Math.max(rx, ry);
  const step = 2 * Math.acos(Math.max(-1, 1 - TOLERANCE / r));
  const steps = Math.max(1, Math.ceil(Math.abs(sweep) / step));
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  for (let i = 1; i <= steps; i++) {
    const angle = start + (sweep * i) / steps;
    const x = rx * Math.cos(angle);
    const y = ry * Math.sin(angle);
    out.push([cx + x * cos - y * sin, cy + x * sin + y * cos]);
  }
}

/** An SVG arc, from endpoint to centre form. See SVG 2, appendix B.2.4. */
function flattenArc(p0, rx, ry, degrees, large, sweepFlag, p1, out) {
  if (p0[0] === p1[0] && p0[1] === p1[1]) return;
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (rx === 0 || ry === 0) {
    out.push(p1);
    return;
  }
  const phi = (degrees * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (p0[0] - p1[0]) / 2;
  const dy = (p0[1] - p1[1]) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  // Radii too small to reach the end point scale up.
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  let factor = Math.sqrt(Math.max(0, numerator / denominator));
  if (large === sweepFlag) factor = -factor;
  const cx1 = (factor * rx * y1) / ry;
  const cy1 = (-factor * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (p0[0] + p1[0]) / 2;
  const cy = sin * cx1 + cos * cy1 + (p0[1] + p1[1]) / 2;
  const angle = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const start = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let sweep = angle(
    (x1 - cx1) / rx,
    (y1 - cy1) / ry,
    (-x1 - cx1) / rx,
    (-y1 - cy1) / ry
  );
  if (!sweepFlag && sweep > 0) sweep -= 2 * Math.PI;
  if (sweepFlag && sweep < 0) sweep += 2 * Math.PI;
  flattenEllipse(cx, cy, rx, ry, phi, start, sweep, out);
  // End exactly on the end point.
  out[out.length - 1] = p1;
}

/** The numbers and commands of path data, in order. */
function tokenize(d) {
  return d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
}

/** Path data to polylines. Each is `{ points, closed }`. */
function flattenPath(d) {
  const tokens = tokenize(d);
  const lines = [];
  let line = null;
  let pen = [0, 0];
  let start = [0, 0];
  // The second control point of the last curve, for S and T.
  let lastCubic = null;
  let lastQuad = null;
  let command = '';
  let i = 0;
  const number = () => {
    const value = Number(tokens[i++]);
    if (Number.isNaN(value)) fail(`Bad path data: "${d}"`);
    return value;
  };
  // A0 1 1 packs its flags with no spaces in some files, such as "a1 1 0 01".
  const flag = () => {
    const token = tokens[i];
    if (token === '0' || token === '1') {
      i++;
      return token === '1';
    }
    if (/^[01]/.test(token)) {
      tokens[i] = token.slice(1);
      return token[0] === '1';
    }
    fail(`Bad arc flag in path data: "${d}"`);
  };

  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) command = tokens[i++];
    else if (!command) fail(`Path data must start with a command: "${d}"`);
    const relative = command === command.toLowerCase();
    const ox = relative ? pen[0] : 0;
    const oy = relative ? pen[1] : 0;
    let cubic = null;
    let quad = null;
    switch (command.toUpperCase()) {
      case 'M': {
        pen = [ox + number(), oy + number()];
        start = pen;
        line = { points: [pen], closed: false };
        lines.push(line);
        // Pairs after a move are lines.
        command = relative ? 'l' : 'L';
        break;
      }
      case 'L':
        pen = [ox + number(), oy + number()];
        line.points.push(pen);
        break;
      case 'H':
        pen = [ox + number(), pen[1]];
        line.points.push(pen);
        break;
      case 'V':
        pen = [pen[0], oy + number()];
        line.points.push(pen);
        break;
      case 'C':
      case 'S': {
        const c1 =
          command.toUpperCase() === 'C'
            ? [ox + number(), oy + number()]
            : lastCubic
            ? [2 * pen[0] - lastCubic[0], 2 * pen[1] - lastCubic[1]]
            : pen;
        const c2 = [ox + number(), oy + number()];
        const end = [ox + number(), oy + number()];
        flattenCubic(pen, c1, c2, end, line.points);
        cubic = c2;
        pen = end;
        break;
      }
      case 'Q':
      case 'T': {
        const control =
          command.toUpperCase() === 'Q'
            ? [ox + number(), oy + number()]
            : lastQuad
            ? [2 * pen[0] - lastQuad[0], 2 * pen[1] - lastQuad[1]]
            : pen;
        const end = [ox + number(), oy + number()];
        // A quadratic is a cubic with its controls two thirds of the way to its control point.
        const c1 = [pen[0] + (2 / 3) * (control[0] - pen[0]), pen[1] + (2 / 3) * (control[1] - pen[1])];
        const c2 = [end[0] + (2 / 3) * (control[0] - end[0]), end[1] + (2 / 3) * (control[1] - end[1])];
        flattenCubic(pen, c1, c2, end, line.points);
        quad = control;
        pen = end;
        break;
      }
      case 'A': {
        const rx = number();
        const ry = number();
        const rotation = number();
        const large = flag();
        const sweep = flag();
        const end = [ox + number(), oy + number()];
        flattenArc(pen, rx, ry, rotation, large, sweep, end, line.points);
        pen = end;
        break;
      }
      case 'Z':
        line.closed = true;
        pen = start;
        // A command after Z starts a new polyline at the start point.
        line = { points: [pen], closed: false };
        lines.push(line);
        command = '';
        break;
      default:
        fail(`Path command "${command}" is not supported: "${d}"`);
    }
    lastCubic = cubic;
    lastQuad = quad;
  }
  return lines.filter((l) => l.points.length > 1);
}

function flattenElement(tag, a) {
  const n = (key) => Number(a[key] ?? 0);
  switch (tag) {
    case 'path':
      return flattenPath(a.d);
    case 'line':
      return [{ points: [[n('x1'), n('y1')], [n('x2'), n('y2')]], closed: false }];
    case 'polyline':
    case 'polygon': {
      const values = tokenize(a.points).map(Number);
      const points = [];
      for (let i = 0; i + 1 < values.length; i += 2) points.push([values[i], values[i + 1]]);
      return [{ points, closed: tag === 'polygon' }];
    }
    case 'circle':
    case 'ellipse': {
      const rx = tag === 'circle' ? n('r') : n('rx');
      const ry = tag === 'circle' ? n('r') : n('ry');
      const points = [[n('cx') + rx, n('cy')]];
      flattenEllipse(n('cx'), n('cy'), rx, ry, 0, 0, 2 * Math.PI, points);
      return [{ points, closed: true }];
    }
    case 'rect': {
      const [x, y, w, h] = [n('x'), n('y'), n('width'), n('height')];
      // A missing radius takes the other's value, as in SVG.
      let rx = Math.min(Number(a.rx ?? a.ry ?? 0), w / 2);
      let ry = Math.min(Number(a.ry ?? a.rx ?? 0), h / 2);
      if (rx <= 0 || ry <= 0) rx = ry = 0;
      const d =
        `M${x + rx} ${y}H${x + w - rx}` +
        (rx ? `A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}` : '') +
        `V${y + h - ry}` +
        (rx ? `A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}` : '') +
        `H${x + rx}` +
        (rx ? `A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}` : '') +
        `V${y + ry}` +
        (rx ? `A${rx} ${ry} 0 0 1 ${x + rx} ${y}` : '') +
        'Z';
      return flattenPath(d);
    }
    default:
      fail(`The SVG element <${tag}> is not supported.`);
  }
}

// ---- Outlines: each line segment to a capsule, in font units ----

/** Grid units, y down, to font units, y up, with the grid's top on the ascender. */
function toFont([x, y]) {
  return [x * UNIT, (GRID - y) * UNIT];
}

/**
 * A quarter circle round `c` from `c + r·u` to `c + r·v`, where `v` is `u`
 * turned a quarter counterclockwise.
 */
function quarter(path, c, r, u, v) {
  const end = [c[0] + r * v[0], c[1] + r * v[1]];
  path.curveTo(
    c[0] + r * (u[0] + KAPPA * v[0]),
    c[1] + r * (u[1] + KAPPA * v[1]),
    c[0] + r * (v[0] + KAPPA * u[0]),
    c[1] + r * (v[1] + KAPPA * u[1]),
    end[0],
    end[1]
  );
}

/**
 * Adds a capsule round the segment from `a` to `b`, in font units. Every
 * contour runs counterclockwise, so their union fills by the non-zero rule.
 */
function addCapsule(path, a, b) {
  const r = HALF_STROKE * UNIT;
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  // A zero-length segment, such as lucide's dots, is a circle.
  const d = length > 1e-6 ? [(b[0] - a[0]) / length, (b[1] - a[1]) / length] : [1, 0];
  const n = [-d[1], d[0]];
  const minus = (v) => [-v[0], -v[1]];
  path.moveTo(a[0] - r * n[0], a[1] - r * n[1]);
  path.lineTo(b[0] - r * n[0], b[1] - r * n[1]);
  quarter(path, b, r, minus(n), d);
  quarter(path, b, r, d, n);
  path.lineTo(a[0] + r * n[0], a[1] + r * n[1]);
  quarter(path, a, r, n, minus(d));
  quarter(path, a, r, minus(d), minus(n));
  path.close();
}

/** The icon's strokes as one glyph outline, and how many capsules it has. */
function iconPath(name) {
  const path = new opentype.Path();
  let capsules = 0;
  for (const [tag, attributes] of iconNode(name))
    for (const { points, closed } of flattenElement(tag, attributes)) {
      const font = points.map(toFont);
      if (closed) font.push(font[0]);
      if (font.length === 1) font.push(font[0]);
      for (let i = 1; i < font.length; i++) {
        const [a, b] = [font[i - 1], font[i]];
        // Skip a repeated point, unless the polyline is only that point.
        if (a[0] === b[0] && a[1] === b[1] && font.length > 2) continue;
        addCapsule(path, a, b);
        capsules++;
      }
    }
  return { path, capsules };
}

function writeFont(file) {
  const glyphs = [
    new opentype.Glyph({ name: '.notdef', advanceWidth: UNITS_PER_EM, path: new opentype.Path() }),
  ];
  ICONS.forEach((name, i) => {
    const { path: outline, capsules } = iconPath(name);
    glyphs.push(
      new opentype.Glyph({
        name,
        unicode: FIRST_CODE + i,
        advanceWidth: UNITS_PER_EM,
        path: outline,
      })
    );
    console.log(`${name}: ${capsules} capsules`);
  });
  const font = new opentype.Font({
    familyName: 'Mica Icons',
    styleName: 'Regular',
    unitsPerEm: UNITS_PER_EM,
    ascender: UNITS_PER_EM,
    descender: 0,
    glyphs,
  });
  fs.writeFileSync(file, Buffer.from(font.toArrayBuffer()));
}

function buildAtlas(command, fontFile) {
  const chars = ICONS.map((_, i) => `0x${(FIRST_CODE + i).toString(16)}`).join(', ');
  runTool(
    command,
    [
      '-font', fontFile,
      '-chars', chars,
      '-type', 'sdf',
      '-size', String(EM_SIZE),
      '-pxrange', String(DISTANCE_RANGE),
      '-yorigin', 'top',
      '-format', 'png',
      '-imageout', pngFile,
      '-json', jsonFile,
    ],
    [pngFile, jsonFile]
  );
}

/** Rewrites msdf-atlas-gen's JSON with each icon by name, from the top left of its square. */
function nameIcons() {
  const json = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  if (json.atlas?.type !== 'sdf' || !Array.isArray(json.glyphs))
    fail(`${jsonFile} is not the JSON this script expects from msdf-atlas-gen.`);
  const byCode = new Map(json.glyphs.map((g) => [g.unicode, g]));
  const icons = ICONS.map((name, i) => {
    const glyph = byCode.get(FIRST_CODE + i);
    if (!glyph?.planeBounds || !glyph.atlasBounds)
      fail(`The atlas has no shape for "${name}".`);
    // The square's top is on the ascender, one em above the baseline.
    const { left, top, right, bottom } = glyph.planeBounds;
    return {
      name,
      planeBounds: { left, top: top + 1, right, bottom: bottom + 1 },
      atlasBounds: glyph.atlasBounds,
    };
  });
  fs.writeFileSync(jsonFile, JSON.stringify({ atlas: json.atlas, icons }));
  console.log(`Atlas: ${json.atlas.width} × ${json.atlas.height} texels, ${pngFile}`);
}

function main() {
  const command = findTool();
  fs.mkdirSync(iconsDir, { recursive: true });
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mica-icons-'));
  const fontFile = path.join(temp, 'icons.otf');
  try {
    writeFont(fontFile);
    buildAtlas(command, fontFile);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
  nameIcons();
}

main();
