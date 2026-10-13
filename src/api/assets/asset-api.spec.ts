import { projectImageProblem, uploadProjectImage } from './asset-api';
import { authService } from '../auth/auth-service';

const response = (status: number, body?: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }) as Response;

const imageFile = (type = 'image/png', size = 1000) =>
  new File([new Uint8Array(size)], 'cover', { type });

describe('projectImageProblem', () => {
  it('accepts PNG, JPEG and WebP up to 2 MB', () => {
    expect(projectImageProblem(imageFile('image/png'))).toBeNull();
    expect(projectImageProblem(imageFile('image/jpeg'))).toBeNull();
    expect(projectImageProblem(imageFile('image/webp', 2 * 1024 * 1024))).toBeNull();
  });

  it('rejects other types and larger files', () => {
    expect(projectImageProblem(imageFile('image/gif'))).toContain('PNG');
    expect(projectImageProblem(imageFile('image/png', 2 * 1024 * 1024 + 1))).toContain('2 MB');
  });
});

describe('uploadProjectImage', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    jest.spyOn(authService, 'getToken').mockReturnValue('token');
  });

  afterEach(() => jest.restoreAllMocks());

  it('requests a URL, uploads with the file type, confirms and returns the image URL', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        response(200, { uploadUrl: 'https://bucket/put', storageKey: 'key.png', publicUrl: '' })
      )
      .mockResolvedValueOnce(response(200))
      .mockResolvedValueOnce(response(200, { imageUrl: 'https://cdn/key.png' }));

    const url = await uploadProjectImage('p1', imageFile());

    expect(url).toBe('https://cdn/key.png');
    const calls = (global.fetch as jest.Mock).mock.calls;
    expect(calls[0][0]).toContain('/api/projects/p1/image/upload-url');
    expect(JSON.parse(calls[0][1].body)).toEqual({ contentType: 'image/png', size: 1000 });
    expect(calls[1][0]).toBe('https://bucket/put');
    expect(calls[1][1].headers).toEqual({ 'Content-Type': 'image/png' });
    expect(calls[2][0]).toContain('/api/projects/p1/image/confirm');
    expect(JSON.parse(calls[2][1].body)).toEqual({ storageKey: 'key.png' });
  });

  it('rejects an invalid file without calling the server', async () => {
    await expect(uploadProjectImage('p1', imageFile('image/gif'))).rejects.toThrow('PNG');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("throws the server's message", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      response(400, { error: 'The image must be 2 MB or smaller' })
    );

    await expect(uploadProjectImage('p1', imageFile())).rejects.toThrow(
      'The image must be 2 MB or smaller'
    );
  });
});
