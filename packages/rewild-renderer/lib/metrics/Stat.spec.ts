import { Stat } from './Stat';

describe('Stat', () => {
  it('is empty before anything is pushed', () => {
    const stat = new Stat(4);
    expect(stat.count).toBe(0);
    expect(stat.avg).toBe(0);
    expect(stat.max).toBe(0);
    expect(stat.last).toBe(0);
  });

  it('averages what it holds', () => {
    const stat = new Stat(4);
    stat.push(2);
    stat.push(4);
    expect(stat.avg).toBe(3);
    expect(stat.last).toBe(4);
    expect(stat.count).toBe(2);
  });

  it('forgets samples that fall out of the window', () => {
    const stat = new Stat(3);
    [100, 1, 1, 1].forEach((v) => stat.push(v));

    expect(stat.count).toBe(3);
    expect(stat.avg).toBe(1);
    expect(stat.max).toBe(1);
  });

  it('keeps a spike visible while it is still in the window', () => {
    const stat = new Stat(4);
    [1, 9, 1, 1].forEach((v) => stat.push(v));

    expect(stat.avg).toBe(3);
    expect(stat.max).toBe(9);
  });

  it('empties on reset', () => {
    const stat = new Stat(4);
    stat.push(5);
    stat.reset();
    expect(stat.count).toBe(0);
    expect(stat.avg).toBe(0);
  });
});
