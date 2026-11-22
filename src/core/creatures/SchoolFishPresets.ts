import { FinFlutter } from 'rewild-renderer';
import { SwimSettings } from './CreaturePresets';

/** A school fish's settings: drawn by the shader swim, with no skeleton. */
export interface SchoolFishPreset {
  /** Geometry id of a static model facing +Z. */
  model: string;
  /** Uniform scale on the model. Swim strides are in metres at this scale. */
  scale: number;
  swim: SwimSettings;
  /** Needs a COLOR_0.r fin mask on the model. Left out, fins stay with the body. */
  fin?: FinFlutter;
}

export const SCHOOL_FISH_PRESETS: Record<string, SchoolFishPreset> = {
  sardine: {
    model: 'sardine',
    scale: 1,
    swim: {
      stiff: 0.1,
      wavelength: 1,
      head: 0.08,
      amplitude: 0.6,
      stride: 0.13,
      hoverBeat: 1.5,
      maxBeat: 9,
      turnCurve: 0.8,
      escape: 1.2,
    },
    fin: { amplitude: 0.35, rate: 2 },
  },
  minnow: {
    model: 'sardine',
    scale: 0.43,
    swim: {
      stiff: 0.25,
      wavelength: 1,
      head: 0.1,
      amplitude: 0.6,
      stride: 0.06,
      hoverBeat: 2,
      maxBeat: 12,
      turnCurve: 1,
      burst: { beats: [2, 4], coast: [0.2, 0.6] },
      escape: 1.3,
    },
    fin: { amplitude: 0.4, rate: 2 },
  },
};

export function getSchoolFishPreset(name: string): SchoolFishPreset {
  const preset = SCHOOL_FISH_PRESETS[name];
  if (!preset) throw new Error(`Unknown school fish preset '${name}'.`);
  return preset;
}
