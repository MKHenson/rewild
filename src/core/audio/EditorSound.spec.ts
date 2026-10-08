import { Matrix4 } from 'rewild-common';
import type { Renderer } from 'rewild-renderer';
import { audio, sceneScope } from './audio';
import { EditorSound } from './EditorSound';

let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;

function runFrame() {
  const pending = [...frames.values()];
  frames.clear();
  for (const callback of pending) callback(0);
}

function fakeRenderer(x: number, y: number, z: number) {
  const matrixWorld = new Matrix4();
  matrixWorld.elements[12] = x;
  matrixWorld.elements[13] = y;
  matrixWorld.elements[14] = z;
  return {
    disposed: false,
    camera: { camera: { transform: { matrixWorld } } },
  } as unknown as Renderer & { disposed: boolean };
}

beforeEach(() => {
  frames = new Map();
  nextFrame = 1;
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.set(nextFrame, callback);
    return nextFrame++;
  });
  jest
    .spyOn(window, 'cancelAnimationFrame')
    .mockImplementation((id) => void frames.delete(id));
});

afterEach(() => {
  jest.restoreAllMocks();
  audio.setSilenced('editor', false);
});

describe('EditorSound', () => {
  it('opens the scene scope and stays silent when off', () => {
    const sound = new EditorSound(fakeRenderer(0, 0, 0), false);
    expect(sceneScope()).toBe(sound.scope);
    expect(audio.isSilenced('editor')).toBe(true);
    expect(frames.size).toBe(0);
    sound.dispose();
  });

  it('follows the editor camera and updates each frame when on', () => {
    const update = jest.spyOn(audio, 'update');
    const sound = new EditorSound(fakeRenderer(4, 5, 6), true);
    expect(audio.isSilenced('editor')).toBe(false);

    runFrame();
    const p = audio.listenerPosition;
    expect([p.x, p.y, p.z]).toEqual([4, 5, 6]);
    expect(update).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(1);
    sound.dispose();
  });

  it('silences and stops its loop when turned off', () => {
    const sound = new EditorSound(fakeRenderer(0, 0, 0), true);
    sound.enabled = false;
    expect(audio.isSilenced('editor')).toBe(true);
    expect(frames.size).toBe(0);

    sound.enabled = true;
    expect(audio.isSilenced('editor')).toBe(false);
    expect(frames.size).toBe(1);
    sound.dispose();
  });

  it('skips the listener once the renderer is disposed', () => {
    const update = jest.spyOn(audio, 'update');
    const renderer = fakeRenderer(0, 0, 0);
    const sound = new EditorSound(renderer, true);
    renderer.disposed = true;
    runFrame();
    expect(update).not.toHaveBeenCalled();
    sound.dispose();
  });

  it('ends its scope and lifts the silence on dispose', () => {
    const sound = new EditorSound(fakeRenderer(0, 0, 0), false);
    sound.dispose();
    expect(sound.scope.disposed).toBe(true);
    expect(sceneScope()).toBeNull();
    expect(audio.isSilenced('editor')).toBe(false);
    expect(frames.size).toBe(0);
  });
});
