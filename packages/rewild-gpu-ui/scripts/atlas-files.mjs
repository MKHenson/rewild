/**
 * The committed font and icon atlases, under published names with a hash of
 * their contents. The deploy caches files for a year, so a changed atlas must
 * get new URLs. An atlas's JSON and PNG share one hash, so a browser never
 * pairs a new JSON with an old PNG.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Returns the atlas's URL under `urlBase`, for `UIFont.load` or
 * `UIIcons.load`, and the files to copy as [source, published name] pairs.
 */
function hashedAtlas(dir, name, script, urlBase) {
  const json = path.join(packageDir, dir, `${name}.json`);
  const png = path.join(packageDir, dir, `${name}.png`);
  const hash = crypto.createHash('sha256');
  for (const file of [json, png]) {
    if (!fs.existsSync(file))
      throw new Error(`The atlas ${file} is missing. Run "npm run ${script}".`);
    hash.update(fs.readFileSync(file));
  }
  const published = `${name}.${hash.digest('hex').slice(0, 10)}`;
  return {
    url: `${urlBase}/${published}.json`,
    files: [
      [json, `${published}.json`],
      [png, `${published}.png`],
    ],
  };
}

export function hashedFontAtlas(urlBase = '/fonts') {
  return hashedAtlas('fonts', 'roboto-msdf', 'ui-font', urlBase);
}

export function hashedIconAtlas(urlBase = '/icons') {
  return hashedAtlas('icons', 'lucide-icons', 'ui-icons', urlBase);
}
