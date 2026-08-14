// FNV-1a, run in two lanes with different multipliers so the 32-bit variant's
// collision odds are squared rather than trusted. Both lanes and the length go
// into the hex string, which is short enough to read in a console table.
//
// Used to give imported content an identity derived from what it *is* rather
// than what it is called: two files that embed the same image, or define the
// same material, then resolve to one texture and one pass.

const OFFSET_LOW = 0x811c9dc5;
const OFFSET_HIGH = 0x01000193;
const PRIME_LOW = 0x01000193;
const PRIME_HIGH = 0x85ebca6b;

function toHex(low: number, high: number, length: number): string {
  return `${(low >>> 0).toString(16).padStart(8, '0')}${(high >>> 0)
    .toString(16)
    .padStart(8, '0')}${length.toString(16)}`;
}

export function hashBytes(bytes: Uint8Array): string {
  let low = OFFSET_LOW;
  let high = OFFSET_HIGH;

  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    low = Math.imul(low ^ byte, PRIME_LOW);
    high = Math.imul(high ^ byte, PRIME_HIGH);
  }

  return toHex(low, high, bytes.length);
}

export function hashString(value: string): string {
  let low = OFFSET_LOW;
  let high = OFFSET_HIGH;

  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    low = Math.imul(low ^ code, PRIME_LOW);
    high = Math.imul(high ^ code, PRIME_HIGH);
  }

  return toHex(low, high, value.length);
}
