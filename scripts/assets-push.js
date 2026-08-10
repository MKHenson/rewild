import { execSync } from 'child_process';
import { auditTextures, reportAudit } from './audit-textures.js';

const ASSET_ROOT = './assets/shared';

// Served without this, the browser only heuristically caches, so every page load
// re-fetches the whole ~95MB texture library. That is slow enough on its own to
// time requests out.
//
// Deliberately *not* `immutable`, unlike the client bundle: these keys are
// stable paths rather than content-hashed, and `textures:fix` rewrites files in
// place, so a republished texture has to be able to win. Without `immutable` a
// hard reload still bypasses the cache, and once the window lapses the ETag
// makes revalidation a 304 rather than a re-download. Worth revisiting if asset
// URLs ever carry a content hash.
const CACHE_CONTROL = 'public, max-age=604800';

const endpoint = process.env.SHARED_S3_ENDPOINT;
const bucket = process.env.SHARED_BUCKET_NAME;
const accessKey = process.env.SHARED_S3_ACCESS_KEY;
const secretKey = process.env.SHARED_S3_SECRET_KEY;

if (!endpoint || !bucket) {
  console.error('Missing required env vars: SHARED_S3_ENDPOINT, SHARED_BUCKET_NAME');
  console.error('See .env.example for setup instructions.');
  process.exit(1);
}

// Gate the push on the texture audit. The bucket is what the game loads from,
// so publishing is the point of no return for a mis-encoded texture: it goes
// live, it gets cached, and the resulting bug shows up as "the lighting looks
// off" weeks later rather than as a failure here. Catching it costs a couple of
// seconds; #204 cost a day.
//
// --strict promotes warnings (lossy data maps) to blocking as well. Those need
// re-exporting from source rather than a script run, so they do not block by
// default — turn it on once the library is clean and it stays clean.
if (!process.argv.includes('--skip-audit')) {
  const audit = await auditTextures(ASSET_ROOT);
  const strict = process.argv.includes('--strict');
  const blocking = audit.errors.length + (strict ? audit.warnings.length : 0);

  if (blocking) {
    reportAudit(audit, { root: ASSET_ROOT });
    console.error(
      `\nRefusing to push: ${blocking} blocking texture problem(s).\n` +
        `Fix with \`npm run textures:fix\`, or push anyway with ` +
        `\`npm run assets:push -- --skip-audit\`.`
    );
    process.exit(1);
  }

  console.log(
    `Texture audit passed` +
      (audit.warnings.length ? ` (${audit.warnings.length} warning(s) — see npm run textures:audit)` : '') +
      '.'
  );
}

// `sync` uploads only what changed, which means it also skips stamping metadata
// onto objects that are already up to date — so a cache-header change alone
// would be a no-op for the entire existing library. `--reupload` swaps in a
// plain recursive copy to push every file regardless, which is what applies new
// headers across the board. Costs a full upload, so it is opt-in.
const reupload = process.argv.includes('--reupload');

console.log(
  `Pushing assets to s3://${bucket}${reupload ? ' (re-uploading everything)' : ''} ...`
);

// *.orig is what `npm run textures:fix` leaves behind when it rewrites a
// texture in place — a local undo, since assets/shared is not in version
// control. Uploading those would republish the very files the fix removed.
const command = reupload
  ? `aws s3 cp ./assets/shared s3://${bucket} --recursive`
  : `aws s3 sync ./assets/shared s3://${bucket}`;

execSync(
  `${command} --endpoint-url ${endpoint} --acl public-read --cache-control "${CACHE_CONTROL}" --exclude "*.orig"`,
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      AWS_ACCESS_KEY_ID: accessKey,
      AWS_SECRET_ACCESS_KEY: secretKey,
    },
  }
);
