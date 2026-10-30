import {
  ScatterKillSet,
  deserializeScatterKillSet,
  serializeScatterKillSet,
} from './ScatterKillSet';

describe('scatter kill set serialization', () => {
  const kills: ScatterKillSet = new Set([0x02007028, 0, 0x01ffffff]);

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
