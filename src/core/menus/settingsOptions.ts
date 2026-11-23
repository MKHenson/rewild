import { VolumeSetting } from 'rewild-audio';
import {
  QualityAspect,
  RENDER_QUALITIES,
  RENDER_SCALES,
} from 'rewild-renderer/lib/utils/RenderQuality';

/**
 * The options and the text of the settings screen. The DOM panel and the
 * in-game panel both read them, so the two show the same settings.
 */

export const QUALITY_OPTIONS = RENDER_QUALITIES.map((quality) => ({
  value: quality,
  label: quality.charAt(0).toUpperCase() + quality.slice(1),
}));

export const SCALE_OPTIONS = [...RENDER_SCALES].reverse().map((scale) => ({
  value: String(scale),
  label: `${Math.round(scale * 100)}%`,
}));

export const THEME_OPTIONS: {
  value: 'light' | 'dark' | 'system';
  label: string;
}[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'Match system' },
];

export const RENDER_QUALITY_DESCRIPTION =
  'Sets every section below at once. Lower it if the game runs poorly, ' +
  'then raise anything back that you want to keep.';

export const RENDER_SCALE_DESCRIPTION =
  'The resolution the world draws at, as a share of the window. Lower it if ' +
  'the game runs poorly. Menus and the HUD always draw at full resolution, ' +
  'and Render Quality does not change it.';

export const APPLY_NOTE =
  'Applying rebuilds the affected shaders, so expect a brief pause on the next frame.';

export const THEME_DESCRIPTION =
  "Colours for menus and the editor. Match system follows your operating system's light or dark setting.";

/** What each subsystem costs, in the terms a player picking a tier cares about. */
export const ASPECTS: Record<
  QualityAspect,
  { label: string; description: string }
> = {
  clouds: {
    label: 'Clouds',
    description:
      'Volumetric cloud detail, and the resolution they are drawn at. By far ' +
      'the most expensive part of the sky — the first thing to lower on a ' +
      'machine that is struggling.',
  },
  cloudShadows: {
    label: 'Cloud Shadows',
    description:
      'How finely the shadows clouds cast across the landscape are traced.',
  },
  shadows: {
    label: 'Shadows',
    description:
      'Sharpness of the shadows cast by the sun, and how far out they reach. ' +
      'Ultra doubles the shadow map and costs four times the fill of High.',
  },
  godRays: {
    label: 'God Rays',
    description:
      'Shafts of sunlight through gaps in the cloud. Cheap to lower — the ' +
      'shafts are soft, so a coarser trace is hard to spot.',
  },
  bloom: {
    label: 'Bloom',
    description: 'The glow that spreads out of the brightest parts of a frame.',
  },
  terrain: {
    label: 'Terrain detail',
    description:
      'Surface relief on the ground and how far out it carries. The heaviest ' +
      'setting here on most views, because terrain fills the screen.',
  },
  water: {
    label: 'Water detail',
    description:
      'How many ripples shade the surface of the sea and lakes, and how far ' +
      'out they carry. The waves themselves are the same on every setting.',
  },
  ao: {
    label: 'Ambient Occlusion',
    description:
      'Soft darkening where the sky is hidden: under rocks, at the foot of ' +
      'trees and inside canopies. Off on Low; higher tiers reach further ' +
      'and take more samples.',
  },
  heatShimmer: {
    label: 'Heat Shimmer',
    description:
      'The haze that wavers over hot ground in the distance, in hot ' +
      'weather only. Off on Low; Medium uses a simpler ripple.',
  },
  drawDistance: {
    label: 'Draw Distance',
    description:
      'How far out trees, rocks and plants draw, and how soon they switch to ' +
      'simpler models. Lower tiers save in the scene and in the shadows. ' +
      'Distant forests stay on every tier.',
  },
};

export const VOLUMES: Record<
  VolumeSetting,
  { label: string; description: string }
> = {
  master: { label: 'Master', description: 'Everything the game plays.' },
  music: { label: 'Music', description: 'The score.' },
  world: {
    label: 'World',
    description:
      'Wind, rain, thunder, water, wildlife and everything else outdoors.',
  },
  player: {
    label: 'Player',
    description: 'Your footsteps, breathing and voice.',
  },
  ui: { label: 'Interface', description: 'Menus and buttons.' },
};
