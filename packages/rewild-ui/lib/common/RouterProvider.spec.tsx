import '../../compiler/jsx';
import { navigate } from './RouterProvider';

describe('navigate', () => {
  it('pushes state to window.history', () => {
    const pushStateSpy = jest.spyOn(window.history, 'pushState');

    navigate('/dashboard');

    expect(pushStateSpy).toHaveBeenCalledTimes(1);
    expect(pushStateSpy.mock.calls[0][0]).toEqual({ path: '/dashboard' });
    expect(pushStateSpy.mock.calls[0][1]).toBe('/dashboard');

    pushStateSpy.mockRestore();
  });

  it('dispatches history-pushed custom event', () => {
    const handler = jest.fn();
    window.addEventListener('history-pushed', handler);

    navigate('/settings');

    expect(handler).toHaveBeenCalledTimes(1);

    window.removeEventListener('history-pushed', handler);
  });
});
