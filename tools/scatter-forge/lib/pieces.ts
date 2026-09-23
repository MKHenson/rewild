// What each kind of model is made of.
//
// `type` picks a **structure**, not a species. Oak, birch and poplar are one
// structure with different keys, which is why they are templates rather than
// types. A palm is a different structure — one undivided stem carrying a
// rosette — so it is a type, and so is a tuft of grass, and so is a rock.
//
// A **piece** is one primitive: one texture set, one glTF material, one draw.
// A pebble cluster is still one piece, because a piece is a draw and not an
// object: its stones share an image and differ by the block they sample.
// Everything downstream keys on its `key`, so the piece named here is the piece
// in the filename, in the material and on the preview panel. Nothing maps one
// spelling to another.
//
// Deliberately free of imports, so the parameter table can reach it without a
// cycle.

export const FORGE_TYPES = ['tree', 'clump', 'crown', 'rock', 'pebble'] as const;

export type ForgeType = (typeof FORGE_TYPES)[number];

export interface PieceSpec {
  /** Names the texture files, the glTF material and the preview panel. */
  key: string;
  /**
   * Alpha tested and double sided. Cutout foliage is both: the test cuts a
   * leaf shape out of a rectangle, and you see foliage from underneath. A
   * trunk is neither, and one seen from inside is a bug.
   */
  cutout: boolean;
  /**
   * Write the `_disp` map for this piece.
   *
   * It is dead weight wherever the relief it records is under a millimetre. A
   * blade's is, so a clump writes none and saves a file per set. A leaf's is
   * too, but trees have shipped it since before there were types and dropping
   * it would rewrite every set on disk for nothing.
   */
  height: boolean;
  /**
   * Emit a materials.json material for this piece.
   *
   * Only worth it for a piece a displacement path might one day be wired for,
   * because binding one through `materialId` replaces *every* material in the
   * model with it. See docs/scatter-forge/in-game.md, "Materials".
   */
  material: boolean;
  /**
   * Shipped only while the model has a stem. A fern's rosette sits on the
   * ground, and a bark material nothing draws would still load its images.
   */
  needsStem?: boolean;
}

export const PIECES: Record<ForgeType, readonly PieceSpec[]> = {
  tree: [
    { key: 'bark', cutout: false, height: true, material: true },
    { key: 'leaf', cutout: true, height: true, material: false },
  ],
  clump: [{ key: 'blade', cutout: true, height: false, material: false }],
  crown: [
    { key: 'bark', cutout: false, height: true, material: true, needsStem: true },
    { key: 'frond', cutout: true, height: false, material: false },
  ],
  rock: [{ key: 'stone', cutout: false, height: true, material: true }],
  // A cluster is one draw of one material, whatever it holds: the pebbles
  // differ by which block of the image their charts are cut from, not by
  // piece.
  pebble: [{ key: 'stone', cutout: false, height: true, material: true }],
};

/** The pieces a model ships. `hasStem` drops the ones a stemless crown has no use for. */
export function piecesOf(type: ForgeType, hasStem = true): readonly PieceSpec[] {
  return PIECES[type].filter((piece) => !piece.needsStem || hasStem);
}

export function pieceKeys(type: ForgeType, hasStem = true): string[] {
  return piecesOf(type, hasStem).map((piece) => piece.key);
}

/** Pieces whose `_disp` map is written. */
export function heightPieces(type: ForgeType, hasStem = true): string[] {
  return piecesOf(type, hasStem)
    .filter((piece) => piece.height)
    .map((piece) => piece.key);
}

/** Pieces that get a materials.json material. */
export function materialPieces(type: ForgeType, hasStem = true): string[] {
  return piecesOf(type, hasStem)
    .filter((piece) => piece.material)
    .map((piece) => piece.key);
}

export function isForgeType(value: string): value is ForgeType {
  return (FORGE_TYPES as readonly string[]).includes(value);
}
