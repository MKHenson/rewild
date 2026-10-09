import 'rewild-ui/compiler/jsx';
import { IPropertyValue, IResource } from 'models';
import { Typography } from 'rewild-ui';
import { Properties } from './Properties';
import { sceneGraphStore } from 'src/ui/stores/SceneGraphStore';

function selectSky(settings: {
  dayNightCycle: boolean;
  randomMoonPhase: boolean;
}): IPropertyValue[] {
  const properties = [
    { type: 'dayNightCycle', value: settings.dayNightCycle },
    { type: 'weatherState', value: 'random' },
    { type: 'randomMoonPhase', value: settings.randomMoonPhase },
    { type: 'moonPhase', value: 0.5 },
  ] as IPropertyValue[];
  const resource = {
    id: 'SKY',
    name: 'Sky',
    type: 'atmosphere',
    properties,
  } as unknown as IResource;
  sceneGraphStore.setSelectedNode({ resource } as any);
  return properties;
}

/** Connected, so the property editors inside render too. */
function createProperties(): Properties {
  const comp = (<Properties />) as Properties;
  document.body.appendChild(comp);
  return comp;
}

function labelsOf(comp: Properties): string[] {
  return (
    Array.from(comp.shadow!.querySelectorAll('x-typography')) as Typography[]
  ).map((label) => label.textContent!.trim());
}

function flip(properties: IPropertyValue[], type: string, value: boolean) {
  properties.find((p) => p.type === type)!.value = value;
  sceneGraphStore.dispatcher.dispatch({
    kind: 'nodes-updated',
    nodes: sceneGraphStore.nodes,
  });
}

describe('Properties', () => {
  afterEach(() => {
    sceneGraphStore.setSelectedNode(null);
    document.body.replaceChildren();
  });

  it('hides the starting weather while the day and weather cycle is off', () => {
    selectSky({ dayNightCycle: false, randomMoonPhase: false });
    const comp = createProperties();

    expect(labelsOf(comp)).not.toContain('Starting Weather');
  });

  it('shows the starting weather under the switch once the cycle is on', () => {
    const sky = selectSky({ dayNightCycle: false, randomMoonPhase: false });
    const comp = createProperties();

    flip(sky, 'dayNightCycle', true);

    const labels = labelsOf(comp);
    expect(labels.indexOf('Starting Weather')).toBe(
      labels.indexOf('Dynamic Day & Weather') + 1
    );
  });

  it('hides the moon phase while it is random', () => {
    selectSky({ dayNightCycle: true, randomMoonPhase: true });
    const comp = createProperties();

    expect(labelsOf(comp)).not.toContain('Moon Phase');
  });

  it('shows the moon phase under the switch once it is not random', () => {
    const sky = selectSky({ dayNightCycle: true, randomMoonPhase: true });
    const comp = createProperties();

    flip(sky, 'randomMoonPhase', false);

    const labels = labelsOf(comp);
    expect(labels.indexOf('Moon Phase')).toBe(
      labels.indexOf('Random Moon Phase') + 1
    );
  });

  it('keeps a hidden value for when its switch comes back', () => {
    const sky = selectSky({ dayNightCycle: true, randomMoonPhase: false });
    createProperties();

    flip(sky, 'randomMoonPhase', true);
    flip(sky, 'randomMoonPhase', false);

    expect(sky.find((p) => p.type === 'moonPhase')!.value).toBe(0.5);
  });
});
