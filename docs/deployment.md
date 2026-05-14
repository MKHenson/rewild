# Deployment

## Overview

RE-WILD has two independently deployable parts:

| Part | Hosting | Trigger |
|---|---|---|
| **Client** | Scaleway Object Storage (static website) | Push to `main` touching client files |
| **Server** | Scaleway Serverless Container | Push to `main` touching `server/` |

Both are deployed automatically via GitHub Actions. Each workflow only triggers when files relevant to that part change — a server-only change won't redeploy the client, and vice versa.

---

## Automated Deployment (GitHub Actions)

### Client — `.github/workflows/deploy-client.yml`

Triggers on push to `main` when any of these paths change:
- `src/**`, `packages/**`, `static/**`, `templates/**`
- `index.html`, `style.css`, `esbuild.js`

**What it does:**
1. Installs Node dependencies
2. Builds the client with `SHARED_ASSETS_BASE_URL` and `API_BASE_URL` baked in
3. Injects the git commit SHA as a cache-busting query string into `index.html` (`main.js?v=<sha>`)
4. Uploads `index.html` with `Cache-Control: no-cache` so browsers always get the latest
5. Uploads all other files with `Cache-Control: max-age=31536000, immutable` for long-term caching

**Required GitHub secrets:**
| Secret | Value |
|---|---|
| `SCW_ACCESS_KEY` | Scaleway access key |
| `SCW_SECRET_KEY` | Scaleway secret key |
| `CLIENT_BUCKET_NAME` | `rewild-client` |
| `SHARED_ASSETS_BASE_URL` | `https://rewild-shared-assets.s3.fr-par.scw.cloud/` |
| `API_BASE_URL` | `https://rewildeff9a58d-rewild-server-prod.functions.fnc.fr-par.scw.cloud` |

### Server — `.github/workflows/deploy-server.yml`

Triggers on push to `main` when anything under `server/` changes.

**What it does:**
1. Runs the server test suite (`./gradlew test`)
2. Logs in to the Scaleway Container Registry
3. Builds a Docker image from `server/Dockerfile`
4. Pushes the image to `rg.fr-par.scw.cloud/rewild/rewild-server:latest`
5. Triggers a redeploy of the Serverless Container via the Scaleway CLI

**Required GitHub secrets:**
| Secret | Value |
|---|---|
| `SCW_SECRET_KEY` | Scaleway secret key |
| `SCW_PROJECT_ID` | Scaleway project ID (Organisation → Projects) |
| `SCW_CONTAINER_ID` | Container UUID (visible in the Scaleway console container settings) |

---

## Manual Deployment

### Client

Prerequisites: Node 22+, AWS CLI configured with `aws configure set default.region fr-par`

```bash
# Build with production env vars
SHARED_ASSETS_BASE_URL=https://rewild-shared-assets.s3.fr-par.scw.cloud/ \
API_BASE_URL=https://rewildeff9a58d-rewild-server-prod.functions.fnc.fr-par.scw.cloud \
npm run build

# Upload index.html with no-cache
aws s3 cp ./public/index.html s3://rewild-client/index.html \
  --endpoint-url https://s3.fr-par.scw.cloud \
  --cache-control "no-cache, no-store" \
  --content-type "text/html"

# Upload everything else with long cache
aws s3 sync ./public s3://rewild-client \
  --endpoint-url https://s3.fr-par.scw.cloud \
  --exclude "index.html" \
  --cache-control "max-age=31536000, immutable" \
  --delete
```

### Server

Prerequisites: Docker Desktop running, logged in to the Scaleway registry

```bash
# Log in to Scaleway registry
echo "<your-scaleway-secret-key>" | docker login rg.fr-par.scw.cloud -u nologin --password-stdin

# Build the image
cd server
docker build -t rg.fr-par.scw.cloud/rewild/rewild-server:latest .

# Push the image
docker push rg.fr-par.scw.cloud/rewild/rewild-server:latest

# Trigger redeploy (install Scaleway CLI first if needed)
scw container container deploy <container-id> region=fr-par
```

> Scaleway does **not** redeploy automatically when a new image is pushed with the same tag. The `scw container container deploy` command is required to pick up the new image.

---

## Infrastructure

| Resource | Name | Provider |
|---|---|---|
| Client static site | `rewild-client` bucket | Scaleway Object Storage |
| Shared game assets | `rewild-shared-assets` bucket | Scaleway Object Storage |
| Container registry | `rewild` namespace | Scaleway Container Registry |
| API server | `rewild-server-prod` | Scaleway Serverless Containers |
| Database | `rewild-prod` | Scaleway Managed PostgreSQL |
