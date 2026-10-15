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
  let getProjectImage: jest.SpyInstance;

  beforeEach(() => {
    URL.createObjectURL = jest.fn(() => 'blob:image');
    URL.revokeObjectURL = jest.fn();
    getProjectImage = jest.spyOn(db, 'getProjectImage').mockResolvedValue(null);
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

  it('shows the image the database resolves, and releases it on removal', async () => {
    getProjectImage.mockResolvedValue(new Blob(['x']));
    const project = { id: 'p1', imageUrl: 'https://cdn/a.png' };
    const comp = createImage(project);
    await flush();

    expect(getProjectImage).toHaveBeenCalledWith(project);
    expect(img(comp)!.src).toBe('blob:image');

    comp.remove();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:image');
  });

  it('reloads when the image URL changes', async () => {
    getProjectImage.mockResolvedValue(new Blob(['x']));
    const comp = createImage({ id: 'p1', imageUrl: 'https://cdn/a.png' });
    await flush();

    comp.props = { project: { id: 'p1', imageUrl: 'https://cdn/b.png' } };
    await flush();

    expect(getProjectImage).toHaveBeenCalledTimes(2);
  });
});
