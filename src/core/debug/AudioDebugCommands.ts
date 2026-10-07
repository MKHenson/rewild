import { AudioEngine, BUS_NAMES, isBusName } from 'rewild-audio';

export function registerAudioDebugCommands(audio: AudioEngine) {
  const busList = BUS_NAMES.join(' | ');

  (window as any).audio = () => {
    const ctx = audio.context;
    console.log(
      `Audio: ${audio.state}` +
        (ctx
          ? `, ${ctx.sampleRate} Hz, latency ${(ctx.baseLatency * 1000).toFixed(
              1
            )} ms`
          : ' — starts from the Start button') +
        `\nWorld: muffle ${Math.round(
          audio.muffleCutoff
        )} Hz at ${audio.muffleLevel.toFixed(2)}` +
        `, ${audio.ducked ? 'ducked' : 'not ducked'}` +
        (audio.mix.solo ? `\nSolo: ${audio.mix.solo}` : '')
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
}
