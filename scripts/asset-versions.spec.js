import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  ASSET_VERSIONS_FILE,
  buildAssetVersions,
  writeAssetVersions,
} from './asset-versions.js';

describe('asset versions', () => {
  let root;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'asset-versions-'));
    mkdirSync(join(root, 'models'));
    writeFileSync(join(root, 'models', 'crab.glb'), 'crab');
    writeFileSync(join(root, 'sky.hdr'), 'sky');
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('lists every file by its bucket path with a short hash', () => {
    const versions = buildAssetVersions(root);
    expect(Object.keys(versions)).toEqual(['models/crab.glb', 'sky.hdr']);
    expect(versions['models/crab.glb']).toMatch(/^[0-9a-f]{10}$/);
  });

  it('changes a hash only when its file changes', () => {
    const before = buildAssetVersions(root);
    writeFileSync(join(root, 'models', 'crab.glb'), 'crab, re-exported');
    const after = buildAssetVersions(root);
    expect(after['models/crab.glb']).not.toBe(before['models/crab.glb']);
    expect(after['sky.hdr']).toBe(before['sky.hdr']);
  });

  it('skips the manifest and texture-fix backups', () => {
    writeFileSync(join(root, 'sky.hdr.orig'), 'old sky');
    expect(writeAssetVersions(root)).toBe(2);
    expect(writeAssetVersions(root)).toBe(2);
    const written = JSON.parse(
      readFileSync(join(root, ASSET_VERSIONS_FILE), 'utf8')
    );
    expect(Object.keys(written)).toEqual(['models/crab.glb', 'sky.hdr']);
  });
});
