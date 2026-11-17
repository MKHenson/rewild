/**
 * Finds and runs msdf-atlas-gen 1.4 or later
 * (https://github.com/Chlumsky/msdf-atlas-gen), for the font and icon atlas
 * scripts. It must be on the PATH, or at the path in the MSDF_ATLAS_GEN
 * environment variable:
 *
 * - macOS: `brew install msdf-atlas-gen`.
 * - Windows: download the Windows release from the GitHub releases page and
 *   put `msdf-atlas-gen.exe` on the PATH, or set MSDF_ATLAS_GEN to it.
 * - Linux: there is no package. Build it from source. See `howToInstall()`.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** The version the scripts were written against. */
const TESTED_VERSION = [1, 4];

/** Prints the message with the running script's name and stops. */
export function fail(message) {
  const script = path.basename(process.argv[1] ?? '', '.mjs');
  console.error(`\n${script}: ${message}\n`);
  process.exit(1);
}

function howToInstall() {
  const releases = 'https://github.com/Chlumsky/msdf-atlas-gen/releases';
  switch (process.platform) {
    case 'darwin':
      return 'Install it with Homebrew:\n\n    brew install msdf-atlas-gen';
    case 'win32':
      return [
        `Download the Windows release from ${releases}`,
        'and unzip it. Then put the folder with msdf-atlas-gen.exe on the PATH,',
        'or point MSDF_ATLAS_GEN at the file:',
        '',
        '    set MSDF_ATLAS_GEN=C:\\tools\\msdf-atlas-gen\\msdf-atlas-gen.exe',
      ].join('\n');
    default:
      return [
        'There is no Linux package. Build it from source, with the FreeType,',
        'libpng and tinyxml2 development packages installed:',
        '',
        '    git clone --recursive https://github.com/Chlumsky/msdf-atlas-gen.git',
        '    cd msdf-atlas-gen',
        '    cmake -B build -DCMAKE_BUILD_TYPE=Release \\',
        '      -DMSDF_ATLAS_USE_VCPKG=OFF -DMSDF_ATLAS_USE_SKIA=OFF',
        '    cmake --build build',
        '',
        'Then put build/bin on the PATH, or point MSDF_ATLAS_GEN at the binary.',
        'With vcpkg, leave out the two OFF options and set VCPKG_ROOT. CMake then',
        'fetches the dependencies. See the msdf-atlas-gen README.',
      ].join('\n');
  }
}

/** Finds msdf-atlas-gen and checks its version. Returns the command to run. */
export function findTool() {
  const fromEnv = process.env.MSDF_ATLAS_GEN;
  if (fromEnv && !fs.existsSync(fromEnv))
    fail(
      `MSDF_ATLAS_GEN is set to "${fromEnv}", but there is no file there.\n\n` +
        howToInstall()
    );
  const command = fromEnv || 'msdf-atlas-gen';
  const result = spawnSync(command, ['-version'], { encoding: 'utf8' });
  if (result.error?.code === 'ENOENT')
    fail(`msdf-atlas-gen is not on the PATH.\n\n${howToInstall()}`);
  if (result.error)
    fail(`msdf-atlas-gen did not start: ${result.error.message}`);

  const output = `${result.stdout}${result.stderr}`;
  const match = output.match(/MSDF-Atlas-Gen v(\d+)\.(\d+)/i);
  if (!match)
    fail(`"${command} -version" printed no version:\n\n${output.trim()}`);
  const [major, minor] = [Number(match[1]), Number(match[2])];
  if (major < TESTED_VERSION[0] || (major === TESTED_VERSION[0] && minor < TESTED_VERSION[1]))
    console.warn(
      `msdf-atlas-gen v${major}.${minor} is older than ` +
        `v${TESTED_VERSION.join('.')}, which this script was written for. ` +
        'If the atlas looks wrong, update it.'
    );
  return command;
}

/** Runs the tool and checks that it wrote each of `outputs`. */
export function runTool(command, args, outputs) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error) fail(`msdf-atlas-gen did not run: ${result.error.message}`);
  if (result.status !== 0)
    fail(
      `msdf-atlas-gen stopped with code ${result.status}:\n\n` +
        `${result.stdout}${result.stderr}`.trim()
    );
  for (const file of outputs)
    if (!fs.existsSync(file)) fail(`msdf-atlas-gen did not write ${file}.`);
}
