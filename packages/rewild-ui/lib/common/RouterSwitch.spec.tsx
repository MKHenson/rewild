import '../../compiler/jsx';
import { Route } from './Route';
import { RouterSwitch } from './RouterSwitch';

describe('RouterSwitch', () => {
  it('creates a router switch component', () => {
    const sw = new RouterSwitch();
    expect(sw).toBeInstanceOf(HTMLElement);
  });

  it('listens for history-pushed events on connect', () => {
    const addSpy = jest.spyOn(window, 'addEventListener');
    const sw = new RouterSwitch();

    // RouterSwitch requires _props with children for init()
    sw._props = { children: [] } as any;
    sw._createRenderer();
    sw.connectedCallback();

    const historyCall = addSpy.mock.calls.find(
      (call) => call[0] === 'history-pushed'
    );
    expect(historyCall).toBeDefined();

    sw.disconnectedCallback();
    addSpy.mockRestore();
  });

  describe('route matching', () => {
    let sw: RouterSwitch;
    let onAdmin: jest.Mock;
    let onUser: jest.Mock;

    const go = (path: string) => {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new CustomEvent('history-pushed'));
    };

    beforeEach(() => {
      window.history.pushState({}, '', '/admin');
      onAdmin = jest.fn(() => <div class="admin" />);
      onUser = jest.fn((params) => <div class="user">{params.id}</div>);
      sw = (
        <RouterSwitch>
          <Route path="/users/:id" onRender={onUser} />
          <Route path="/admin" onRender={onAdmin} />
        </RouterSwitch>
      ) as RouterSwitch;
      document.body.appendChild(sw);
    });

    afterEach(() => sw.remove());

    it('keeps a route mounted while it still matches with the same params', () => {
      const rendered = sw.querySelector('.admin');
      go('/admin/users/1');

      expect(onAdmin).toHaveBeenCalledTimes(1);
      expect(sw.querySelector('.admin')).toBe(rendered);
    });

    it('re-renders a route when its params change', () => {
      go('/users/1');
      go('/users/2');

      expect(onUser).toHaveBeenCalledTimes(2);
      expect(sw.querySelector('.user')?.textContent).toBe('2');
    });

    it('clears the previous route when another one matches', () => {
      go('/users/1');

      expect(sw.querySelector('.admin')).toBeNull();
      expect(sw.querySelector('.user')).not.toBeNull();
      expect(sw.querySelectorAll('x-route[active]').length).toBe(1);
      expect(sw.querySelector('x-route[active] .user')).not.toBeNull();
    });

    it('re-renders the active route after being reconnected', () => {
      sw.remove();
      document.body.appendChild(sw);

      expect(onAdmin).toHaveBeenCalledTimes(2);
      expect(sw.querySelector('.admin')).not.toBeNull();
    });
  });

  it('removes history-pushed listener on disconnect', () => {
    const removeSpy = jest.spyOn(window, 'removeEventListener');
    const sw = new RouterSwitch();

    sw._props = { children: [] } as any;
    sw._createRenderer();
    sw.connectedCallback();
    sw.disconnectedCallback();

    const historyCall = removeSpy.mock.calls.find(
      (call) => call[0] === 'history-pushed'
    );
    expect(historyCall).toBeDefined();

    removeSpy.mockRestore();
  });
});
