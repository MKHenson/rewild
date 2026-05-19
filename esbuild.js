import * as esbuild from 'esbuild';
import * as http from 'http';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { copy } from 'esbuild-plugin-copy';

// Load .env into process.env (shell env vars take precedence)
if (fs.existsSync('.env')) {
  fs.readFileSync('.env', 'utf8')
    .split('\n')
    .filter(line => line.trim() && !line.startsWith('#'))
    .forEach(line => {
      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) return;
      const key = line.slice(0, eqIdx).trim();
      const value = line.slice(eqIdx + 1).trim();
      if (key && !(key in process.env)) process.env[key] = value;
    });
}

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
  'process.env.SHARED_ASSETS_BASE_URL': JSON.stringify(
    process.env.SHARED_ASSETS_BASE_URL || 'http://localhost:9001/assets/shared/'
  ),
  'process.env.API_BASE_URL': JSON.stringify(
    process.env.API_BASE_URL || ''
  ),
  'process.env.GOOGLE_CLIENT_ID': JSON.stringify(
    process.env.GOOGLE_CLIENT_ID || ''
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

const MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.hdr': 'application/octet-stream',
  '.bin': 'application/octet-stream',
  '.gltf': 'model/gltf+json',
  '.glb': 'model/gltf-binary',
  '.ktx2': 'image/ktx2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

async function serve() {
  const ctx = await esbuild.context(getConfig());
  await ctx.watch();
  const { host, port: esbuildPort } = await ctx.serve({ servedir: './public' });

  const assetsDir = path.join(process.cwd(), 'assets', 'shared');

  http.createServer((req, res) => {
    const isApi = req.url?.startsWith('/api');
    const isSharedAsset = req.url?.startsWith('/assets/shared/');

    if (isSharedAsset) {
      const requestPath = req.url.split('?')[0];
      const filePath = path.normalize(path.join(process.cwd(), requestPath));
      if (!filePath.startsWith(assetsDir)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      fs.stat(filePath, (err) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(filePath).pipe(res);
      });
      return;
    }

    const options = {
      hostname: isApi ? 'localhost' : host,
      port: isApi ? 8080 : esbuildPort,
      path: req.url,
      method: req.method,
      headers: req.headers,
    };
    const hasExtension = path.extname(req.url.split('?')[0]) !== '';
    const proxy = http.request(options, (proxyRes) => {
      if (proxyRes.statusCode === 404 && !isApi && !hasExtension) {
        proxyRes.resume();
        const indexPath = path.join(process.cwd(), 'public', 'index.html');
        fs.readFile(indexPath, (err, data) => {
          if (err) { res.writeHead(500); res.end('Internal server error'); return; }
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(data);
        });
        return;
      }
      const headers = { ...proxyRes.headers };
      delete headers['cross-origin-opener-policy'];
      res.writeHead(proxyRes.statusCode, headers);
      proxyRes.pipe(res, { end: true });
    });
    proxy.on('error', () => {
      res.writeHead(502);
      res.end('Backend unavailable');
    });
    req.pipe(proxy, { end: true });
  }).listen(9001, () => {
    const url = 'http://localhost:9001';
    console.log(`Dev server: ${url}`);
    const cmd = process.platform === 'win32' ? `start ${url}` :
                process.platform === 'darwin' ? `open ${url}` :
                `xdg-open ${url}`;
    exec(cmd);
  });
}

async function build() {
  copyPluginDetails.assets.forEach((asset) => (asset.watch = false));
  await esbuild.build(getConfig());
}

if (process.argv.join('').includes('serve')) serve();
else if (process.argv.join('').includes('watch')) watch();
else build();
