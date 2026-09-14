import {
  SCATTER_KILL_CELL_LIMIT,
  ScatterKillSet,
  deserializeScatterKillSet,
  scatterKillKey,
  serializeScatterKillSet,
} from './ScatterKillSet';

describe('scatterKillKey', () => {
  it('packs slot and cell into one key, distinctly', () => {
    const keys = new Set([
      scatterKillKey(0, 0, 0),
      scatterKillKey(1, 0, 0),
      scatterKillKey(0, 1, 0),
      scatterKillKey(0, 0, 1),
    ]);
    expect(keys.size).toBe(4);
  });

  it('addresses the whole cell range', () => {
    const max = SCATTER_KILL_CELL_LIMIT - 1;
    expect(scatterKillKey(255, max, max)).toBe(0xffffffff);
    expect(scatterKillKey(0, 0, 0)).toBe(0);
  });

  // Every bit pattern is a valid key, so there is no sentinel to return — a
  // caller that quietly dropped one would leave an unpluckable instance.
  it('throws rather than folding an out-of-range cell onto another key', () => {
    expect(() => scatterKillKey(0, SCATTER_KILL_CELL_LIMIT, 0)).toThrow(
      /outside/
    );
    expect(() => scatterKillKey(0, -1, 0)).toThrow(/outside/);
    expect(() => scatterKillKey(256, 0, 0)).toThrow(/slot/);
  });
});

describe('scatter kill set serialization', () => {
  const kills: ScatterKillSet = new Set([
    scatterKillKey(2, 40, 7),
    scatterKillKey(0, 0, 0),
    scatterKillKey(1, 4095, 4095),
  ]);

  it('round-trips a set', () => {
    const restored = deserializeScatterKillSet(serializeScatterKillSet(kills));
    expect([...restored].sort()).toEqual([...kills].sort());
  });

  it('round-trips an empty set', () => {
    const restored = deserializeScatterKillSet(
      serializeScatterKillSet(new Set())
    );
    expect(restored.size).toBe(0);
  });

  // An unordered set would serialise differently every time it was rebuilt,
  // pushing a fresh blob through the sync on every save.
  it('writes the same bytes whatever order the set was built in', () => {
    const reversed = new Set([...kills].reverse());
    expect(
      Array.from(new Uint8Array(serializeScatterKillSet(reversed)))
    ).toEqual(Array.from(new Uint8Array(serializeScatterKillSet(kills))));
  });

  it('rejects a truncated blob rather than misreading it', () => {
    const buffer = serializeScatterKillSet(kills);
    expect(() => deserializeScatterKillSet(buffer.slice(0, 12))).toThrow(
      /expected/
    );
  });

  it('rejects an unknown version', () => {
    const buffer = serializeScatterKillSet(kills);
    new DataView(buffer).setUint32(0, 99, true);
    expect(() => deserializeScatterKillSet(buffer)).toThrow(/version 99/);
  });
});
