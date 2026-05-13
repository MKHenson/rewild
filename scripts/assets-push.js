import { execSync } from 'child_process';

const endpoint = process.env.SHARED_S3_ENDPOINT;
const bucket = process.env.SHARED_BUCKET_NAME;
const accessKey = process.env.SHARED_S3_ACCESS_KEY;
const secretKey = process.env.SHARED_S3_SECRET_KEY;

if (!endpoint || !bucket) {
  console.error('Missing required env vars: SHARED_S3_ENDPOINT, SHARED_BUCKET_NAME');
  console.error('See .env.example for setup instructions.');
  process.exit(1);
}

console.log(`Pushing assets to s3://${bucket} ...`);

execSync(`aws s3 sync ./assets/shared s3://${bucket} --endpoint-url ${endpoint} --acl public-read`, {
  stdio: 'inherit',
  env: {
    ...process.env,
    AWS_ACCESS_KEY_ID: accessKey,
    AWS_SECRET_ACCESS_KEY: secretKey,
  },
});
