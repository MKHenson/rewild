import { createHash } from 'crypto';
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join, relative, sep } from 'path';

/** Matches ASSET_VERSIONS_FILE in the renderer's AssetUrls. */
export const ASSET_VERSIONS_FILE = 'asset-versions.json';
const HASH_LENGTH = 10;

function listFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) listFiles(path, out);
    else out.push(path);
  }
  return out;
}

/** Each file under `root` by its bucket path, against a short hash of its
 *  bytes. Skips the manifest itself and the `.orig` files the texture fix
 *  leaves behind. */
export function buildAssetVersions(root) {
  const versions = {};
  for (const file of listFiles(root).sort()) {
    const path = relative(root, file).split(sep).join('/');
    if (path === ASSET_VERSIONS_FILE || path.endsWith('.orig')) continue;
    versions[path] = createHash('sha256')
      .update(readFileSync(file))
      .digest('hex')
      .slice(0, HASH_LENGTH);
  }
  return versions;
}

/** Writes the manifest into `root` and returns how many files it lists. */
export function writeAssetVersions(root) {
  const versions = buildAssetVersions(root);
  writeFileSync(
    join(root, ASSET_VERSIONS_FILE),
    `${JSON.stringify(versions, null, 2)}\n`
  );
  return Object.keys(versions).length;
}
