// The specs run on node's own test runner, not jest. Jest runs each file in a
// vm context, where every global lookup in a per-texel loop costs about 30x,
// and that made the suite take minutes. The specs still use jest's names, so
// this file puts node's runner and jest's standalone `expect` on the global.

import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import { expect } from 'expect';

Object.assign(globalThis, {
  describe,
  it,
  test: it,
  beforeAll: before,
  beforeEach,
  afterEach,
  afterAll: after,
  expect,
});
