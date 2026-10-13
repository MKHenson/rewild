import 'rewild-ui/compiler/jsx';
import { ProjectImage } from './ProjectImage';
import { db } from 'src/database/database';

const flush = () => new Promise((r) => setTimeout(r, 0));

function createImage(project: { id?: string; imageUrl?: string | null }) {
  const comp = new ProjectImage();
  comp._props = { project } as never;
  comp._createRenderer();
  document.body.appendChild(comp);
  return comp;
}

const img = (comp: ProjectImage) => comp.shadow!.querySelector('img');

describe('ProjectImage', () => {
  let pending: jest.SpyInstance;

  beforeEach(() => {
    URL.createObjectURL = jest.fn(() => 'blob:pending');
    URL.revokeObjectURL = jest.fn();
    pending = jest.spyOn(db, 'getPendingProjectImage').mockResolvedValue(null);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  it('shows the placeholder icon when the project has no image', async () => {
    const comp = createImage({ id: 'p1' });
    await flush();

    expect(img(comp)).toBeNull();
    expect(comp.shadow!.querySelector('.placeholder x-icon')).not.toBeNull();
  });

  it('shows the uploaded image', async () => {
    const comp = createImage({ id: 'p1', imageUrl: 'https://cdn/a.png' });
    await flush();

    expect(img(comp)!.src).toBe('https://cdn/a.png');
  });

  it('prefers an image waiting for upload, and releases it on removal', async () => {
    pending.mockResolvedValue(new File(['x'], 'image.png', { type: 'image/png' }));
    const comp = createImage({ id: 'p1', imageUrl: 'https://cdn/old.png' });
    await flush();

    expect(img(comp)!.src).toBe('blob:pending');

    comp.remove();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:pending');
  });
});
