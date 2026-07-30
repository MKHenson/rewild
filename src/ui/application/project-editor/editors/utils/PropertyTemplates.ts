import { IProperty, PropertyType } from 'models';

export const propertyTemplates: { [key in PropertyType]: IProperty } = {
  active: {
    label: 'Active on Startup',
    valueType: 'boolean',
  },
  cloudiness: {
    label: 'Cloudiness',
    valueType: 'float',
    valueOptions: {
      min: 0,
      max: 1,
      step: 0.01,
      precision: 2,
    },
  },
  foginess: {
    label: 'Foginess',
    valueType: 'float',
    valueOptions: {
      min: 0,
      max: 1,
      step: 0.01,
      precision: 2,
    },
  },
  windiness: {
    label: 'Windiness',
    valueType: 'float',
    valueOptions: {
      min: 0,
      max: 1,
      step: 0.01,
      precision: 2,
    },
  },
  elevation: {
    label: 'Sun Elevation',
    valueType: 'float',
    valueOptions: {
      min: -360,
      max: 360,
      step: 1,
      precision: 2,
    },
  },
  dayNightCycle: {
    label: 'Day Night Cycle',
    valueType: 'boolean',
  },
  precipitation: {
    label: 'Precipitation',
    valueType: 'float',
    valueOptions: {
      min: 0,
      max: 1,
      step: 0.01,
      precision: 2,
    },
  },
  temperature: {
    label: 'Temperature',
    valueType: 'float',
    valueOptions: {
      min: 0,
      max: 1,
      step: 0.01,
      precision: 2,
    },
  },
  position: {
    label: 'Position',
    valueType: 'vec3',
  },
  size: {
    label: 'Size',
    valueType: 'string',
  },
  speed: {
    label: 'Speed',
    valueType: 'string',
  },
  geometry: {
    label: 'Geometry',
    valueType: 'enum',
    options: [
      { value: 'box', label: 'Box' },
      { value: 'sphere', label: 'Sphere' },
    ],
  },
  material: {
    label: 'Pipeline',
    valueType: 'string',
  },
  color: {
    label: 'Color',
    valueType: 'vec3',
  },
  target: {
    label: 'Target',
    valueType: 'vec3',
  },
  // Falloff is inverse-square, so for a point or spot light this number is the
  // brightness delivered one unit away rather than a flat 0-to-max dial. The
  // label says so because the useful values are now range-dependent and much
  // larger than the ones it replaced — a radius-10 light that read well at 3.1
  // reads the same at ~44.
  intensity: {
    label: 'Intensity (at 1m)',
    valueType: 'float',
  },
  radius: {
    label: 'Radius',
    valueType: 'float',
  },
  'camera-transform': {
    label: 'Camera Transform',
    valueType: 'object',
    customEditor: 'camera-capture',
  },
};
