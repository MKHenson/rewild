import {
  Divider,
  Field,
  InfoBox,
  Label,
  Select,
  Slider,
  Stack,
  Switch,
  Tabs,
} from '../../lib';
import { example } from '../registry';

const part = 'Form controls';

const QUALITIES = ['Low', 'Medium', 'High', 'Ultra'].map((label) => ({
  value: label.toLowerCase(),
  label,
}));

/** Ten options, so the list is taller than 256 px and scrolls. */
const SCALES = [100, 90, 80, 75, 70, 66, 60, 50, 40, 33].map((percent) => ({
  value: String(percent),
  label: `${percent}%`,
}));

/** The aspects of render quality, after the DOM settings. */
const ASPECTS: [string, string][] = [
  ['Clouds', 'The most costly part of the sky.'],
  ['Shadows', 'Sharpness of the sun shadows, and how far out they reach.'],
  ['Terrain detail', 'Surface relief on the ground.'],
  ['Water detail', 'How many ripples shade the sea and lakes.'],
  ['Draw Distance', 'How far out trees, rocks and plants draw.'],
];

example({
  part,
  name: 'Switches and sliders',
  description:
    'Click a switch, or press Enter, Space or A. Drag a slider, also off its track. The left and right arrows and the d-pad step a slider, and up and down move focus.',
  log: true,
  height: 200,
  build: ({ surface, log }) => {
    surface.input = 'all';
    const percent = new Label({ text: '50%', style: { width: 40 } });
    surface.root.append(
      new Stack({
        style: { padding: 24, width: 360 },
        children: [
          new Stack({
            direction: 'row',
            children: [
              new Switch({ onChange: (on) => log(`switch ${on}`) }),
              new Switch({ checked: true }),
              new Switch({ disabled: true }),
              new Switch({ checked: true, disabled: true }),
            ],
          }),
          new Stack({
            direction: 'row',
            style: { alignItems: 'center' },
            children: [
              new Slider({
                value: 50,
                style: { flexGrow: 1 },
                onChange: (v) => (percent.text = `${v}%`),
                onChangeComplete: (v) => log(`slider ${v}`),
              }),
              percent,
            ],
          }),
          new Slider({ value: 30, disabled: true }),
        ],
      })
    );
  },
});

example({
  part,
  name: 'Selects',
  description:
    'A click, Enter or A opens the list, with focus on the chosen option. The arrows or the d-pad move, and Enter or A picks. A click outside, Escape or B closes the list with no change. The first list has ten options, so it scrolls: use the wheel, drag its scrollbar, or move past the last option that shows.',
  log: true,
  height: 320,
  build: ({ surface, log, createSurface }) => {
    surface.input = 'all';
    const select = (value: string, disabled = false, options = QUALITIES) =>
      new Select(
        { createSurface },
        {
          options,
          value,
          disabled,
          onChange: (v) => log(`select ${v}`),
          style: { width: 200 },
        }
      );
    surface.root.append(
      new Stack({
        style: { padding: 24 },
        children: [
          select('50', false, SCALES),
          select('medium'),
          select('high'),
          select('low', true),
        ],
      })
    );
  },
});

example({
  part,
  name: 'Tabs',
  description:
    'Only the open tab takes focus. The arrows along the tabs, or the d-pad, open the next tab. The arrows across move into the panel. The second set has a disabled tab, which the arrows skip.',
  log: true,
  height: 260,
  build: ({ surface, log }) => {
    surface.input = 'all';
    const panel = (text: string) => [
      new Label({ text, style: { padding: 16 } }),
    ];
    surface.root.append(
      new Stack({
        direction: 'row',
        gap: 'xl',
        style: { padding: 16, color: 'onSurface' },
        children: [
          new Tabs({
            style: { width: 300, height: 200 },
            onChange: (i) => log(`row tab ${i}`),
            tabs: [
              { label: 'Display', children: panel('Display settings') },
              { label: 'Audio', children: panel('Audio settings') },
              { label: 'Interface', children: panel('Interface settings') },
            ],
          }),
          new Tabs({
            orientation: 'vertical',
            style: { width: 360, height: 200 },
            onChange: (i) => log(`column tab ${i}`),
            tabs: [
              { label: 'Display', children: panel('Display settings') },
              { label: 'Network', disabled: true },
              { label: 'Audio', children: panel('Audio settings') },
            ],
          }),
        ],
      })
    );
  },
});

example({
  part,
  name: 'A settings form',
  description:
    'Fields in tabs, in a glass panel, as the in-game settings will be. Use only the gamepad: the d-pad moves, A acts, and B closes a list. The Display tab and the Render Scale list scroll as focus moves, and the right stick scrolls them.',
  log: true,
  height: 460,
  backdrop: true,
  build: ({ surface, log, createSurface }) => {
    surface.input = 'all';
    const ui = { createSurface };
    const field = (
      label: string,
      control: ConstructorParameters<typeof Field>[0]['control'],
      description?: string
    ) => new Field({ label, control, description, labelWidth: 160 });
    const volume = (label: string, value: number) => {
      const percent = new Label({
        text: `${value}%`,
        style: { width: 40, textAlign: 'right' },
      });
      const row = new Stack({
        direction: 'row',
        style: { alignItems: 'center', height: 32 },
        children: [
          new Slider({
            value,
            style: { flexGrow: 1 },
            onChange: (v) => (percent.text = `${v}%`),
            onChangeComplete: (v) => log(`${label} ${v}`),
          }),
          percent,
        ],
      });
      return field(label, row);
    };
    const tabs = new Tabs({
      orientation: 'vertical',
      style: { flexGrow: 1 },
      tabs: [
        {
          label: 'Display',
          children: [
            new Stack({
              style: { padding: [0, 8, 0, 24] },
              children: [
                field(
                  'Render Quality',
                  new Select(ui, {
                    options: QUALITIES,
                    value: 'high',
                    onChange: (v) => log(`quality ${v}`),
                  }),
                  'Sets each section below at once.'
                ),
                field(
                  'Render Scale',
                  new Select(ui, {
                    options: SCALES,
                    value: '50',
                    onChange: (v) => log(`scale ${v}`),
                  }),
                  'Ten options, so the list scrolls.'
                ),
                new Divider(),
                ...ASPECTS.map(([label, description]) =>
                  field(
                    label,
                    new Select(ui, {
                      options: QUALITIES,
                      value: 'medium',
                      onChange: (v) => log(`${label} ${v}`),
                    }),
                    description
                  )
                ),
                new InfoBox({
                  text: 'Applying rebuilds the shaders, so expect a brief pause.',
                }),
              ],
            }),
          ],
        },
        {
          label: 'Audio',
          children: [
            new Stack({
              style: { padding: [0, 8, 0, 24] },
              children: [
                volume('Master', 80),
                volume('Music', 50),
                new Divider(),
                field(
                  'Mute in the background',
                  new Switch({
                    checked: true,
                    onChange: (on) => log(`mute ${on}`),
                  }),
                  'Silences the game while another window has focus.'
                ),
                new InfoBox({
                  variant: 'warning',
                  title: 'No output device',
                  text: 'The game plays no sound until a device is connected.',
                }),
              ],
            }),
          ],
        },
      ],
    });
    surface.root.append(
      new Stack({
        style: {
          margin: 16,
          padding: 16,
          flexGrow: 1,
          backdrop: 'glass',
          backgroundColor: { theme: 'surface', alpha: 0.6 },
          borderWidth: 1,
          borderColor: 'glassEdge',
          borderRadius: 14,
          color: 'onSurface',
        },
        children: [tabs],
      })
    );
  },
});

example({
  part,
  name: 'Info boxes',
  description:
    'Each variant, with and with no title. The text wraps to the box. The bar down the left edge is an inset shadow.',
  height: 340,
  build: ({ surface }) => {
    surface.root.append(
      new Stack({
        style: { padding: 24, width: 420, color: 'onSurface' },
        children: [
          new InfoBox({ text: 'Audio changes apply straight away.' }),
          new InfoBox({
            variant: 'warning',
            title: 'No output device',
            text: 'The game plays no sound until a device is connected.',
          }),
          new InfoBox({
            variant: 'error',
            title: 'Could not save',
            text: 'The settings could not be written. Check the free space on the disk, then try again. Long text wraps to the width of the box.',
          }),
        ],
      })
    );
  },
});
