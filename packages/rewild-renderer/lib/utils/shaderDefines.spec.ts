import {
  composeShader,
  resolveShaderDefines,
  wgslF32,
  wgslI32,
} from './shaderDefines';

describe('resolveShaderDefines', () => {
  it('substitutes a placeholder', () => {
    expect(
      resolveShaderDefines('const N: i32 = ${NUM_STEPS};', { NUM_STEPS: 3 })
    ).toBe('const N: i32 = 3;');
  });

  it('tolerates whitespace inside the placeholder', () => {
    expect(resolveShaderDefines('${  NUM_STEPS  }', { NUM_STEPS: 3 })).toBe(
      '3'
    );
  });

  it('substitutes every occurrence', () => {
    expect(resolveShaderDefines('${A}-${B}-${A}', { A: 1, B: 2 })).toBe(
      '1-2-1'
    );
  });

  it('stringifies booleans as WGSL bools', () => {
    expect(resolveShaderDefines('${ON}', { ON: true })).toBe('true');
  });

  it('throws on an unresolved placeholder, naming the key', () => {
    expect(() => resolveShaderDefines('${MISSING}', { OTHER: 1 })).toThrow(
      /"MISSING"/
    );
  });

  // Without an own-property check this resolves to Object.prototype.constructor
  // and stringifies a function body into the shader.
  it('does not resolve inherited properties', () => {
    expect(() => resolveShaderDefines('${constructor}', {})).toThrow(
      /"constructor"/
    );
  });

  // Substitution must not rescan what it inserted, or a value could expand
  // into a further placeholder.
  it('does not rescan substituted values', () => {
    expect(resolveShaderDefines('${A}', { A: '${B}', B: 'x' })).toBe('${B}');
  });

  it('leaves source untouched when there are no placeholders', () => {
    expect(resolveShaderDefines('fn main() {}', {})).toBe('fn main() {}');
  });
});

describe('composeShader', () => {
  it('joins parts with a newline so no two lines weld together', () => {
    expect(composeShader(['fn a() {}', 'fn b() {}'])).toBe(
      'fn a() {}\nfn b() {}'
    );
  });

  it('resolves a define used by any part', () => {
    expect(composeShader(['const A = ${V};', 'const B = ${V};'], { V: 7 })).toBe(
      'const A = 7;\nconst B = 7;'
    );
  });
});

describe('wgslF32', () => {
  it('adds a decimal point to integers', () => {
    expect(wgslF32(1)).toBe('1.0');
    expect(wgslF32(70000)).toBe('70000.0');
  });

  it('leaves fractional values alone', () => {
    expect(wgslF32(0.5)).toBe('0.5');
  });

  it('leaves exponent forms alone', () => {
    expect(wgslF32(1e21)).toBe('1e+21');
  });

  it('rejects non-finite values', () => {
    expect(() => wgslF32(NaN)).toThrow();
    expect(() => wgslF32(Infinity)).toThrow();
  });
});

describe('wgslI32', () => {
  it('formats integers', () => {
    expect(wgslI32(3)).toBe('3');
    expect(wgslI32(-1)).toBe('-1');
  });

  it('rejects fractional values', () => {
    expect(() => wgslI32(2.5)).toThrow();
  });
});
