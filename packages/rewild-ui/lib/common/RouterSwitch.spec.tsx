import '../../compiler/jsx';
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
