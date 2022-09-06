export class ImpulseDataBuffer {
  lp1X: f32;
  lp1Y: f32;
  lp1Z: f32;
  lp2X: f32;
  lp2Y: f32;
  lp2Z: f32;
  impulse: f32;

  constructor() {
    this.lp1X = NaN;
    this.lp1Y = NaN;
    this.lp1Z = NaN;
    this.lp2X = NaN;
    this.lp2Y = NaN;
    this.lp2Z = NaN;
    this.impulse = NaN;
  }
}
