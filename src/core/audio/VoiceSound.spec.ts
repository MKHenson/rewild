import { readFileSync } from 'fs';
import { AudioEngine } from 'rewild-audio';
import {
  FakeAudioContext,
  FakeBiquadFilterNode,
  FakeGainNode,
  installFakeAudioContext,
} from 'rewild-audio/lib/testing/FakeAudioContext';
import {
  EFFORT_BEND,
  EFFORT_FALL,
  GASP_BIG_AT,
  GASP_FROM,
  GASP_MEDIUM_AT,
  PAIN_GAP,
  STRAIN_BELOW,
  STRAIN_EVERY,
  SWIM_BREATH_DELAY,
  VoiceDef,
  VoiceInput,
  VoicePriority,
  VoiceSound,
  easeEffort,
  gaspSound,
  painSound,
  recoveryEffort,
  staminaEffort,
} from './VoiceSound';
import { UNDER_WATER_CUTOFF, UNDER_WATER_LEVEL } from './UnderWaterSound';

const VOICE: VoiceDef = JSON.parse(
  readFileSync('templates/voice.json', 'utf8')
);

const NAMES = [
  'breath-calm',
  'breath-hard',
  'breath-pant',
  'breath-heat',
  'breath-pained',
  'heartbeat',
  'voice-shiver',
  'stomach-growl',
  'pain-small',
  'pain-medium',
  'pain-big',
  'gasp-small',
  'gasp-medium',
  'gasp-big',
  'breath-strain',
  'breath-swim',
  'swim-bubbles',
  'death',
];
/** Seconds each test file lasts. */
const CLIP = 2;
// Each file decodes to a buffer whose length says which sound it is.
const LENGTHS: Record<string, number> = Object.fromEntries(
  NAMES.map((name, i) => [name, CLIP * 48000 + i])
);

const manifest = {
  sounds: NAMES.map((name) => ({ name, files: [name], source: 'test' })),
};

const frame = 1 / 60;

let restore: () => void;
let engine: AudioEngine;
let voice: VoiceSound;
let input: VoiceInput;

function sources(name: string) {
  const ctx = engine.context as unknown as FakeAudioContext;
  return ctx.sources.filter(
    (s) => s.buffer?.length === LENGTHS[name] && s.startedAt !== null
  );
}

function played(name: string): number {
  return sources(name).filter((s) => !s.loop).length;
}

function gain(layer: string): number {
  const rules = voice.rules;
  let sum = 0;
  rules.slotIds.forEach((id, i) => {
    if (id === layer) sum += rules.gains[i];
  });
  return sum;
}

/** The gain the bed playing `sound` was last set to. */
function bedGain(sound: string): number {
  const bed = [...engine.beds].find((b) => b.spec.sounds[0] === sound);
  return bed ? bed.gain : 0;
}

function run(seconds: number, stroked = false): void {
  for (let t = 0; t < seconds; t += frame) voice.update(input, stroked, frame);
}

beforeEach(async () => {
  restore = installFakeAudioContext();
  engine = new AudioEngine(
    undefined,
    async (url) => new ArrayBuffer(LENGTHS[url])
  );
  engine.bank.random = () => 0.5;
  await engine.start();
  await engine.loadSounds(manifest);
  voice = new VoiceSound(VOICE, engine.createScope());
  voice.random = () => 0.5;
  input = {
    swimming: false,
    cameraUnderWater: false,
    oxygen: 1,
    stamina: 1,
    bodyTemperature: 0,
    health: 100,
    hunger: 100,
  };
});

afterEach(() => {
  voice.dispose();
  restore();
});

describe('body values', () => {
  it('bends effort from the stamina spent, always full when empty', () => {
    expect(staminaEffort(0, 1.5)).toBe(0);
    expect(staminaEffort(1, 0.7)).toBe(1);
    expect(staminaEffort(0.5, 1)).toBe(0.5);
    expect(staminaEffort(0.5, EFFORT_BEND)).toBeLessThan(0.5);
    expect(staminaEffort(0.5, 1 / EFFORT_BEND)).toBeGreaterThan(0.5);
  });

  it('eases effort up faster than it settles', () => {
    const up = easeEffort(0, 1, 2);
    const down = 1 - easeEffort(1, 0, 2);
    expect(up).toBeGreaterThan(down);
    expect(easeEffort(1, 0, EFFORT_FALL)).toBeCloseTo(Math.exp(-1), 5);
  });

  it('sizes the grunt by the damage and the gasp by the breath used', () => {
    expect(painSound(2)).toBeNull();
    expect(painSound(8)).toBe('pain-small');
    expect(painSound(25)).toBe('pain-medium');
    expect(painSound(60)).toBe('pain-big');
    expect(gaspSound(GASP_FROM / 2)).toBeNull();
    expect(gaspSound(0.1)).toBe('gasp-small');
    expect(gaspSound(GASP_MEDIUM_AT)).toBe('gasp-medium');
    expect(gaspSound(GASP_BIG_AT)).toBe('gasp-big');
    expect(gaspSound(1)).toBe('gasp-big');
    expect(recoveryEffort(1)).toBe(1);
    expect(recoveryEffort(0.2)).toBe(0.2);
  });
});

describe('VoiceSound', () => {
  it('breathes harder as stamina is spent, then settles as it refills', () => {
    run(1);
    expect(gain('calm')).toBeGreaterThan(0);
    expect(gain('pant')).toBe(0);

    input.stamina = 0.85;
    run(3);
    expect(voice.effort).toBeCloseTo(0.15, 2);
    expect(gain('pant')).toBe(0);

    input.stamina = 0;
    run(3);
    expect(voice.effort).toBeGreaterThan(0.95);
    expect(gain('pant')).toBeGreaterThan(0.5);
    expect(gain('hard')).toBe(0);
    expect(gain('calm')).toBe(0);

    input.stamina = 1;
    run(30);
    expect(voice.effort).toBeLessThan(0.1);
    expect(gain('pant')).toBe(0);
    expect(gain('calm')).toBeGreaterThan(0);
  });

  it('bends each bout of effort its own way, once recovered', () => {
    voice.random = () => 1;
    run(1);
    expect(voice.effortBend).toBeCloseTo(EFFORT_BEND, 6);

    input.stamina = 0.5;
    voice.random = () => 0;
    run(3);
    expect(voice.effortBend).toBeCloseTo(EFFORT_BEND, 6);
    expect(voice.effort).toBeCloseTo(Math.pow(0.5, EFFORT_BEND), 2);

    input.stamina = 1;
    run(30);
    expect(voice.effortBend).toBeCloseTo(1 / EFFORT_BEND, 6);
  });

  it('breathes with each stroke at the surface instead of the loops', () => {
    input.swimming = true;
    run(1);
    expect(gain('calm') + gain('hard') + gain('pant')).toBe(0);
    voice.update(input, true, frame);
    expect(played('breath-swim')).toBe(1);
    const breath = sources('breath-swim')[0];
    const ctx = engine.context as unknown as FakeAudioContext;
    expect(breath.startedAt).toBeCloseTo(
      ctx.currentTime + SWIM_BREATH_DELAY,
      6
    );
  });

  it('muffles and quietens the voice with the head under water', () => {
    run(1);
    input.health -= 10;
    run(frame);
    expect(sources('pain-small')[0].outputs[0]).not.toBeInstanceOf(
      FakeBiquadFilterNode
    );

    run(PAIN_GAP);
    input.cameraUnderWater = true;
    input.health -= 10;
    run(frame);
    const filter = sources('pain-small')[1].outputs[0] as FakeBiquadFilterNode;
    expect(filter).toBeInstanceOf(FakeBiquadFilterNode);
    expect(filter.frequency.value).toBe(UNDER_WATER_CUTOFF);
    const amp = filter.outputs[0] as FakeGainNode;
    expect(amp.gain.value).toBeCloseTo(UNDER_WATER_LEVEL, 6);

    input.oxygen = STRAIN_BELOW;
    run(CLIP);
    const strain = sources('breath-strain')[0]
      .outputs[0] as FakeBiquadFilterNode;
    expect(strain.frequency.value).toBe(UNDER_WATER_CUTOFF);
  });

  it('grunts sized to the damage, and not for a slow drain', () => {
    run(1);
    for (let i = 0; i < 300; i++) {
      input.health -= 1.7 * frame;
      voice.update(input, false, frame);
    }
    expect(played('pain-small') + played('pain-medium')).toBe(0);

    input.health -= 25;
    run(frame);
    expect(played('pain-medium')).toBe(1);
    expect(voice.hurt).toBeGreaterThan(0.4);

    run(PAIN_GAP / 2);
    input.health -= 10;
    run(frame);
    expect(played('pain-small')).toBe(0);
    run(PAIN_GAP);
    input.health -= 10;
    run(frame);
    expect(played('pain-small')).toBe(1);
  });

  it('strains as the breath runs low under water', () => {
    input.swimming = true;
    input.cameraUnderWater = true;
    input.oxygen = STRAIN_BELOW + 0.05;
    run(5);
    expect(played('breath-strain')).toBe(0);
    input.oxygen = STRAIN_BELOW;
    run(frame);
    expect(played('breath-strain')).toBe(1);
    expect(played('swim-bubbles')).toBe(1);
    run(STRAIN_EVERY);
    expect(played('breath-strain')).toBe(2);
    expect(gain('calm') + gain('hard') + gain('pant')).toBe(0);
  });

  it('gasps on coming up, sized by the breath used', () => {
    const surface = (oxygen: number) => {
      input.cameraUnderWater = true;
      input.oxygen = oxygen;
      run(1);
      input.cameraUnderWater = false;
      run(frame);
      run(CLIP);
    };
    surface(0.9);
    expect(played('gasp-small')).toBe(1);
    surface(0.5);
    expect(played('gasp-medium')).toBe(1);
    surface(0.2);
    expect(played('gasp-big')).toBe(1);
    input.cameraUnderWater = true;
    input.oxygen = 0;
    run(1);
    input.cameraUnderWater = false;
    run(frame);
    expect(played('gasp-big')).toBe(2);
    expect(voice.breathHeld).toBe(0);
    expect(voice.effort).toBeGreaterThan(0.95);
  });

  it('does not gasp when hardly any breath was used', () => {
    input.cameraUnderWater = true;
    input.oxygen = 1 - GASP_FROM / 2;
    run(1);
    input.cameraUnderWater = false;
    run(frame);
    expect(played('gasp-small')).toBe(0);
  });

  it('says one thing at a time, a higher one cutting off a lower one', () => {
    run(1);
    input.health -= 50;
    run(frame);
    const pain = sources('pain-big')[0];
    expect(voice.speaking).toBe(VoicePriority.Pain);

    voice.update(input, true, frame);
    expect(played('breath-swim')).toBe(0);

    input.cameraUnderWater = true;
    input.oxygen = 0.1;
    run(frame);
    input.cameraUnderWater = false;
    run(frame);
    expect(played('gasp-big')).toBe(1);
    expect(pain.stopped).toBe(true);
    expect(voice.speaking).toBe(VoicePriority.Gasp);
    expect(sources('gasp-big')[0].stopped).toBe(false);
  });

  it('keeps the mouth busy for the length of the file played', () => {
    run(1);
    input.health -= 10;
    run(frame);
    expect(voice.speaking).toBe(VoicePriority.Pain);
    run(CLIP - 0.1);
    voice.update(input, true, frame);
    expect(played('breath-swim')).toBe(0);
    run(0.2);
    expect(voice.speaking).toBe(-1);
    voice.update(input, true, frame);
    expect(played('breath-swim')).toBe(1);
  });

  it('pants when the body is hot and shivers when it is cold', () => {
    input.bodyTemperature = 0.8;
    run(1);
    expect(voice.heat).toBe(0.8);
    expect(voice.cold).toBe(0);
    expect(gain('heat')).toBeGreaterThan(0);

    input.bodyTemperature = -0.8;
    run(20);
    expect(voice.cold).toBe(0.8);
    expect(gain('heat')).toBe(0);
    expect(played('voice-shiver')).toBeGreaterThan(0);
  });

  it('brings in the heartbeat and pained breath at low health', () => {
    run(1);
    expect(gain('heartbeat')).toBe(0);
    input.health = 12;
    run(PAIN_GAP * 2);
    expect(gain('heartbeat')).toBeGreaterThan(0.5);
    expect(gain('pained')).toBeGreaterThan(0.5);
    input.health = 5;
    run(1);
    expect(gain('heartbeat')).toBe(1);
  });

  it('growls now and then when hungry', () => {
    run(60);
    expect(played('stomach-growl')).toBe(0);
    input.hunger = 5;
    run(60);
    expect(played('stomach-growl')).toBeGreaterThan(0);
  });

  it('pants in the heat in bouts, swelling in and fading away', () => {
    input.bodyTemperature = 0.9;
    const level: number[] = [];
    for (let t = 0; t < 120; t += 0.5) {
      run(0.5);
      level.push(bedGain('breath-heat'));
    }
    const max = Math.max(...level);
    expect(max).toBeGreaterThan(0.4);
    expect(level.filter((g) => g < 0.05).length).toBeGreaterThan(
      level.length / 3
    );
    expect(level.filter((g) => g > max * 0.9).length).toBeGreaterThan(4);
  });

  it('throws on a bout that names no loop', () => {
    expect(
      () =>
        new VoiceSound(
          { ...VOICE, bouts: { growl: { on: [1, 2], off: [1, 2] } } },
          engine.createScope()
        )
    ).toThrow(/growl/);
  });

  it('throws on an every that names no layer', () => {
    expect(
      () =>
        new VoiceSound(
          { ...VOICE, every: { nope: [1, 2] } },
          engine.createScope()
        )
    ).toThrow(/nope/);
  });

  it('dies over whatever it is saying, and stops breathing', () => {
    run(1);
    input.health -= 60;
    run(frame);
    const cry = sources('pain-big')[0];
    const before = [...engine.beds].length;
    voice.die(0.5, 0);
    expect(cry.stopped).toBe(true);
    expect(played('death')).toBe(1);
    expect(voice.speaking).toBe(VoicePriority.Death);
    expect([...engine.beds].length).toBeLessThan(before);

    input.health = 100;
    run(frame);
    input.health -= 60;
    run(frame);
    expect(played('pain-big')).toBe(1);
  });

  it('owns nothing for the console once disposed', () => {
    VoiceSound.current = voice;
    voice.dispose();
    expect(VoiceSound.current).toBeNull();
  });
});
