import { projectImageProblem } from './asset-api';

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
