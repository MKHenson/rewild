import { Player } from '../routing/Player';
import { STAMINA_FULL } from '../routing/utils/Stamina';
import { OXYGEN_FULL } from '../routing/utils/Oxygen';

/** Reads and sets the player's stats in a running game. */
export function registerPlayerDebugCommands() {
  const player = (name: string): Player | null => {
    const p = Player.current;
    if (!p) console.log(`${name}() — no player in a game`);
    return p;
  };

  const number = (value: unknown, min: number, max: number): number | null =>
    typeof value === 'number' && Number.isFinite(value)
      ? Math.min(max, Math.max(min, value))
      : null;

  (window as any).player = () => {
    const p = player('player');
    if (!p) return;
    const body = p.bodyTemperature;
    console.log(
      `Player: health ${p.health.toFixed(1)}, hunger ${p.hunger.toFixed(
        1
      )}, stamina ${p.stamina.value.toFixed(1)}${
        p.stamina.exhausted ? ' (exhausted)' : ''
      }, oxygen ${p.oxygen.value.toFixed(
        1
      )}, body temperature ${body.value.toFixed(2)}${
        body.held ? ' (held)' : ''
      }, wet ${body.wet.toFixed(2)}`
    );
  };

  (window as any).setHealth = (value?: number) => {
    const p = player('setHealth');
    if (!p) return;
    const v = number(value, 0, 100);
    if (v === null) {
      console.log(`setHealth(0..100) — now ${p.health.toFixed(1)}`);
      return;
    }
    p.health = v;
    console.log(`Health → ${v}`);
  };

  (window as any).setHunger = (value?: number) => {
    const p = player('setHunger');
    if (!p) return;
    const v = number(value, 0, 100);
    if (v === null) {
      console.log(`setHunger(0..100) — now ${p.hunger.toFixed(1)}`);
      return;
    }
    p.hunger = v;
    console.log(`Hunger → ${v}`);
  };

  (window as any).setStamina = (value?: number) => {
    const p = player('setStamina');
    if (!p) return;
    const v = number(value, 0, STAMINA_FULL);
    if (v === null) {
      console.log(
        `setStamina(0..${STAMINA_FULL}) — now ${p.stamina.value.toFixed(1)}`
      );
      return;
    }
    p.stamina.set(v);
    console.log(`Stamina → ${v}. It refills as normal from here.`);
  };

  (window as any).setOxygen = (value?: number) => {
    const p = player('setOxygen');
    if (!p) return;
    const v = number(value, 0, OXYGEN_FULL);
    if (v === null) {
      console.log(
        `setOxygen(0..${OXYGEN_FULL}) — now ${p.oxygen.value.toFixed(1)}`
      );
      return;
    }
    p.oxygen.value = v;
    console.log(`Oxygen → ${v}`);
  };

  (window as any).setBodyTemperature = (value?: number | 'weather') => {
    const p = player('setBodyTemperature');
    if (!p) return;
    const body = p.bodyTemperature;
    if (value === 'weather') {
      body.held = false;
      console.log('Body temperature follows the weather again');
      return;
    }
    const v = number(value, -1, 1);
    if (v === null) {
      console.log(
        `setBodyTemperature(-1..1) — 1 really hot, -1 really cold; held until setBodyTemperature('weather'). Now ${body.value.toFixed(
          2
        )}${body.held ? ' (held)' : ''}`
      );
      return;
    }
    body.value = v;
    body.held = true;
    console.log(
      `Body temperature held at ${v}. setBodyTemperature('weather') lets it go.`
    );
  };
}
