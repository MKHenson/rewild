# Client Installation

## Prerequisites

- [Node.js](https://nodejs.org/) v22 or higher
- [AWS CLI](https://aws.amazon.com/cli/)

## 1. Install dependencies

```bash
npm install
```

## 2. Configure asset credentials

Shared assets (skyboxes, terrain textures, etc.) are not committed to the repository. You must pull them before the app will work.

Copy `.env.example` to `.env` at the repo root and fill in your Scaleway credentials:

```
SHARED_S3_ENDPOINT=https://s3.fr-par.scw.cloud
SHARED_BUCKET_NAME=rewild-shared-assets
SHARED_S3_ACCESS_KEY=<your-scaleway-access-key>
SHARED_S3_SECRET_KEY=<your-scaleway-secret-key>
```

Scaleway API keys are created in the [IAM section](https://console.scaleway.com/iam/api-keys) of the Scaleway console.

Also set the AWS CLI default region (required once per machine):

```bash
aws configure set default.region fr-par
```

## 3. Pull assets

```bash
npm run assets:pull
```

Downloads the full contents of the `rewild-shared-assets` bucket into `assets/shared/` on your local machine. The dev server serves this folder at `/assets/shared/` so the app works fully offline once pulled.

## 4. Run in development

```bash
npm run start
```

Starts the dev server at `http://localhost:9001` and opens it in your browser. The TypeScript compiler runs in parallel and reports errors in the terminal.

---

## Production build

```bash
npm run build
```

Outputs compiled assets to `public/`. Before building for production, set `SHARED_ASSETS_BASE_URL` in your environment to the public Scaleway bucket URL:

```
SHARED_ASSETS_BASE_URL=https://rewild-shared-assets.s3.fr-par.scw.cloud/
```

## Pushing asset changes

If you add or modify files in `assets/shared/`, upload them to the bucket with:

```bash
npm run assets:push
```

Only changed files are transferred. The running application never needs S3 credentials — it only reads public asset URLs.
