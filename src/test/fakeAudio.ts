/**
 * A minimal fake of the Web Audio API for unit tests (jsdom has none). It records the nodes
 * that were created and the sources that were started, and imitates the browser autoplay rule:
 * resume() only works once the page has seen a user gesture.
 */
export class FakeParam {
  value: number;
  calls: { method: string; value: number; time: number }[] = [];
  constructor(value = 0) {
    this.value = value;
  }
  private rec(method: string, value: number, time: number) {
    this.calls.push({ method, value, time });
    this.value = value;
    return this;
  }
  setValueAtTime(v: number, t: number) {
    return this.rec("set", v, t);
  }
  linearRampToValueAtTime(v: number, t: number) {
    return this.rec("linear", v, t);
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    if (v <= 0) throw new RangeError("exponential ramp to a non-positive value");
    return this.rec("exp", v, t);
  }
  setTargetAtTime(v: number, t: number) {
    return this.rec("target", v, t);
  }
  cancelScheduledValues() {
    return this;
  }
}

export class FakeNode {
  kind: string;
  outputs: unknown[] = [];
  constructor(kind: string) {
    this.kind = kind;
  }
  connect<T>(n: T): T {
    this.outputs.push(n);
    return n;
  }
  disconnect() {
    this.outputs = [];
  }
}

export interface StartedSource {
  kind: "osc" | "buffer";
  type?: string;
  frequency?: number;
  at: number;
}

export class FakeAudioContext {
  static initialState: AudioContextState = "running";
  /** like a browser: resume() only works once the page has had a user gesture */
  static gestureSeen = true;
  static instances: FakeAudioContext[] = [];
  static reset() {
    FakeAudioContext.initialState = "running";
    FakeAudioContext.gestureSeen = true;
    FakeAudioContext.instances = [];
  }

  state: AudioContextState;
  currentTime = 0;
  sampleRate = 8000;
  destination = new FakeNode("destination");
  onstatechange: (() => void) | null = null;
  nodes: FakeNode[] = [];
  started: StartedSource[] = [];

  constructor() {
    this.state = FakeAudioContext.initialState;
    FakeAudioContext.instances.push(this);
  }
  private setState(s: AudioContextState) {
    if (this.state === s) return;
    this.state = s;
    this.onstatechange?.();
  }
  resume() {
    if (FakeAudioContext.gestureSeen) this.setState("running");
    return Promise.resolve();
  }
  close() {
    this.setState("closed");
    return Promise.resolve();
  }
  private node<T extends object>(kind: string, extra: T): FakeNode & T {
    const n = Object.assign(new FakeNode(kind), extra);
    this.nodes.push(n);
    return n;
  }
  createOscillator() {
    const ctx = this;
    const osc = this.node("osc", {
      type: "sine" as OscillatorType,
      frequency: new FakeParam(440),
      detune: new FakeParam(0),
      start(at = 0) {
        ctx.started.push({ kind: "osc", type: osc.type, frequency: osc.frequency.value, at });
      },
      stop() {},
    });
    return osc;
  }
  createBufferSource() {
    const ctx = this;
    return this.node("buffer", {
      buffer: null as unknown,
      loop: false,
      playbackRate: new FakeParam(1),
      start(at = 0) {
        ctx.started.push({ kind: "buffer", at });
      },
      stop() {},
    });
  }
  createBuffer(channels: number, length: number, sampleRate: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { numberOfChannels: channels, length, sampleRate, getChannelData: (c: number) => data[c] };
  }
  createGain() {
    return this.node("gain", { gain: new FakeParam(1) });
  }
  createBiquadFilter() {
    return this.node("filter", { type: "lowpass", frequency: new FakeParam(350), Q: new FakeParam(1) });
  }
  createConvolver() {
    return this.node("convolver", { buffer: null as unknown, normalize: true });
  }
  createDelay() {
    return this.node("delay", { delayTime: new FakeParam(0) });
  }
  createDynamicsCompressor() {
    return this.node("compressor", {
      threshold: new FakeParam(-24),
      knee: new FakeParam(30),
      ratio: new FakeParam(12),
      attack: new FakeParam(0.003),
      release: new FakeParam(0.25),
    });
  }
}
