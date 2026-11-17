import { Meter, UINode } from '../../lib';
import { example } from '../registry';

const part = 'Meters';

example({
  part,
  name: 'Values and colours',
  description:
    'Meters at 1, 0.6, 0.3 and 0, with their own colours. A meter pulses more as it drains. They draw with the meter effect, so the DOM side shows only their boxes.',
  build: ({ surface }) => {
    const column = new UINode({
      style: {
        flexDirection: 'column',
        gap: 12,
        padding: 16,
        width: '100%',
      },
    });
    const meters = [
      new Meter({ value: 1, style: { height: 24, borderRadius: 20 } }),
      new Meter({
        value: 0.6,
        fullColor: '#f2991a',
        emptyColor: '#8c3300',
        style: { height: 16, borderRadius: 12 },
      }),
      new Meter({
        value: 0.3,
        fullColor: '#73ccff',
        emptyColor: '#334d8c',
        style: { height: 8, borderRadius: 8 },
      }),
      new Meter({
        value: 0,
        fullColor: '#ebf5ff',
        emptyColor: '#8c1a73',
        style: { height: 8, borderRadius: 8 },
      }),
    ];
    column.append(...meters);
    surface.root.append(column);
    // Redraws each frame so the pulse shows.
    return () => {};
  },
});

example({
  part,
  name: 'Draining',
  description:
    'A meter that drains and fills again. Only its params change, so the stream is not rebuilt.',
  height: 80,
  build: ({ surface }) => {
    const meter = new Meter({
      style: {
        position: 'absolute',
        left: '10%',
        width: '80%',
        top: 28,
        height: 24,
        borderRadius: 20,
      },
    });
    surface.root.append(meter);
    return (seconds) => {
      meter.value = 0.5 + 0.5 * Math.cos(seconds * 0.8);
    };
  },
});
