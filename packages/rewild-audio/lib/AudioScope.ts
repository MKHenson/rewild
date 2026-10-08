import { Vector3 } from 'rewild-common';
import type { AudioEngine, PlayOptions } from './AudioEngine';
import { Bed, BedSpec } from './Bed';
import { Emitter, EmitterSpec } from './Emitter';

/** Seconds a scope's sounds take to fade out when it is disposed. */
export const SCOPE_FADE = 0.3;

/**
 * A group of sounds that end together, such as one game session. Everything
 * played, looped or created through a scope stops when it is disposed. Sounds
 * outside it, such as a menu theme, carry on.
 */
export class AudioScope {
  private readonly _beds: Bed[] = [];
  private readonly _emitters: Emitter[] = [];
  private _disposed = false;

  constructor(private readonly _engine: AudioEngine, readonly id: number) {}

  get disposed(): boolean {
    return this._disposed;
  }

  play(name: string, options?: PlayOptions): boolean {
    if (this._disposed) return false;
    return this._engine.play(name, options, this.id);
  }

  loop(name: string, options: PlayOptions & { at: Vector3 }): number {
    if (this._disposed) return 0;
    return this._engine.loop(name, options, this.id);
  }

  createBed(spec: BedSpec): Bed {
    const bed = this._engine.createBed(spec);
    if (this._disposed) bed.dispose();
    else this._beds.push(bed);
    return bed;
  }

  createEmitter(spec: EmitterSpec): Emitter {
    const emitter = this._engine.createEmitter(spec);
    if (this._disposed) emitter.dispose();
    else this._emitters.push(emitter);
    return emitter;
  }

  /** Fades out and stops everything the scope started. */
  dispose(fade: number = SCOPE_FADE): void {
    if (this._disposed) return;
    this._disposed = true;
    for (const bed of this._beds) bed.dispose(fade);
    for (const emitter of this._emitters) emitter.dispose(fade);
    this._beds.length = 0;
    this._emitters.length = 0;
    this._engine.stopOwner(this.id, fade);
  }
}
