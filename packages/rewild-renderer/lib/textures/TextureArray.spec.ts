import { TextureProperties } from './Texture';
import { TextureArray } from './TextureArray';

// load() needs a GPUDevice and an ImageBitmap decoder, so the per-layer
// dimension check it performs is only exercised in the running app. What is
// testable here is the guard that runs before any of that.
describe('TextureArray', () => {
  it('rejects an empty layer list', () => {
    expect(() => new TextureArray(new TextureProperties('empty'), [])).toThrow(
      /at least one layer/
    );
  });

  it('keeps layer order as given — it is the shader contract', () => {
    const src = ['a.png', 'b.png', 'c.png'];
    expect(new TextureArray(new TextureProperties('ordered'), src).src).toEqual(
      src
    );
  });
});
