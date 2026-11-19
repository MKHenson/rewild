import { Button, Label, Modal, Popup, Stack, UIStyle } from '../../lib';
import { example } from '../registry';

const part = 'Components';

example({
  part,
  name: 'Buttons',
  description:
    "The DOM's contained button in each colour, with an icon, and disabled. Hover, press, and move focus with Tab or the arrow keys. Enter clicks.",
  log: true,
  height: 160,
  build: ({ surface, log }) => {
    surface.input = 'all';
    const button = (options: ConstructorParameters<typeof Button>[0]) =>
      new Button({ ...options, onClick: () => log(`click ${options.label}`) });
    surface.root.append(
      new Stack({
        gap: 'l',
        style: { padding: 24 },
        children: [
          new Stack({
            direction: 'row',
            children: [
              button({ label: 'Primary' }),
              button({ label: 'Secondary', color: 'secondary' }),
              button({ label: 'Error', color: 'error' }),
            ],
          }),
          new Stack({
            direction: 'row',
            children: [
              button({ label: 'Settings', icon: 'settings' }),
              button({ label: 'Disabled', disabled: true }),
            ],
          }),
        ],
      })
    );
  },
});

example({
  part,
  name: 'A menu in a modal',
  description:
    'The in-game menu. Open it, then use the mouse, the keys or a gamepad. Escape, B or a click outside the panel closes it. It fades and shrinks in over 250 ms.',
  log: true,
  height: 320,
  backdrop: true,
  build: ({ surface, log, createSurface }) => {
    surface.input = 'all';
    const modal = new Modal(
      { createSurface },
      { onClose: () => log('closed') }
    );
    const item = (label: string, icon?: 'settings') =>
      new Button({
        label,
        icon,
        onClick: () => {
          log(`click ${label}`);
          modal.close();
        },
      });
    modal.append(
      new Label({
        text: 'Paused',
        style: { fontSize: 20, fontWeight: 'bold' },
      }),
      new Stack({
        gap: 'l',
        style: { padding: [16, 0, 8, 0] },
        children: [item('Resume'), item('Settings', 'settings'), item('Quit')],
      })
    );
    surface.root.append(
      new Stack({
        style: { padding: 24, alignItems: 'flex-start' },
        children: [
          new Button({
            label: 'Open menu',
            onClick: () => {
              modal.open();
              log('opened');
            },
          }),
        ],
      })
    );
  },
});

example({
  part,
  name: 'Popups',
  description:
    'A popup opens next to its button and stays on screen: the buttons at the edges open it on the other side or move it in. Focus moves into the popup and back. A click outside, Escape or B closes it.',
  log: true,
  height: 260,
  backdrop: true,
  build: ({ surface, log, createSurface }) => {
    surface.input = 'all';
    const popup = new Popup(
      { createSurface },
      { onClose: () => log('closed') }
    );
    for (const label of ['Low', 'Medium', 'High'])
      popup.append(
        new Button({
          label,
          color: 'secondary',
          onClick: () => {
            log(`click ${label}`);
            popup.close();
          },
        })
      );
    const anchor = (label: string, place: UIStyle) => {
      const button = new Button({
        label,
        style: { position: 'absolute', ...place },
        onClick: () => {
          popup.open(button.node);
          log(`opened from ${label}`);
        },
      });
      return button;
    };
    surface.root.append(
      anchor('Top left', { top: 8, left: 8 }),
      anchor('Top right', { top: 8, right: 8 }),
      anchor('Middle', { top: 110, left: '40%' }),
      anchor('Bottom left', { bottom: 8, left: 8 }),
      anchor('Bottom right', { bottom: 8, right: 8 })
    );
  },
});
