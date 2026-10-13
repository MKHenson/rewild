import type { ServerAsset } from '../api/assets/asset-api';
import type { AssetReader } from './local-asset-store';

/**
 * Reads a level's files from their versioned URLs, without storing them on the device.
 * The browser cache keeps them between plays. A file missing from the list, or one that
 * fails to download, resolves null, so its chunk is generated.
 */
export function remoteAssetReader(assets: ServerAsset[]): AssetReader {
  const urls = new Map(assets.map((a) => [`${a.assetType}/${a.filename}`, a.publicUrl]));

  return async (assetType, filename) => {
    const url = urls.get(`${assetType}/${filename}`);
    if (!url) return null;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.arrayBuffer();
    } catch (err) {
      console.warn(`Could not download ${assetType}/${filename}:`, err);
      return null;
    }
  };
}
