import type { Bounds, UIFont, UIFontFace } from './font';
import type {
  FontWeight,
  INHERITED_KEYS,
  TextAlign,
  UIColor,
  UIStyle,
} from './style';
import type { Rect, UINode } from './UINode';

/**
 * Text layout. The same code measures text for layout and places its glyphs
 * for drawing, so the two always agree.
 */

/** A node's text style, with the values that pass down resolved. */
export interface TextStyle {
  color: UIColor;
  fontSize: number;
  fontWeight: FontWeight;
  lineHeight: number | 'normal';
  textAlign: TextAlign;
  whiteSpace: NonNullable<UIStyle['whiteSpace']>;
  textOverflow: NonNullable<UIStyle['textOverflow']>;
}

export interface TextLine {
  /** Indexes into `chars`. `end` is not in the line. Trailing spaces are left out. */
  start: number;
  end: number;
  /** In CSS pixels. */
  width: number;
}

export interface TextLayout {
  /** The code points left after white space is joined. */
  chars: number[];
  /** The pen x of each character in CSS pixels, from the start of its paragraph. */
  x: number[];
  /** The x where each character ends, kerning with the next one left out. */
  ends: number[];
  lines: TextLine[];
  /** The widest line. */
  width: number;
  height: number;
  /** The height of one line in CSS pixels. */
  lineHeight: number;
}

/** A glyph's quad in surface CSS pixels and its cell in the atlas. */
export interface PlacedGlyph {
  rect: Rect;
  atlas: Bounds;
}

const SPACE = 0x20;
const ELLIPSIS = 0x2026;
const EPSILON = 1e-3;
/** Layouts kept per node, enough for the widths one layout pass tries. */
const CACHE_SIZE = 8;

function inherited<K extends (typeof INHERITED_KEYS)[number]>(
  node: UINode,
  key: K
): UIStyle[K] {
  for (let n: UINode | null = node; n; n = n.parent)
    if (n.style[key] !== undefined) return n.style[key];
  return undefined;
}

export function resolveTextStyle(node: UINode): TextStyle {
  return {
    color: inherited(node, 'color') ?? '#ffffff',
    fontSize: inherited(node, 'fontSize') ?? 16,
    fontWeight: inherited(node, 'fontWeight') ?? 'normal',
    lineHeight: inherited(node, 'lineHeight') ?? 'normal',
    textAlign: inherited(node, 'textAlign') ?? 'left',
    whiteSpace: node.style.whiteSpace ?? 'normal',
    textOverflow: node.style.textOverflow ?? 'clip',
  };
}

/**
 * Splits text into paragraphs of code points. Runs of spaces, tabs and line
 * breaks join into one space, and spaces at the ends go, as in CSS.
 * `pre-line` keeps the line breaks as paragraph ends.
 */
function paragraphs(text: string, whiteSpace: TextStyle['whiteSpace']): number[][] {
  const parts = whiteSpace === 'pre-line' ? text.split(/\r\n|\r|\n/) : [text];
  const list = parts.map((part) =>
    Array.from(
      part.replace(/[ \t\n\r\f]+/g, ' ').replace(/^ | $/g, ''),
      (c) => c.codePointAt(0)!
    )
  );
  // A line break at the very end makes no empty line.
  if (list.length && !list[list.length - 1].length) list.pop();
  return list;
}

/**
 * Lays out text in lines no wider than `widthLimit`, breaking at spaces.
 * A word wider than the limit takes a line of its own and overflows it.
 */
export function layoutText(
  face: UIFontFace,
  text: string,
  fontSize: number,
  lineHeight: number | 'normal',
  whiteSpace: TextStyle['whiteSpace'],
  widthLimit: number
): TextLayout {
  const wrap = whiteSpace !== 'nowrap';
  const chars: number[] = [];
  const x: number[] = [];
  const ends: number[] = [];
  const lines: TextLine[] = [];

  const pushLine = (start: number, stop: number) => {
    while (stop > start && chars[stop - 1] === SPACE) stop--;
    const width = stop > start ? ends[stop - 1] - x[start] : 0;
    lines.push({ start, end: stop, width });
  };

  for (const paragraph of paragraphs(text, whiteSpace)) {
    const first = chars.length;
    let pen = 0;
    for (let i = 0; i < paragraph.length; i++) {
      if (i > 0) pen += face.kern(paragraph[i - 1], paragraph[i]) * fontSize;
      chars.push(paragraph[i]);
      x.push(pen);
      pen += face.glyph(paragraph[i]).advance * fontSize;
      ends.push(pen);
    }

    let lineStart = first;
    // The first character after the last break opportunity in the line.
    let breakAt = -1;
    for (let i = first; i < chars.length; i++) {
      if (chars[i] === SPACE) continue;
      if (i > lineStart && chars[i - 1] === SPACE) breakAt = i;
      if (
        wrap &&
        breakAt > lineStart &&
        ends[i] - x[lineStart] > widthLimit + EPSILON
      ) {
        pushLine(lineStart, breakAt);
        lineStart = breakAt;
      }
    }
    pushLine(lineStart, chars.length);
  }

  const height = resolveLineHeight(face, fontSize, lineHeight);
  return {
    chars,
    x,
    ends,
    lines,
    width: lines.reduce((w, line) => Math.max(w, line.width), 0),
    height: lines.length * height,
    lineHeight: height,
  };
}

function resolveLineHeight(
  face: UIFontFace,
  fontSize: number,
  lineHeight: number | 'normal'
): number {
  return (lineHeight === 'normal' ? face.metrics.lineHeight : lineHeight) * fontSize;
}

const layouts = new WeakMap<
  UINode,
  { font: UIFont; entries: Map<string, TextLayout> }
>();

/** The node's text laid out at a width, cached by text, style and width. */
function cachedLayout(
  node: UINode,
  font: UIFont,
  style: TextStyle,
  widthLimit: number
): TextLayout {
  const text = node.text ?? '';
  const limit = style.whiteSpace === 'nowrap' ? Infinity : widthLimit;
  const key = `${style.fontWeight} ${style.fontSize} ${style.lineHeight} ${style.whiteSpace} ${limit}\n${text}`;
  let cache = layouts.get(node);
  if (!cache || cache.font !== font)
    layouts.set(node, (cache = { font, entries: new Map() }));
  let layout = cache.entries.get(key);
  if (!layout) {
    if (cache.entries.size >= CACHE_SIZE) cache.entries.clear();
    layout = layoutText(
      font.face(style.fontWeight),
      text,
      style.fontSize,
      style.lineHeight,
      style.whiteSpace,
      limit
    );
    cache.entries.set(key, layout);
  }
  return layout;
}

/** The measure function of a node with text. With no font yet, the text has no size. */
export function measureText(
  node: UINode,
  widthLimit: number
): { width: number; height: number } {
  const font = node.surface?.font;
  if (!font) return { width: 0, height: 0 };
  const { width, height } = cachedLayout(
    node,
    font,
    resolveTextStyle(node),
    widthLimit
  );
  return { width, height };
}

/**
 * Places the node's glyphs in its content box. Baselines snap to device
 * pixels, so stems stay sharp. With `textOverflow: 'ellipsis'` and
 * `overflow: 'hidden'`, a line too long for the box ends in "…".
 */
export function placeText(
  node: UINode,
  font: UIFont,
  style: TextStyle,
  box: Rect,
  pixelRatio: number
): PlacedGlyph[] {
  const face = font.face(style.fontWeight);
  const layout = cachedLayout(node, font, style, box.width);
  const { chars, x, ends } = layout;
  const size = style.fontSize;
  // The metrics have y down, so the ascender is negative.
  const { ascender, descender } = face.metrics;
  // The line box centres the font's ascender and descender, as CSS does.
  const halfLeading = (layout.lineHeight - (descender - ascender) * size) / 2;
  const ellipsis =
    style.textOverflow === 'ellipsis' && node.style.overflow === 'hidden';
  const glyphs: PlacedGlyph[] = [];

  const place = (unicode: number, penX: number, baseline: number) => {
    const { planeBounds: plane, atlasBounds: atlas } = face.glyph(unicode);
    if (!plane || !atlas) return;
    glyphs.push({
      rect: {
        x: penX + plane.left * size,
        y: baseline + plane.top * size,
        width: (plane.right - plane.left) * size,
        height: (plane.bottom - plane.top) * size,
      },
      atlas,
    });
  };

  layout.lines.forEach((line, n) => {
    let { end, width } = line;
    const start = line.start;
    let dots = false;
    if (ellipsis && width > box.width + EPSILON) {
      const dotsWidth = face.glyph(ELLIPSIS).advance * size;
      const room = box.width - dotsWidth;
      end = start;
      while (end < line.end && ends[end] - x[start] <= room + EPSILON) end++;
      while (end > start && chars[end - 1] === SPACE) end--;
      width = (end > start ? ends[end - 1] - x[start] : 0) + dotsWidth;
      dots = true;
    }

    const free = Math.max(0, box.width - width);
    const offset =
      style.textAlign === 'center'
        ? free / 2
        : style.textAlign === 'right'
        ? free
        : 0;
    const baseline =
      Math.round(
        (box.y + n * layout.lineHeight + halfLeading - ascender * size) *
          pixelRatio
      ) / pixelRatio;
    const left = box.x + offset - x[start];
    for (let i = start; i < end; i++) place(chars[i], left + x[i], baseline);
    if (dots)
      place(
        ELLIPSIS,
        box.x + offset + width - face.glyph(ELLIPSIS).advance * size,
        baseline
      );
  });
  return glyphs;
}
