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
  intensity: {
    label: 'Intensity',
    valueType: 'float',
  },
  'camera-transform': {
    label: 'Camera Transform',
    valueType: 'object',
    customEditor: 'camera-capture',
  },
};
