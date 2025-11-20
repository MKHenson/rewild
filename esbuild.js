import * as esbuild from 'esbuild';
import fs from 'fs';
import { copy } from 'esbuild-plugin-copy';

const copyPluginDetails = {
  // this is equal to process.cwd(), which means we use cwd path as base path to resolve `to` path
  // if not specified, this plugin uses ESBuild.build outdir/outfile options as base path.
  resolveFrom: 'cwd',
  assets: [
    {
      from: ['style.css'],
      to: ['./public/style.css'],
      watch: true,
    },
    {
      from: ['index.html'],
      to: ['./public/index.html'],
      watch: true,
    },
    {
      from: ['./templates/**/*'], // Match all files and subfolders in the templates folder
      to: ['./public/templates'], // Destination folder
      watch: true,
    },
    {
      from: ['./packages/rewild-assembly/build/release.wasm'],
      to: ['./public/release.wasm'],
      watch: true,
    },
    {
      from: ['./packages/rewild-assembly/build/release.wasm.map'],
      to: ['./public/release.wasm.map'],
      watch: true,
    },
    {
      from: ['./packages/rewild-assembly/build/release.js'],
      to: ['./public/release.js'],
      watch: true,
    },
    {
      from: ['./packages/rewild-assembly/build/release.d.ts'],
      to: ['./public/release.d.ts'],
      watch: true,
    },
  ],
};

const defines = {
  'process.env.MEDIA_URL': JSON.stringify(
    'https://storage.googleapis.com/rewild-6809/'
  ),
};

let examplePlugin = {
  name: 'example',
  setup(build) {
    build.onStart(() => {
      console.log('build started');
    }),
      build.onEnd((result) => {
        console.log(`build ended with ${result.errors.length} errors`);
      });
  },
};

const wgslPlugin = {
  name: 'wgsl',
  setup(build) {
    build.onLoad({ filter: /\.wgsl$/ }, async (args) => {
      const contents = await fs.promises.readFile(args.path, 'utf8');
      return {
        contents: contents,
        loader: 'text',
      };
    });
  },
};

async function watch() {
  let ctx = await esbuild.context({
    entryPoints: {
      main: './src/index.tsx',
      terrainWorker:
        'rewild-renderer/lib/renderers/terrain/worker/TerrainWorker.ts',
    },
    loader: {
      '.wgsl': 'text',
      '.wasm': 'file',
    },
    bundle: true,
    sourcemap: true,
    external: [],
    tsconfig: './src/tsconfig.json',
    outdir: './public',
    define: defines,
    plugins: [examplePlugin, wgslPlugin, copy(copyPluginDetails)],
  });
  await ctx.watch({});
  console.log('Watching...');
}

async function build() {
  copyPluginDetails.assets.forEach((asset) => (asset.watch = false));

  await esbuild.build({
    entryPoints: {
      main: './src/index.tsx',
      terrainWorker:
        'rewild-renderer/lib/renderers/terrain/worker/TerrainWorker.ts',
    },
    loader: {
      '.wgsl': 'text', // Add this line to handle .wgsl files
      '.wasm': 'file', // Handles .wasm files
    },
    bundle: true,
    tsconfig: './src/tsconfig.json',
    outdir: './public',
    define: defines,
    plugins: [examplePlugin, copy(copyPluginDetails)],
  });
}

if (process.argv.join('').includes('watch')) watch();
else build();
