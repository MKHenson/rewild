import { remoteAssetReader } from './remote-assets';

const asset = (filename: string, publicUrl: string) => ({
  id: filename,
  projectId: 'p1',
  levelId: 'l1',
  assetType: 'chunk',
  contentType: 'application/octet-stream',
  filename,
  publicUrl,
  updatedAt: 1,
});

describe('remoteAssetReader', () => {
  let fetchMock: jest.Mock;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => warnSpy.mockRestore());

  it('downloads a listed file from its versioned URL', async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    fetchMock.mockResolvedValue({ ok: true, arrayBuffer: async () => bytes });
    const read = remoteAssetReader([asset('0_0.bin', 'https://cdn/0_0.bin?v=7')]);

    expect(await read('chunk', '0_0.bin')).toBe(bytes);
    expect(fetchMock).toHaveBeenCalledWith('https://cdn/0_0.bin?v=7');
  });

  it('resolves null for a file that is not listed, without a request', async () => {
    const read = remoteAssetReader([asset('0_0.bin', 'https://cdn/0_0.bin?v=7')]);

    expect(await read('chunk', '1_0.bin')).toBeNull();
    expect(await read('image', '0_0.bin')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resolves null when the download fails', async () => {
    const read = remoteAssetReader([
      asset('0_0.bin', 'https://cdn/0_0.bin?v=7'),
      asset('1_0.bin', 'https://cdn/1_0.bin?v=7'),
    ]);
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 403 })
      .mockRejectedValueOnce(new Error('offline'));

    expect(await read('chunk', '0_0.bin')).toBeNull();
    expect(await read('chunk', '1_0.bin')).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });
});
