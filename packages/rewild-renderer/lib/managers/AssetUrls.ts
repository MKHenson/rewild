/** The manifest `assets:push` writes beside the shared assets: each file's
 *  path under the bucket against a hash of its bytes. */
export const ASSET_VERSIONS_FILE = 'asset-versions.json';

/** Maps shared asset paths to the URLs to fetch them from. A path whose file
 *  changes gets a new `?v=` hash, so the browser caches every asset for long
 *  and still fetches one the moment it is republished. */
export class AssetUrls {
  private versions: Record<string, string> = {};
  private loading: Promise<void> | null = null;

  constructor(
    readonly base: string,
    private readonly fetchJson: (url: string) => Promise<unknown>
  ) {}

  /** Fetches the manifest once; every call shares the first. Without one,
   *  URLs go unversioned. */
  load(): Promise<void> {
    this.loading ??= this.fetchJson(this.base + ASSET_VERSIONS_FILE)
      .then((versions) => {
        if (versions && typeof versions === 'object')
          this.versions = versions as Record<string, string>;
      })
      .catch((error) => {
        console.warn(
          `${ASSET_VERSIONS_FILE} did not load, so shared assets are fetched unversioned:`,
          error
        );
      });
    return this.loading;
  }

  /** The URL of a path under the shared asset bucket. */
  resolve(path: string): string {
    return this.version(this.base + path);
  }

  /** `url` with its hash, when it is a shared asset the manifest lists. */
  version(url: string): string {
    if (!url.startsWith(this.base) || url.includes('?')) return url;
    const hash = this.versions[decodeURI(url.slice(this.base.length))];
    return hash ? `${url}?v=${hash}` : url;
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok)
    throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

export const assetUrls = new AssetUrls(
  process.env.SHARED_ASSETS_BASE_URL ?? '',
  fetchJson
);

/** Resolves a shared asset path against the bucket, with its version. */
export function resolveAssetUrl(path: string): string {
  return assetUrls.resolve(path);
}
