export class Layers {
  mask: u32;

  constructor() {
    this.mask = 1 | 0;
  }

  set(channel: u32): void {
    this.mask = (1 << channel) | 0;
  }

  enable(channel: u32): void {
    this.mask |= (1 << channel) | 0;
  }

  enableAll(): void {
    this.mask = 0xffffffff | 0;
  }

  toggle(channel: u32): void {
    this.mask ^= (1 << channel) | 0;
  }

  disable(channel: u32): void {
    this.mask &= ~((1 << channel) | 0);
  }

  disableAll(): void {
    this.mask = 0;
  }

  test(layers: Layers): boolean {
    return (this.mask & layers.mask) !== 0;
  }
}
