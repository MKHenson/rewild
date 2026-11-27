import {
  Gauge,
  glassSurface,
  HexColor,
  Icon,
  Meter,
  UIIconName,
  UINode,
  UISurfaceFactory,
  UIStyle,
} from 'rewild-gpu-ui';

/** The plate stays dimmed while hunger is at or above this. */
export const HUD_HUNGER_CALM = 0.7;
/** The temperature gauge shows once the body is this far from normal, -1 to 1. */
export const HUD_TEMPERATURE_SHOWN = 0.05;
/** The plate's opacity while nothing needs the player's attention. */
export const HUD_CALM_OPACITY = 0.4;
/** Milliseconds the HUD takes to fade out as a menu or the assistant opens, and back in. */
const FADE = 250;
/** Milliseconds the plate takes to dim when all is well, and to brighten again. */
const CALM_FADE = 800;
const ICON_COLUMN = 16;

const GLASS: UIStyle = {
  ...glassSurface(0.45),
  flexDirection: 'column',
  borderWidth: 1,
  borderColor: 'glassEdge',
  borderRadius: 14,
  boxShadow: [
    { y: 8, blur: 24, color: '#00000040' },
    { inset: true, y: 1, color: '#ffffff14' },
  ],
};

const PLATE: UIStyle = {
  ...GLASS,
  width: 360,
  gap: 7,
  padding: [10, 14, 10, 12],
  transition: { property: 'opacity', duration: CALM_FADE },
};

interface BarSpec {
  name: string;
  icon: UIIconName;
  iconSize: number;
  height: number;
  fullColor: HexColor;
  emptyColor: HexColor;
  ticks?: number;
  danger: number;
}

const HEALTH: BarSpec = {
  name: 'health',
  icon: 'heart',
  iconSize: 16,
  height: 12,
  fullColor: '#5fd84a',
  emptyColor: '#e5352b',
  ticks: 10,
  danger: 0.25,
};
const HUNGER: BarSpec = {
  name: 'hunger',
  icon: 'utensils',
  iconSize: 13,
  height: 8,
  fullColor: '#f2a03a',
  emptyColor: '#8c3300',
  danger: 0.15,
};
const STAMINA: BarSpec = {
  name: 'stamina',
  icon: 'zap',
  iconSize: 12,
  height: 5,
  fullColor: '#73ccff',
  emptyColor: '#334d8c',
  danger: 0.15,
};
const OXYGEN: BarSpec = {
  name: 'oxygen',
  icon: 'wind',
  iconSize: 12,
  height: 5,
  fullColor: '#ebf5ff',
  emptyColor: '#8c1a73',
  danger: 0.3,
};

/** An icon and a meter in a row of the plate. */
class HudBar {
  readonly row: UINode;
  readonly meter: Meter;
  private shown = true;

  constructor(spec: BarSpec) {
    this.meter = new Meter({
      name: spec.name,
      fullColor: spec.fullColor,
      emptyColor: spec.emptyColor,
      ticks: spec.ticks,
      danger: spec.danger,
      trail: true,
      style: {
        flexGrow: 1,
        height: spec.height,
        borderRadius: spec.height / 2,
      },
    });
    const icon = new UINode({
      style: { width: ICON_COLUMN, justifyContent: 'center', alignItems: 'center' },
    });
    icon.append(new Icon({ icon: spec.icon, size: spec.iconSize, color: spec.fullColor }));
    this.row = new UINode({
      name: `${spec.name}-row`,
      style: { alignItems: 'center', gap: 10 },
    });
    this.row.append(icon, this.meter);
  }

  get visible(): boolean {
    return this.shown;
  }

  set visible(visible: boolean) {
    if (visible === this.shown) return;
    this.shown = visible;
    this.row.style.display = visible ? 'flex' : 'none';
  }
}

/**
 * The player's bars on a glass plate at the bottom of the screen, with the
 * body temperature gauge at the right. Health and hunger always show, stamina
 * and oxygen below full, and the gauge once the body is away from normal.
 * While all is well, the plate dims.
 */
export class Hud {
  readonly root: UINode;
  private plate: UINode;
  private health: HudBar;
  private hunger: HudBar;
  private stamina: HudBar;
  private oxygen: HudBar;
  private gauge: Gauge;
  private gaugePlate: UINode;
  private _temperature = 0;
  private calm: boolean | null = null;
  private warm: boolean | null = null;

  constructor(ui: UISurfaceFactory) {
    const surface = ui.createSurface({ kind: 'screen', name: 'hud', input: 'none' });
    this.health = new HudBar(HEALTH);
    this.hunger = new HudBar(HUNGER);
    this.stamina = new HudBar(STAMINA);
    this.oxygen = new HudBar(OXYGEN);

    this.plate = new UINode({ name: 'plate', style: PLATE });
    this.plate.append(this.oxygen.row, this.stamina.row, this.hunger.row, this.health.row);
    const foot = new UINode({
      name: 'bars',
      style: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 24,
        justifyContent: 'center',
      },
    });
    foot.append(this.plate);

    this.gauge = new Gauge({
      name: 'temperature',
      style: { width: 8, height: 160, borderRadius: 4 },
    });
    this.gaugePlate = new UINode({
      name: 'temperature-plate',
      style: {
        ...GLASS,
        position: 'absolute',
        right: 24,
        bottom: 24,
        alignItems: 'center',
        gap: 8,
        padding: [10, 8, 8, 8],
        opacity: 0,
        transition: { property: 'opacity', duration: FADE },
      },
    });
    this.gaugePlate.append(this.gauge, new Icon({ icon: 'thermometer', size: 14, color: 'onSurface' }));

    this.root = new UINode({
      name: 'bars-root',
      style: {
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        transition: { property: 'opacity', duration: FADE },
      },
    });
    this.root.append(foot, this.gaugePlate);
    surface.root.append(this.root);
    this.refresh();
  }

  /** From 0 to 1. */
  set healthValue(value: number) {
    this.health.meter.value = value;
  }

  /** From 0 to 1. */
  set hungerValue(value: number) {
    this.hunger.meter.value = value;
  }

  /** From 0 to 1. */
  set staminaValue(value: number) {
    this.stamina.meter.value = value;
  }

  /** From 0 to 1. */
  set oxygenValue(value: number) {
    this.oxygen.meter.value = value;
  }

  /** The body's temperature: 0 is normal, 1 really hot and -1 really cold. */
  set temperature(value: number) {
    this._temperature = value;
    this.gauge.value = 0.5 + 0.5 * Math.min(1, Math.max(-1, value));
  }

  /** Fills every bar and calms the gauge with no trail, such as on a respawn. */
  reset(): void {
    this.health.meter.snap(1);
    this.hunger.meter.snap(1);
    this.stamina.meter.snap(1);
    this.oxygen.meter.snap(1);
    this.temperature = 0;
    this.refresh();
  }

  /** Moves the trails and shows the rows that matter. Call it each frame. */
  update(seconds: number): void {
    this.health.meter.update(seconds);
    this.hunger.meter.update(seconds);
    this.stamina.meter.update(seconds);
    this.oxygen.meter.update(seconds);
    this.refresh();
  }

  private refresh(): void {
    this.stamina.visible = this.stamina.meter.value < 1;
    this.oxygen.visible = this.oxygen.meter.value < 1;

    const health = this.health.meter;
    const calm =
      health.value >= 1 &&
      health.trail >= 1 &&
      this.hunger.meter.value >= HUD_HUNGER_CALM &&
      !this.stamina.visible &&
      !this.oxygen.visible;
    if (calm !== this.calm) {
      this.calm = calm;
      this.plate.style.opacity = calm ? HUD_CALM_OPACITY : 1;
    }

    const warm = Math.abs(this._temperature) > HUD_TEMPERATURE_SHOWN;
    if (warm !== this.warm) {
      this.warm = warm;
      this.gaugePlate.style.opacity = warm ? 1 : 0;
    }
  }
}
