export interface ParamTarget {
  value: number;
  time: number;
  timeConstant: number;
}

export class FakeAudioParam {
  value: number;
  readonly targets: ParamTarget[] = [];

  constructor(value: number) {
    this.value = value;
  }

  setTargetAtTime(value: number, time: number, timeConstant: number) {
    this.targets.push({ value, time, timeConstant });
    return this;
  }

  get lastTarget(): ParamTarget | undefined {
    return this.targets[this.targets.length - 1];
  }
}

export class FakeAudioNode {
  readonly outputs: FakeAudioNode[] = [];

  constructor(readonly kind: string) {}

  connect<T extends FakeAudioNode>(destination: T): T {
    this.outputs.push(destination);
    return destination;
  }

  disconnect() {
    this.outputs.length = 0;
  }
}

export class FakeGainNode extends FakeAudioNode {
  readonly gain = new FakeAudioParam(1);

  constructor() {
    super('gain');
  }
}

export class FakeBiquadFilterNode extends FakeAudioNode {
  type: BiquadFilterType = 'lowpass';
  readonly frequency = new FakeAudioParam(350);

  constructor() {
    super('biquad');
  }
}

export class FakeDynamicsCompressorNode extends FakeAudioNode {
  readonly threshold = new FakeAudioParam(-24);
  readonly knee = new FakeAudioParam(30);
  readonly ratio = new FakeAudioParam(12);
  readonly attack = new FakeAudioParam(0.003);
  readonly release = new FakeAudioParam(0.25);

  constructor() {
    super('compressor');
  }
}

export class FakeAudioBufferSourceNode extends FakeAudioNode {
  buffer: AudioBuffer | null = null;
  loop = false;
  readonly playbackRate = new FakeAudioParam(1);
  onended: (() => void) | null = null;
  startedAt: number | null = null;

  constructor() {
    super('bufferSource');
  }

  start(when: number = 0) {
    this.startedAt = when;
  }

  /** Ends playback, as the audio thread would when the buffer runs out. */
  end() {
    this.onended?.();
  }
}

/** A decoded buffer with one sample per input byte, so tests can size files by byte length. */
export function fakeAudioBuffer(
  length: number,
  channels: number = 1
): AudioBuffer {
  return {
    length,
    numberOfChannels: channels,
    sampleRate: 48000,
    duration: length / 48000,
  } as AudioBuffer;
}

/** Records the graph and parameter changes an engine makes, for jest, which has no Web Audio. */
export class FakeAudioContext {
  static initialState: AudioContextState = 'running';
  /** While true, `resume()` stays pending, as when the browser rejects a gesture. */
  static blocked = false;
  static readonly instances: FakeAudioContext[] = [];

  state: AudioContextState = FakeAudioContext.initialState;
  currentTime = 0;
  readonly sampleRate = 48000;
  readonly baseLatency = 0.01;
  readonly destination = new FakeAudioNode('destination');
  readonly calls = { resume: 0, suspend: 0, close: 0, decode: 0 };
  readonly sources: FakeAudioBufferSourceNode[] = [];

  constructor(readonly options?: AudioContextOptions) {
    FakeAudioContext.instances.push(this);
  }

  createGain() {
    return new FakeGainNode();
  }

  createBiquadFilter() {
    return new FakeBiquadFilterNode();
  }

  createDynamicsCompressor() {
    return new FakeDynamicsCompressorNode();
  }

  createBufferSource() {
    const source = new FakeAudioBufferSourceNode();
    this.sources.push(source);
    return source;
  }

  /** Fails on an empty buffer, as a real context fails on data it cannot read. */
  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer> {
    this.calls.decode++;
    if (data.byteLength === 0)
      return Promise.reject(new Error('Unable to decode audio data'));
    return Promise.resolve(fakeAudioBuffer(data.byteLength));
  }

  resume(): Promise<void> {
    this.calls.resume++;
    if (FakeAudioContext.blocked) return new Promise<void>(() => {});
    this.state = 'running';
    return Promise.resolve();
  }

  async suspend() {
    this.calls.suspend++;
    this.state = 'suspended';
  }

  async close() {
    this.calls.close++;
    this.state = 'closed';
  }
}

/** Puts FakeAudioContext on the global scope. Call the returned function to restore it. */
export function installFakeAudioContext(): () => void {
  const g = globalThis as any;
  const previous = g.AudioContext;
  g.AudioContext = FakeAudioContext;
  FakeAudioContext.instances.length = 0;
  FakeAudioContext.initialState = 'running';
  FakeAudioContext.blocked = false;
  return () => {
    g.AudioContext = previous;
  };
}
