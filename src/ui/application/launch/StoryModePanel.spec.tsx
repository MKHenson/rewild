import 'rewild-ui/compiler/jsx';
import { StoryModePanel } from './StoryModePanel';
import { authService } from '../../../api/auth/auth-service';
import { db } from 'src/database/database';

const flush = () => new Promise((r) => setTimeout(r, 0));

const respond = (status: number, body: unknown = null) =>
  (global.fetch = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as never);

async function createPanel() {
  const onSelect = jest.fn();
  const comp = new StoryModePanel();
  comp._props = { onSelect } as never;
  comp._createRenderer();
  document.body.appendChild(comp);
  await flush();
  await flush();
  return { comp, onSelect };
}

describe('StoryModePanel', () => {
  beforeEach(() => {
    jest.spyOn(authService, 'getToken').mockReturnValue(null);
    jest.spyOn(db, 'getProjectImage').mockResolvedValue(null);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  it('shows the public game and selects it', async () => {
    respond(200, { id: 'p1', name: 'Valley', description: 'A long walk', imageUrl: 'https://cdn/v.png' });
    const { comp, onSelect } = await createPanel();

    expect(comp.shadow!.textContent).toContain('Valley');
    expect(comp.shadow!.textContent).toContain('A long walk');
    expect(onSelect).toHaveBeenCalledWith('p1');
  });

  it('selects nothing when no game is promoted', async () => {
    respond(204);
    const { comp, onSelect } = await createPanel();

    expect(comp.shadow!.textContent).toContain('Story Mode is not available yet');
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('selects nothing and shows why when the request fails', async () => {
    respond(500, { error: 'Server down' });
    const { comp, onSelect } = await createPanel();

    expect(comp.shadow!.textContent).toContain('Server down');
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
