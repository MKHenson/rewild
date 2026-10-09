import { StrikeQueue } from './StrikeQueue';

let clock = 0;
const now = () => clock;

describe('StrikeQueue', () => {
  beforeEach(() => {
    clock = 0;
  });

  it('pops strikes oldest first, with their time', () => {
    const queue = new StrikeQueue(8, now);
    queue.push(1, 2, 3, 0);
    clock = 0.1;
    queue.push(4, 5, 6, 1);

    const first = queue.pop()!;
    expect([first.x, first.y, first.z, first.chain, first.time]).toEqual([
      1, 2, 3, 0, 0,
    ]);
    const second = queue.pop()!;
    expect([second.x, second.chain, second.time]).toEqual([4, 1, 0.1]);
    expect(queue.pop()).toBeNull();
  });

  it('replaces the oldest strike when full', () => {
    const queue = new StrikeQueue(3, now);
    for (let i = 0; i < 5; i++) queue.push(i, 0, 0, 0);
    expect(queue.size).toBe(3);
    expect(queue.pop()!.x).toBe(2);
    expect(queue.pop()!.x).toBe(3);
    expect(queue.pop()!.x).toBe(4);
    expect(queue.pop()).toBeNull();
  });

  it('reuses its records', () => {
    const queue = new StrikeQueue(2, now);
    queue.push(0, 0, 0, 0);
    const record = queue.pop();
    queue.push(1, 0, 0, 0);
    queue.push(2, 0, 0, 0);
    queue.push(3, 0, 0, 0);
    expect([queue.pop(), queue.pop()]).toContain(record);
  });

  it('empties on clear', () => {
    const queue = new StrikeQueue(4, now);
    queue.push(0, 0, 0, 0);
    queue.clear();
    expect(queue.size).toBe(0);
    expect(queue.pop()).toBeNull();
  });
});
