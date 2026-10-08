import { Vector3 } from 'rewild-common';
import { AudioEngine, BUS_NAMES, Bed, isBusName } from 'rewild-audio';

export function registerAudioDebugCommands(audio: AudioEngine) {
  const busList = BUS_NAMES.join(' | ');
  const held = new Map<string, Bed>();

  (window as any).audio = () => {
    const ctx = audio.context;
    console.log(
      `Audio: ${audio.state}` +
        (ctx
          ? `, ${ctx.sampleRate} Hz, latency ${(ctx.baseLatency * 1000).toFixed(
              1
            )} ms`
          : ' — starts on the first click or key press') +
        `\nWorld: muffle ${Math.round(
          audio.muffleCutoff
        )} Hz at ${audio.muffleLevel.toFixed(2)}` +
        `, ${audio.ducked ? 'ducked' : 'not ducked'}` +
        (audio.mix.solo ? `\nSolo: ${audio.mix.solo}` : '') +
        `\n${describeBank(audio)}` +
        `\n3D voices: ${audio.voicesInUse}/${audio.voiceCount} in use, ${audio.panningModel} panning` +
        `\nListener: at ${vec(audio.listenerPosition)}, forward ${vec(
          audio.listenerForward
        )}, up ${vec(audio.listenerUp)}`
    );
    console.table(
      Object.fromEntries(
        BUS_NAMES.map((bus) => [
          bus,
          {
            volume: audio.mix.volume(bus),
            muted: audio.mix.muted(bus),
            gain: audio.mix.gain(bus),
            effective: +audio.mix.effectiveGain(bus).toFixed(3),
          },
        ])
      )
    );
    if (audio.voicesInUse)
      console.table(
        audio.voices().map((v) => ({
          id: v.id,
          sound: v.name,
          at: vec(v.at),
          loudness: +v.loudness.toFixed(3),
          priority: v.priority,
        }))
      );
    if (audio.emitters.length)
      console.table(
        audio.emitters.map((e) => ({
          sound: e.sound,
          at: vec(e.at),
          gain: e.gain,
          heard: +e.heard.toFixed(4),
          state: e.state,
        }))
      );
    if (audio.beds.size)
      console.table(
        [...audio.beds].map((bed) => ({
          sounds: bed.spec.sounds.join(' + '),
          bus: bed.spec.bus,
          gain: +bed.gain.toFixed(3),
          blend: bed.blend,
          state: bed.state,
        }))
      );
  };

  (window as any).setAudioVolume = (bus?: string, value?: number) => {
    if (!isBusName(bus) || value === undefined) {
      console.log(`setAudioVolume(${busList}, 0..1)`);
      return;
    }
    if (!Number.isFinite(value)) {
      console.warn(`Volume must be a number, got ${value}`);
      return;
    }
    audio.setVolume(bus, value);
    console.log(`${bus} volume → ${audio.mix.volume(bus)}`);
  };

  (window as any).muteAudio = (bus: string = 'master') => {
    if (!isBusName(bus)) {
      console.log(`muteAudio(${busList}?) — no argument mutes all audio`);
      return;
    }
    audio.setMuted(bus, !audio.mix.muted(bus));
    console.log(`${bus} ${audio.mix.muted(bus) ? 'muted' : 'unmuted'}`);
  };

  (window as any).soloAudio = (bus?: string) => {
    if (bus === undefined || bus === audio.mix.solo) {
      audio.setSolo(null);
      console.log('Solo off');
      return;
    }
    if (!isBusName(bus)) {
      console.log(
        `soloAudio(${busList}) — call again, or with no argument, to clear`
      );
      return;
    }
    audio.setSolo(bus);
    console.log(`Solo → ${bus}`);
  };

  (window as any).holdBed = (name?: string, gain?: number) => {
    if (name === undefined || gain === undefined) {
      console.log(
        `holdBed(name, gain) — holds a looping sound at a gain; 0 fades it out.` +
          (held.size ? ` Held: ${[...held.keys()].join(', ')}` : '')
      );
      return;
    }
    if (!Number.isFinite(gain) || gain < 0) {
      console.warn(`Gain must be a number >= 0, got ${gain}`);
      return;
    }
    if (!audio.bank.has(name)) {
      console.warn(`No sound "${name}" in templates/sounds.json`);
      return;
    }
    if (audio.state !== 'running')
      console.warn(`Audio is ${audio.state} — it plays after a click`);
    else if (!audio.bank.isLoaded(name))
      console.warn(`Sound "${name}" has no loaded files yet`);

    let bed = held.get(name);
    if (!bed) {
      bed = audio.createBed({
        sounds: [name],
        bus: 'ambience',
        attack: 1,
        release: 1,
      });
      held.set(name, bed);
    }
    bed.set(gain);
    console.log(`${name} → ${gain}`);
  };

  const explainNotPlayed = (name: string) => {
    if (audio.state !== 'running')
      console.warn(`Audio is ${audio.state} — click the page first`);
    else if (!audio.bank.has(name))
      console.warn(`No sound "${name}" in templates/sounds.json`);
    else if (!audio.bank.isLoaded(name))
      console.warn(`Sound "${name}" has no loaded files yet`);
    else console.warn(`Every 3D voice is louder than "${name}" would be`);
  };

  // The console takes positions as [x, y, z] arrays, which are easier to type.
  const toVector = (v: unknown): Vector3 | null =>
    Array.isArray(v) && v.length === 3 && v.every(Number.isFinite)
      ? new Vector3(v[0], v[1], v[2])
      : null;

  (window as any).playSound = (
    name?: string,
    position?: number[] | string,
    bus: string = 'effects'
  ) => {
    if (name === undefined) {
      console.log(
        `playSound(name, [x, y, z]?, bus?) — sounds: ${audio.bank
          .names()
          .join(', ')}`
      );
      return;
    }
    if (typeof position === 'string') {
      bus = position;
      position = undefined;
    }
    if (!isBusName(bus)) {
      console.warn(`Unknown bus "${bus}". Expected one of: ${busList}`);
      return;
    }
    const at = position === undefined ? undefined : toVector(position);
    if (at === null) {
      console.warn(
        `Position must be [x, y, z], got ${JSON.stringify(position)}`
      );
      return;
    }
    if (!audio.play(name, { at, bus })) explainNotPlayed(name);
  };

  (window as any).setPanning = (model?: string) => {
    if (model !== 'HRTF' && model !== 'equalpower') {
      console.log(
        `Panning: ${audio.panningModel} — setPanning('HRTF' | 'equalpower')`
      );
      return;
    }
    audio.setPanningModel(model);
    console.log(`Panning → ${model}`);
  };

  // Relative to the listener, which is easier to aim than a world position:
  // [3, 0, 0] is 3 m to the right, [0, 0, 20] is 20 m ahead.
  const nearListener = (offset: Vector3): Vector3 => {
    const forward = audio.listenerForward;
    const up = audio.listenerUp;
    const right = new Vector3().crossVectors(forward, up);
    const at = new Vector3().copy(audio.listenerPosition);
    at.addScaledVector(right, offset.x);
    at.addScaledVector(up, offset.y);
    at.addScaledVector(forward, offset.z);
    return at;
  };

  (window as any).playSoundNear = (name?: string, offset?: number[]) => {
    const v = toVector(offset);
    if (name === undefined || !v) {
      console.log(
        'playSoundNear(name, [right, up, ahead]) — metres from the listener'
      );
      return;
    }
    const at = nearListener(v);
    if (audio.play(name, { at })) console.log(`${name} at ${vec(at)}`);
    else explainNotPlayed(name);
  };

  const addEmitter = (name: string, at: Vector3) => {
    if (!audio.bank.has(name)) {
      console.warn(`No sound "${name}" in templates/sounds.json`);
      return;
    }
    audio.createEmitter({ sound: name, at });
    console.log(
      `Emitter ${name} at ${vec(at)}. It plays while it can be heard; ` +
        'audio() shows its state.'
    );
  };

  (window as any).addEmitter = (name?: string, position?: number[]) => {
    const at = toVector(position);
    if (name === undefined || !at) {
      console.log('addEmitter(name, [x, y, z]) — a looping sound at a place');
      return;
    }
    addEmitter(name, at);
  };

  (window as any).addEmitterNear = (name?: string, offset?: number[]) => {
    const v = toVector(offset);
    if (name === undefined || !v) {
      console.log(
        'addEmitterNear(name, [right, up, ahead]) — metres from the listener'
      );
      return;
    }
    addEmitter(name, nearListener(v));
  };

  (window as any).clearEmitters = () => {
    const count = audio.emitters.length;
    while (audio.emitters.length) audio.emitters[0].dispose();
    console.log(`Removed ${count} emitter(s)`);
  };
}

function describeBank(audio: AudioEngine): string {
  const s = audio.bank.stats();
  return (
    `Sounds: ${s.sounds}, files ${s.loaded}/${s.files} loaded` +
    (s.pending ? `, ${s.pending} pending` : '') +
    (s.failed ? `, ${s.failed} failed` : '') +
    `, ${(s.bytes / (1024 * 1024)).toFixed(1)} MB decoded`
  );
}

function vec(v: Readonly<Vector3>): string {
  return `[${v.x.toFixed(1)}, ${v.y.toFixed(1)}, ${v.z.toFixed(1)}]`;
}
