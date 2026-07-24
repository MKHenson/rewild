/**
 * Compile-time constant substitution for WGSL sources.
 *
 * WGSL has no preprocessor and no specialisation constants in the subset we
 * target, so anything that must be a compile-time constant — loop bounds, array
 * sizes, sample counts — cannot come from a uniform buffer. This is the escape
 * hatch: the shader declares
 *
 *   const NUM_STEPS: i32 = ${ NUM_STEPS };
 *
 * and the pipeline supplies the value when it builds the module. Because the
 * value is baked into the source, changing it means recompiling the module, so
 * any pass that uses defines needs a `requiresRebuild` flag on whatever property
 * drives them.
 *
 * Shader text is imported as a plain string (see the `.wgsl` loader in
 * esbuild.js), which is why this is a runtime string operation rather than a
 * build step — the values are only known once the renderer is running.
 */

/**
 * Values substituted into `${ NAME }` placeholders.
 *
 * Numbers are stringified with `String()`, which does not always produce a
 * literal of the type WGSL expects — `1` is a valid f32 initialiser only via
 * abstract-int conversion, and breaks outright in contexts that demand a float.
 * Prefer {@link wgslF32} / {@link wgslI32} when building a define table so the
 * literal form is explicit and mistakes are caught here rather than in the
 * driver's WGSL parser.
 */
export type ShaderDefines = Record<string, string | number | boolean>;

/** `${NAME}`, tolerating any internal whitespace. */
const PLACEHOLDER = /\$\{\s*([A-Za-z_]\w*)\s*\}/g;

/**
 * Replaces every `${ NAME }` in `source` with its value from `defines`.
 *
 * Throws on a placeholder with no matching define. That is deliberate: an
 * unresolved placeholder is still valid-looking text, so it would reach the
 * driver and surface as an opaque WGSL syntax error pointing at a line number in
 * a concatenated blob. Failing here names the missing key instead.
 *
 * Substitution is single-pass — values are never rescanned — so a value that
 * itself contains `${...}` is inserted literally rather than expanded.
 */
export function resolveShaderDefines(
  source: string,
  defines: ShaderDefines
): string {
  return source.replace(PLACEHOLDER, (_match, name: string) => {
    // hasOwnProperty rather than `in`: `${constructor}` would otherwise resolve
    // to a prototype member and be stringified into the shader.
    if (!Object.prototype.hasOwnProperty.call(defines, name)) {
      const known = Object.keys(defines).sort().join(', ') || '(none)';
      throw new Error(
        `WGSL define "${name}" has no value. Known defines: ${known}`
      );
    }
    return String(defines[name]);
  });
}

/**
 * Joins shader sources and resolves their defines in one step.
 *
 * The parts are joined with a newline so a file that happens to lack a trailing
 * one cannot weld its last line onto the next file's first, and defines are
 * resolved over the combined text so a placeholder in any part can be satisfied
 * by the single table.
 */
export function composeShader(
  parts: string[],
  defines: ShaderDefines = {}
): string {
  return resolveShaderDefines(parts.join('\n'), defines);
}

/**
 * Formats a number as a WGSL f32 literal: `1` becomes `1.0`.
 *
 * Without the decimal point the value is an abstract int, which converts to f32
 * in a `const` initialiser but not everywhere an f32 is accepted. Always
 * emitting a float form keeps a define usable in any f32 context.
 */
export function wgslF32(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot express ${value} as a WGSL f32 literal`);
  }
  const text = String(value);
  // Exponent and decimal forms are already float literals; a bare integer is not.
  return /[.eE]/.test(text) ? text : `${text}.0`;
}

/**
 * Formats a number as a WGSL i32 literal, rejecting non-integers.
 *
 * A fractional value here means a bug in the caller's table — emitting it would
 * produce `const TAPS: i32 = 2.5;` and a type error from the driver, well away
 * from the code that chose the number.
 */
export function wgslI32(value: number): string {
  if (!Number.isInteger(value)) {
    throw new Error(`Cannot express ${value} as a WGSL i32 literal`);
  }
  return String(value);
}
