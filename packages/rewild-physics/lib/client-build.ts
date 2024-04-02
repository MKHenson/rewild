import './global-polyfills';
import { Event, EventAttachable, EventDispatcher } from 'rewild-common';

import * as collision from './collision';
import * as constraints from './constraints';
import * as equations from './equations';
import * as material from './material';
import * as math from './math';
import * as objects from './objects';
import * as shapes from './shapes';
import * as solver from './solver';
import * as utils from './utils';
import * as world from './world';

const allLibs = [
  collision,
  constraints,
  equations,
  material,
  math,
  objects,
  shapes,
  solver,
  utils,
  world,
];

let globalRef = window as any;

globalRef.CANNON = {};

for (let lib of allLibs) {
  for (let key in lib) {
    globalRef[key] = (lib as any)[key];
    globalRef.CANNON[key] = (lib as any)[key];
  }
}

globalRef.Event = Event;
globalRef.EventAttachable = EventAttachable;
globalRef.EventDispatcher = EventDispatcher;
