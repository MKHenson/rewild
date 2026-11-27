import { AssetUrls } from './AssetUrls';

const BASE = 'https://bucket.example/';

function urls(versions: unknown) {
  const requested: string[] = [];
  const assets = new AssetUrls(BASE, async (url) => {
    requested.push(url);
    if (versions instanceof Error) throw versions;
    return versions;
  });
  return { assets, requested };
}

describe('AssetUrls', () => {
  it('versions a listed path by its hash', async () => {
    const { assets } = urls({ 'models/crab.glb': 'abc123' });
    await assets.load();
    expect(assets.resolve('models/crab.glb')).toBe(
      `${BASE}models/crab.glb?v=abc123`
    );
  });

  it('leaves an unlisted path bare', async () => {
    const { assets } = urls({});
    await assets.load();
    expect(assets.resolve('models/new.glb')).toBe(`${BASE}models/new.glb`);
  });

  it('versions a texture a model resolves beside itself', async () => {
    const { assets } = urls({ 'nature/plains blade.webp': 'f00d' });
    await assets.load();
    const href = new URL('plains blade.webp', `${BASE}nature/plains.glb?v=1`)
      .href;
    expect(assets.version(href)).toBe(`${href}?v=f00d`);
  });

  it('leaves URLs outside the bucket alone', async () => {
    const { assets } = urls({ 'a.png': '1' });
    await assets.load();
    expect(assets.version('https://elsewhere.example/a.png')).toBe(
      'https://elsewhere.example/a.png'
    );
  });

  it('fetches the manifest once, and goes unversioned without one', async () => {
    const { assets, requested } = urls(new Error('offline'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await Promise.all([assets.load(), assets.load()]);
    expect(requested).toEqual([`${BASE}asset-versions.json`]);
    expect(assets.resolve('a.png')).toBe(`${BASE}a.png`);
    warn.mockRestore();
  });
});
