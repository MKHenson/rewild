import { FinFlutter } from 'rewild-renderer';
import { SwimSettings, WaterHabitatSettings } from './CreaturePresets';
import { FlockSettings } from './Flocking';
import { HomeCycle } from './HerdHome';

/** How each member of a school steers. Weights scale each pull against the others. */
export interface SchoolSteering extends FlockSettings {
  /** m/s a frightened member swims at. */
  fleeSpeed: number;
  /** m/s² a member changes velocity at, at most. */
  acceleration: number;
  /** Radians a member tilts its nose up or down, at most. */
  pitch: number;
  /** Push back inside the habitat. */
  habitat: number;
  /** Push away from a threat. */
  threat: number;
  /** Metres from a threat of fright 1 at which members turn away. */
  threatRadius: number;
  /** Seconds of travel ahead checked for leaving the habitat. */
  lookAhead: number;
}

/** A school fish's settings: drawn by the shader swim, with no skeleton. */
export interface SchoolFishPreset {
  /** Geometry id of a static model facing +Z. */
  model: string;
  /** Uniform scale on the model. Swim strides are in metres at this scale. */
  scale: number;
  swim: SwimSettings;
  /** Needs a COLOR_0.r fin mask on the model. Left out, fins stay with the body. */
  fin?: FinFlutter;
  steering: SchoolSteering;
  habitat: WaterHabitatSettings;
  /** m/s the home drifts, and metres from where it started it may go. */
  drift: number;
  roam: number;
  /** Rests and travels by turns. Left out, it drifts without rest. */
  cycle?: HomeCycle;
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
    steering: {
      cruiseSpeed: 0.9,
      fleeSpeed: 2.6,
      acceleration: 3,
      pitch: 0.35,
      neighbourRadius: 1.2,
      spacing: 0.4,
      separation: 2.5,
      alignment: 1.2,
      cohesion: 0.8,
      home: 0.6,
      habitat: 3,
      threat: 5,
      homeRadius: 8,
      threatRadius: 4,
      lookAhead: 1.5,
    },
    habitat: {
      type: 'water',
      bedMargin: 0.5,
      surfaceMargin: 0.5,
      depth: { from: 1, to: 1.5 },
      waterTypes: ['ocean'],
    },
    drift: 0.7,
    roam: 120,
    cycle: { settle: [10, 30], travel: [30, 60] },
  },
  minnow: {
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
    steering: {
      cruiseSpeed: 0.9,
      fleeSpeed: 2.6,
      acceleration: 3,
      pitch: 0.35,
      neighbourRadius: 1.2,
      spacing: 0.4,
      separation: 2.5,
      alignment: 1.2,
      cohesion: 0.8,
      home: 0.6,
      habitat: 3,
      threat: 5,
      homeRadius: 8,
      threatRadius: 4,
      lookAhead: 1.5,
    },
    habitat: {
      type: 'water',
      bedMargin: 0.08,
      surfaceMargin: 0.08,
      depth: { from: 0.3, to: 0.45 },
      waterTypes: ['lake'],
      spawnRadius: 35,
      despawnRadius: 40,
    },
    drift: 0.25,
    roam: 30,
    cycle: { settle: [10, 30], travel: [15, 40] },
  },
};

export function getSchoolFishPreset(name: string): SchoolFishPreset {
  const preset = SCHOOL_FISH_PRESETS[name];
  if (!preset) throw new Error(`Unknown school fish preset '${name}'.`);
  return preset;
}
