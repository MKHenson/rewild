import 'rewild-ui/compiler/jsx';
import { IProject } from 'models';
import { Button, Modal, Tabs } from 'rewild-ui';
import { LaunchPage } from './LaunchPage';
import { authService } from '../../../api/auth/auth-service';
import { db } from 'src/database/database';
import { clearDatabase } from 'src/database/local-db';

const flush = () => new Promise((r) => setTimeout(r, 0));

const respond = (status: number, body: unknown = null) =>
  (global.fetch = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as never);

async function createPage() {
  const onStart = jest.fn();
  const onBack = jest.fn();
  const comp = new LaunchPage();
  comp._props = { onStart, onBack } as never;
  comp._createRenderer();
  document.body.appendChild(comp);
  await flush();
  await flush();
  return { comp, onStart, onBack };
}

const footerButton = (comp: LaunchPage, cls: 'ok' | 'cancel') => {
  const modal = comp.shadow!.querySelector('x-modal') as Modal;
  return modal.shadow!.querySelector(`x-button.${cls}`) as Button;
};

describe('LaunchPage', () => {
  beforeEach(async () => {
    await clearDatabase('rewild');
    jest.spyOn(authService, 'getToken').mockReturnValue(null);
    jest.spyOn(db, 'getPendingProjectImage').mockResolvedValue(null);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  it('starts the public game from the footer, without going back', async () => {
    respond(200, { id: 'p1', name: 'Valley', description: '', imageUrl: null });
    const { comp, onStart, onBack } = await createPage();

    const start = footerButton(comp, 'ok');
    expect(start.textContent?.trim()).toBe('Start');
    expect(start.props.disabled).toBe(false);

    start.props.onClick!(new MouseEvent('click'));
    expect(onStart).toHaveBeenCalledWith('p1');
    expect(onBack).not.toHaveBeenCalled();
  });

  it('disables Start when no game is promoted', async () => {
    respond(204);
    const { comp } = await createPage();

    expect(footerButton(comp, 'ok').props.disabled).toBe(true);
  });

  it('Start plays the project selected in the open tab', async () => {
    respond(200, { id: 'p1', name: 'Valley', description: '', imageUrl: null });
    const mine = await db.projects.add({ name: 'Mine', description: '', startEvent: '', sceneGraph: { containers: [] } } as unknown as IProject);
    const { comp, onStart } = await createPage();
    await flush();

    const tabs = comp.shadow!.querySelector('x-tabs') as Tabs;
    const tabButtons = tabs.shadow!.querySelectorAll('button.tab-button');
    (tabButtons[1] as HTMLButtonElement).click();
    footerButton(comp, 'ok').props.onClick!(new MouseEvent('click'));
    expect(onStart).toHaveBeenLastCalledWith(mine.id);

    (tabButtons[0] as HTMLButtonElement).click();
    footerButton(comp, 'ok').props.onClick!(new MouseEvent('click'));
    expect(onStart).toHaveBeenLastCalledWith('p1');
  });

  it('Back returns to the main menu', async () => {
    respond(204);
    const { comp, onBack } = await createPage();

    const back = footerButton(comp, 'cancel');
    expect(back.textContent?.trim()).toBe('Back');
    back.props.onClick!(new MouseEvent('click'));
    expect(onBack).toHaveBeenCalled();
  });
});
