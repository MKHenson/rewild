/**
 * The committed font atlas, under published names with a hash of its
 * contents. The deploy caches files for a year, so a changed atlas must get
 * new URLs. The JSON and the PNG share one hash, so a browser never pairs a
 * new JSON with an old PNG.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fontsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fonts');

/**
 * Returns the atlas's URL under `urlBase`, for `UIFont.load`, and the files
 * to copy as [source, published name] pairs.
 */
export function hashedFontAtlas(urlBase = '/fonts') {
  const json = path.join(fontsDir, 'roboto-msdf.json');
  const png = path.join(fontsDir, 'roboto-msdf.png');
  const hash = crypto.createHash('sha256');
  for (const file of [json, png]) {
    if (!fs.existsSync(file))
      throw new Error(`The font atlas ${file} is missing. Run "npm run ui-font".`);
    hash.update(fs.readFileSync(file));
  }
  const name = `roboto-msdf.${hash.digest('hex').slice(0, 10)}`;
  return {
    url: `${urlBase}/${name}.json`,
    files: [
      [json, `${name}.json`],
      [png, `${name}.png`],
    ],
  };
}
