import type { WaterBody } from './Lakes';
import { WaterBodyRules, WaterRulesHost } from './WaterBodyRules';

const body = (id: number): WaterBody => ({
  id,
  level: 10,
  spillHeight: 10,
  typeWeights: [255, 0, 0, 0],
});

const host = {} as WaterRulesHost;

describe('WaterBodyRules.clearRecords', () => {
  it('reads the records again after a clear', async () => {
    let saved = [body(1)];
    const rules = new WaterBodyRules(host);
    rules.setProvider(async () => saved);
    await rules.resolveRecords();
    expect(rules.savedBodies().map((b) => b.id)).toEqual([1]);

    saved = [];
    rules.clearRecords();
    expect(rules.savedBodies()).toEqual([]);
    await rules.resolveRecords();
    expect(rules.savedBodies()).toEqual([]);
  });

  it('drops a lookup that was still reading when cleared', async () => {
    let finish: (bodies: WaterBody[]) => void = () => undefined;
    const rules = new WaterBodyRules(host);
    rules.setProvider(
      () => new Promise<WaterBody[]>((resolve) => (finish = resolve))
    );
    const stale = rules.resolveRecords();
    rules.clearRecords();
    finish([body(1)]);
    await stale;
    expect(rules.savedBodies()).toEqual([]);
  });
});
