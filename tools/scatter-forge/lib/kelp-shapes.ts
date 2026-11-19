// The kelp type's string keys, apart from its generator so the parameter
// table can check them without importing it.

/** Where the blades leave a stalk. */
export const BLADE_LAYOUTS = ['along', 'tip', 'single'] as const;
export type BladeLayout = (typeof BLADE_LAYOUTS)[number];

/** Which floats a stalk carries. */
export const BLADDER_KINDS = ['none', 'blade', 'tip'] as const;
export type BladderKind = (typeof BLADDER_KINDS)[number];
