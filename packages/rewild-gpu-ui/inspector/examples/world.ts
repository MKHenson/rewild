import { Button, glassSurface, Label, UISurface } from '../../lib';
import { example } from '../registry';

const part = 'World surfaces';

/** Seconds for one full turn. */
const TURN = 12;

/** A glass panel that fills the surface, with a title, some text and a button. */
function panel(surface: UISurface, title: string, text: string): void {
  const root = surface.root;
  Object.assign(root.style, {
    ...glassSurface(),
    borderWidth: 1,
    borderColor: 'glassEdge',
    borderRadius: 14,
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    padding: 24,
  });
  root.append(
    new Label({
      text: title,
      style: { color: 'onSurface', fontSize: 28, fontWeight: 'bold' },
    }).node,
    new Label({
      text,
      style: {
        color: 'onSurfaceLight',
        fontSize: 16,
        textAlign: 'center',
        alignSelf: 'stretch',
      },
    }).node,
    new Button({ label: 'Open Portal', style: { width: 200 } }).node
  );
}

/** Turns the surface about its vertical axis, then moves it along z. */
function place(surface: UISurface, angle: number, z = 0): void {
  surface.worldMatrix.makeRotationY(angle).setPosition(0, 0, z);
}

example({
  part,
  name: 'Turning panel',
  description:
    'A glass panel of 0.6 by 0.4 m that turns once every 12 seconds. From the front it shows its UI, as on the DOM side. From behind it shows plain glass, with no text, icons or button.',
  height: 320,
  backdrop: true,
  world: { width: 0.6, height: 0.4 },
  build: ({ surface }) => {
    panel(
      surface,
      'World surface',
      'Lays out at 1,000 pixels per metre, so this panel is 600 by 400 pixels.'
    );
    return (seconds) => place(surface, ((seconds / TURN) % 1) * Math.PI * 2);
  },
});

example({
  part,
  name: 'Near and far',
  description:
    'The same panel moves from 0.3 m in front of its place to 4 m behind it and back. Text and edges stay sharp at each distance.',
  height: 320,
  backdrop: true,
  world: { width: 0.6, height: 0.4 },
  build: ({ surface }) => {
    panel(
      surface,
      'Near and far',
      'Text sizes its own pixels from the screen.'
    );
    return (seconds) => {
      const t = 0.5 - 0.5 * Math.cos((seconds / TURN) * Math.PI * 2);
      place(surface, 0.4, 0.3 - t * 4.3);
    };
  },
});
