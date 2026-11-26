/**
 * Images drawn in code, so the examples need no image files. Each one is
 * drawn once and kept. Shapes have clear edges, to check that edges do not
 * darken when an image is filtered or made smaller.
 */

export type ShapeKind =
  | 'circle'
  | 'square'
  | 'triangle'
  | 'diamond'
  | 'star'
  | 'hexagon';

export const SHAPES: ShapeKind[] = [
  'circle',
  'square',
  'triangle',
  'diamond',
  'star',
  'hexagon',
];

export const SHAPE_COLORS = [
  '#e4572e',
  '#f2c14e',
  '#76b041',
  '#4ea5d9',
  '#9b5de5',
  '#f15bb5',
];

const canvases = new Map<string, HTMLCanvasElement>();

function cached(
  key: string,
  width: number,
  height: number,
  draw: (g: CanvasRenderingContext2D) => void
): HTMLCanvasElement {
  let canvas = canvases.get(key);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    draw(canvas.getContext('2d')!);
    canvases.set(key, canvas);
  }
  return canvas;
}

function outline(g: CanvasRenderingContext2D, kind: ShapeKind, s: number) {
  const c = s / 2;
  const r = s * 0.42;
  g.beginPath();
  switch (kind) {
    case 'circle':
      g.arc(c, c, r, 0, Math.PI * 2);
      break;
    case 'square':
      g.roundRect(c - r * 0.85, c - r * 0.85, r * 1.7, r * 1.7, s * 0.08);
      break;
    case 'triangle':
      g.moveTo(c, c - r);
      g.lineTo(c + r, c + r * 0.8);
      g.lineTo(c - r, c + r * 0.8);
      break;
    case 'diamond':
      g.moveTo(c, c - r);
      g.lineTo(c + r * 0.75, c);
      g.lineTo(c, c + r);
      g.lineTo(c - r * 0.75, c);
      break;
    case 'star':
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const d = i % 2 ? r * 0.45 : r;
        g.lineTo(c + Math.cos(a) * d, c + Math.sin(a) * d);
      }
      break;
    case 'hexagon':
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
      }
      break;
  }
  g.closePath();
}

/** A shape in a colour on a clear background, with light from the top left. */
export function shape(
  kind: ShapeKind,
  color: string,
  size = 128
): HTMLCanvasElement {
  return cached(`shape ${kind} ${color} ${size}`, size, size, (g) => {
    outline(g, kind, size);
    g.fillStyle = color;
    g.fill();
    const light = g.createLinearGradient(0, 0, size, size);
    light.addColorStop(0, '#ffffff66');
    light.addColorStop(0.6, '#ffffff00');
    light.addColorStop(1, '#00000040');
    g.fillStyle = light;
    g.fill();
    g.lineWidth = Math.max(1, size / 32);
    g.strokeStyle = '#ffffffcc';
    g.stroke();
  });
}

/** A small scene, wider than it is tall, for `objectFit`. 200 by 120. */
export function landscape(): HTMLCanvasElement {
  return cached('landscape', 200, 120, (g) => {
    const sky = g.createLinearGradient(0, 0, 0, 120);
    sky.addColorStop(0, '#1b3b6f');
    sky.addColorStop(1, '#e0835a');
    g.fillStyle = sky;
    g.fillRect(0, 0, 200, 120);
    g.fillStyle = '#f7d046';
    g.beginPath();
    g.arc(150, 45, 18, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2a4d3a';
    g.beginPath();
    g.moveTo(0, 120);
    g.lineTo(0, 80);
    g.quadraticCurveTo(60, 50, 110, 85);
    g.quadraticCurveTo(160, 105, 200, 75);
    g.lineTo(200, 120);
    g.fill();
    // A frame one texel in from each edge, to see that no edge is cut.
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2;
    g.strokeRect(1, 1, 198, 118);
  });
}

/** A framed panel to put other nodes on. 360 by 240, so it is a small image. */
export function panel(): HTMLCanvasElement {
  return cached('panel', 360, 240, (g) => {
    const fill = g.createLinearGradient(0, 0, 0, 240);
    fill.addColorStop(0, '#3a4a5c');
    fill.addColorStop(1, '#1f2a36');
    g.fillStyle = fill;
    g.beginPath();
    g.roundRect(4, 4, 352, 232, 24);
    g.fill();
    g.strokeStyle = '#8fa8c0';
    g.lineWidth = 4;
    g.stroke();
    g.strokeStyle = '#ffffff22';
    g.lineWidth = 1;
    for (let x = 24; x < 340; x += 16) {
      g.beginPath();
      g.moveTo(x, 20);
      g.lineTo(x, 220);
      g.stroke();
    }
  });
}

/**
 * A large test picture: a gradient in its own hue, a grid every 64 texels
 * and its number. 1024 by 1024 by default, so it has its own texture.
 */
export function picture(n: number, size = 1024): HTMLCanvasElement {
  return cached(`picture ${n} ${size}`, size, size, (g) => {
    const hue = (n * 57) % 360;
    const fill = g.createLinearGradient(0, 0, size, size);
    fill.addColorStop(0, `hsl(${hue} 70% 55%)`);
    fill.addColorStop(1, `hsl(${(hue + 60) % 360} 70% 25%)`);
    g.fillStyle = fill;
    g.fillRect(0, 0, size, size);
    g.strokeStyle = '#ffffff40';
    g.lineWidth = 2;
    for (let i = 64; i < size; i += 64) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, size);
      g.moveTo(0, i);
      g.lineTo(size, i);
      g.stroke();
    }
    g.fillStyle = '#ffffff';
    g.font = `bold ${size * 0.5}px Roboto, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(n), size / 2, size / 2);
  });
}
