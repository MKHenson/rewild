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
        `\n${describeBank(audio)}`
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

  (window as any).playSound = (name?: string, bus: string = 'effects') => {
    if (name === undefined) {
      console.log(
        `playSound(name, bus?) — sounds: ${audio.bank.names().join(', ')}`
      );
      return;
    }
    if (!isBusName(bus)) {
      console.warn(`Unknown bus "${bus}". Expected one of: ${busList}`);
      return;
    }
    if (audio.play(name, bus)) return;

    if (audio.state !== 'running')
      console.warn(`Audio is ${audio.state} — click the page first`);
    else if (!audio.bank.has(name))
      console.warn(`No sound "${name}" in templates/sounds.json`);
    else console.warn(`Sound "${name}" has no loaded files yet`);
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
