# Server Installation

## Prerequisites

- JDK 17 or higher
- Docker & Docker Compose (for the local PostgreSQL database)

## Start local services

```bash
cd server
docker compose up -d
```

This starts PostgreSQL and MinIO (local S3-compatible storage). The MinIO console is available at `http://localhost:9090` (host-mapped away from 9001, which the web dev server uses). On first run, log in with `rewild`/`rewild-dev` (MinIO requires the password to be at least 8 characters) and:

1. Create a bucket named `rewild-assets`.
2. Set the bucket's **Access Policy** to `public` (Buckets → rewild-assets → Access Policy). Assets are fetched by their public URL without authentication, so a private bucket makes every read fail with `AccessDenied`.

## Run the Ktor server

```bash
cd server
./gradlew run
```

The server starts at `http://localhost:8080`. The dev client proxies `/api/*` requests there automatically so no CORS configuration is needed during development.

## Environment variables

Copy `.env.example` to `server/.env` and fill in the values:

```
DB_URL=jdbc:postgresql://localhost:5432/rewild
DB_USER=rewild
DB_PASSWORD=rewild
JWT_SECRET=<strong-random-secret>
JWT_ISSUER=http://localhost:8080
REFRESH_TOKEN_SECRET=<strong-random-secret>
BUCKET_BASE_URL=http://localhost:9000/rewild-assets
BUCKET_NAME=rewild-assets
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=rewild
S3_SECRET_KEY=rewild-dev
```

