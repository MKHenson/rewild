import * as esbuild from 'esbuild';
import * as http from 'http';
import fs from 'fs';
import path from 'path';
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
      from: ['./static/**/*'], // Match all files and subfolders in the static folder
      to: ['./public'], // Destination folder
      watch: true,
    },
  ],
};

const defines = {
  'process.env.MEDIA_URL': JSON.stringify(
    'https://storage.googleapis.com/rewild-6809/'
  ),
};

const logPlugin = {
  name: 'log',
  setup(build) {
    build.onStart(() => {
      console.log('build started');
    });
    build.onEnd((result) => {
      console.log(`build ended with ${result.errors.length} errors`);
    });
  },
};

/**
 * This plugin replaces #include "" statements in wgsl files
 */
const wgslInlineIncludePlugin = {
  name: 'wgsl',
  setup(build) {
    build.onLoad({ filter: /\.wgsl$/ }, async (args) => {
      let contents = await fs.promises.readFile(args.path, 'utf8');

      const includePattern = /#include\s*["<]([^">]+)[">]/g;
      let match;
      const watchedFiles = [args.path];

      // 3. Process #include statements recursively
      while ((match = includePattern.exec(contents)) !== null) {
        const includeFileName = match[1];
        const includePath = path.join(path.dirname(args.path), includeFileName);

        // Recursively load the included file using esbuild's internal resolver
        const resolved = await build.resolve(includePath, {
          kind: 'import-statement',
          resolveDir: path.dirname(args.path),
          // Ensure we don't recurse infinitely if a file includes itself
          pluginData: { included: true },
        });

        if (resolved.errors && resolved.errors.length > 0) {
          throw new Error(`Failed to resolve include: ${includeFileName}`);
        }

        // Add the resolved file path to the list of watched files
        watchedFiles.push(resolved.path);

        // Load the content of the included file
        const includedContents = await fs.promises.readFile(
          resolved.path,
          'utf8'
        );

        // Replace the #include line with the actual file content
        contents = contents.replace(match[0], includedContents);

        // Reset the regex index to re-scan from the beginning of the modified content
        includePattern.lastIndex = 0;
      }

      return {
        contents: contents,
        loader: 'text',
        watchFiles: watchedFiles,
      };
    });
  },
};

function getConfig() {
  return {
    entryPoints: {
      main: './src/index.tsx',
      terrainWorker:
        'rewild-renderer/lib/renderers/terrain/worker/TerrainWorker.ts',
      bvhWorker: 'rewild-renderer/lib/acceleration/worker/BVHWorker.ts',
    },
    loader: {
      '.wgsl': 'text',
      '.wasm': 'file',
    },
    bundle: true,
    sourcemap: true,
    tsconfig: './src/tsconfig.json',
    outdir: './public',
    define: defines,
    plugins: [logPlugin, wgslInlineIncludePlugin, copy(copyPluginDetails)],
  };
}

async function watch() {
  let ctx = await esbuild.context(getConfig());
  await ctx.watch({});
  console.log('Watching...');
}

async function serve() {
  const ctx = await esbuild.context(getConfig());
  await ctx.watch();
  const { host, port: esbuildPort } = await ctx.serve({ servedir: './public' });

  http.createServer((req, res) => {
    const isApi = req.url?.startsWith('/api');
    const options = {
      hostname: isApi ? 'localhost' : host,
      port: isApi ? 8080 : esbuildPort,
      path: req.url,
      method: req.method,
      headers: req.headers,
    };
    const proxy = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });
    proxy.on('error', () => {
      res.writeHead(502);
      res.end('Backend unavailable');
    });
    req.pipe(proxy, { end: true });
  }).listen(9001, () => console.log('Dev server: http://localhost:9001'));
}

async function build() {
  copyPluginDetails.assets.forEach((asset) => (asset.watch = false));
  await esbuild.build(getConfig());
}

if (process.argv.join('').includes('serve')) serve();
else if (process.argv.join('').includes('watch')) watch();
else build();
