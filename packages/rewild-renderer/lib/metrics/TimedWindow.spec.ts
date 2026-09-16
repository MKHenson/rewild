import { TimedWindow } from './TimedWindow';

describe('TimedWindow', () => {
  it('is empty before anything is pushed', () => {
    const window = new TimedWindow(1000);
    expect(window.count).toBe(0);
    expect(window.avg).toBe(0);
    expect(window.max).toBe(0);
    expect(window.last).toBe(0);
  });

  it('averages what it holds', () => {
    const window = new TimedWindow(1000);
    window.push(2, 0);
    window.push(4, 10);

    expect(window.avg).toBe(3);
    expect(window.last).toBe(4);
    expect(window.count).toBe(2);
  });

  it('drops samples once they age past the window', () => {
    const window = new TimedWindow(1000);
    window.push(100, 0);
    window.push(1, 900);
    expect(window.count).toBe(2);

    // 1500 leaves the 0ms sample outside a 1000ms window.
    window.push(1, 1500);
    expect(window.count).toBe(2);
    expect(window.avg).toBe(1);
    expect(window.max).toBe(1);
  });

  it('keeps a spike visible while it is still inside the window', () => {
    const window = new TimedWindow(1000);
    [1, 9, 1, 1].forEach((v, i) => window.push(v, i * 10));

    expect(window.avg).toBe(3);
    expect(window.max).toBe(9);
  });

  it('prunes on demand, without a push', () => {
    const window = new TimedWindow(1000);
    window.push(5, 0);
    window.prune(2000);

    expect(window.count).toBe(0);
    expect(window.avg).toBe(0);
  });

  it('overwrites the oldest sample once capacity is reached', () => {
    const window = new TimedWindow(10_000, 3);
    [1, 2, 3, 4].forEach((v, i) => window.push(v, i));

    expect(window.count).toBe(3);
    expect(window.avg).toBe(3);
    expect(window.last).toBe(4);
  });

  it('empties on reset', () => {
    const window = new TimedWindow(1000);
    window.push(5, 0);
    window.reset();

    expect(window.count).toBe(0);
    expect(window.avg).toBe(0);
  });
});
