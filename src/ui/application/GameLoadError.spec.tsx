import 'rewild-ui/compiler/jsx';
import { Button } from 'rewild-ui';
import { GameLoadError } from './GameLoadError';
import { GameNotFoundError } from '../../api/play';

function createError(error: Error) {
  const onQuit = jest.fn();
  const comp = new GameLoadError();
  comp._props = { error, onQuit } as never;
  comp._createRenderer();
  document.body.appendChild(comp);
  return { comp, onQuit };
}

describe('GameLoadError', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('tells the player a missing or private game was not found', () => {
    const { comp } = createError(new GameNotFoundError());
    expect(comp.shadow!.textContent).toContain('This game could not be found');
  });

  it('shows the reason for any other failure', () => {
    const { comp } = createError(new Error('WebGPU is not supported'));
    expect(comp.shadow!.textContent).toContain('WebGPU is not supported');
  });

  it('returns to the main menu', () => {
    const { comp, onQuit } = createError(new GameNotFoundError());
    (comp.shadow!.querySelector('x-button') as Button).props.onClick!(new MouseEvent('click'));
    expect(onQuit).toHaveBeenCalled();
  });
});
