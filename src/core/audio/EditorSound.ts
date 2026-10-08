import { AudioScope } from 'rewild-audio';
import type { Renderer } from 'rewild-renderer';
import { audio, closeSceneScope, openSceneScope } from './audio';

/**
 * The editor's sound. It opens a scene scope for the editor, so its sounds stop
 * when the editor closes. While sound is on, the editor camera is the listener
 * and emitters update each frame. While it is off, the master is silenced
 * rather than anything being stopped, so beds and emitters survive the toggle.
 */
export class EditorSound {
  readonly scope: AudioScope;

  private _enabled = false;
  private _frame = 0;

  constructor(private readonly _renderer: Renderer, enabled: boolean) {
    this.scope = openSceneScope();
    audio.setSilenced('editor', true);
    this.enabled = enabled;
  }

  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(on: boolean) {
    this._enabled = on;
    audio.setSilenced('editor', !on);
    if (on && !this._frame) this._frame = requestAnimationFrame(this._tick);
    else if (!on && this._frame) {
      cancelAnimationFrame(this._frame);
      this._frame = 0;
    }
  }

  dispose(): void {
    this.enabled = false;
    audio.setSilenced('editor', false);
    closeSceneScope(this.scope);
  }

  private _tick = () => {
    this._frame = requestAnimationFrame(this._tick);
    if (this._renderer.disposed) return;
    audio.setListenerFromMatrix(
      this._renderer.camera.camera.transform.matrixWorld
    );
    audio.update();
  };
}
