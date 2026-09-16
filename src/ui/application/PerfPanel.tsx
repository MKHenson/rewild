import { Component, register } from 'rewild-ui';
import { MetricView } from 'rewild-renderer/lib/metrics/MetricsRegistry';
import { getActiveRenderer } from 'src/ui/utils/getActiveRenderer';

interface Props {}

/** Section order in the panel. Groups absent from a snapshot are skipped. */
const GROUP_ORDER = [
  'frame',
  'gpu/scene',
  'gpu/sky',
  'gpu/post',
  'cpu',
  'counts',
];

const GROUP_LABELS: Record<string, string> = {
  frame: 'frame',
  'gpu/scene': 'gpu · scene',
  'gpu/sky': 'gpu · sky',
  'gpu/post': 'gpu · post',
  cpu: 'cpu · render()',
  counts: 'counts',
};

const ms = (value: number) => value.toFixed(2);

/** Below this many frames in the window, every mean is a reading of a handful
 *  of frames and the panel says so rather than pretending otherwise. */
const MIN_FRAMES = 10;

/** Slowest refresh interval worth calling a vsync cap: 30Hz plus slack. */
const SLOWEST_VSYNC_MS = 36;

/** Frame time past which unaccounted time is a stall, not a cap. */
const STALL_MS = 50;

/**
 * Performance overlay, toggled with the backquote key.
 *
 * Reads MetricsRegistry and nothing else, so adding a number to the panel means
 * publishing it from the renderer rather than editing this file. The registry
 * is switched on only while the panel is open, so a closed panel costs nothing.
 */
@register('x-perf-panel')
export class PerfPanel extends Component<Props> {
  init() {
    let open = false;
    let frameHandle = 0;
    let rowCount = -1;
    let copyResetHandle = 0;
    const cells = new Map<string, HTMLElement>();

    // Last painted state, kept so the copy button reports exactly what is on
    // screen rather than re-reading a window that has moved on.
    let lastViews: MetricView[] = [];
    const lastSubtotals = new Map<string, number>();
    let lastVerdict = '';

    const verdictElm = (
      <div class="verdict">waiting for frames</div>
    ) as HTMLElement;
    const bodyElm = (<div class="body" />) as HTMLElement;
    const copyElm = (<button class="copy">copy</button>) as HTMLButtonElement;
    const root = (
      <div class="panel">
        <div class="titlebar">
          <span class="title">performance</span>
          <span class="hint">` close · c copy</span>
          {copyElm}
        </div>
        {verdictElm}
        {bodyElm}
      </div>
    ) as HTMLElement;
    root.hidden = true;

    /**
     * Rebuild the rows.
     *
     * Runs only when the set of metrics changes, which is a handful of times
     * while each subsystem reports for the first time and then never again.
     * Per-frame updates go through `cells` and touch nothing but `textContent`.
     */
    const buildRows = (views: MetricView[]) => {
      cells.clear();
      bodyElm.textContent = '';

      const groups = new Map<string, MetricView[]>();
      for (const view of views) {
        const bucket = groups.get(view.group);
        if (bucket) bucket.push(view);
        else groups.set(view.group, [view]);
      }

      for (const group of GROUP_ORDER) {
        const views = groups.get(group);
        if (!views || views.length === 0) continue;

        const subtotal = (<span class="subtotal" />) as HTMLElement;
        const header = (
          <div class="group">
            <span>{GROUP_LABELS[group] ?? group}</span>
            {subtotal}
          </div>
        ) as HTMLElement;
        bodyElm.appendChild(header);
        if (group !== 'counts') cells.set(`group:${group}`, subtotal);

        for (const view of views) {
          const value = (<span class="value" />) as HTMLElement;
          const detail = (<span class="detail" />) as HTMLElement;
          bodyElm.appendChild(
            (
              <div class="row">
                <span class="label">{view.label}</span>
                {value}
                {detail}
              </div>
            ) as HTMLElement
          );
          cells.set(view.key, value);
          cells.set(`${view.key}:detail`, detail);
        }
      }
    };

    const paint = () => {
      const renderer = getActiveRenderer();
      if (!renderer) {
        verdictElm.textContent = 'no renderer on this screen';
        verdictElm.className = 'verdict idle';
        bodyElm.textContent = '';
        rowCount = -1;
        lastViews = [];
        lastVerdict = '';
        return;
      }

      renderer.metrics.enabled = true;

      if (renderer.metrics.settling) {
        verdictElm.textContent = 'settling — discarding rebuild frames';
        verdictElm.className = 'verdict idle';
        return;
      }

      const views = renderer.metrics.snapshot();

      lastViews = views;

      // Metrics are only ever added to a snapshot, never removed: one appears
      // once it has a sample, and a window only empties on reset. So the count
      // alone says whether the rows still match, and it costs an integer
      // compare rather than a key string built every frame.
      if (views.length !== rowCount) {
        rowCount = views.length;
        buildRows(views);
      }

      lastSubtotals.clear();
      let wall = 0;
      let cpu = 0;

      for (const view of views) {
        const cell = cells.get(view.key);
        const detail = cells.get(`${view.key}:detail`);
        if (!cell || !detail) continue;

        if (view.kind === 'count') {
          cell.textContent = Math.round(view.perRun).toString();
          detail.textContent = '';
          continue;
        }

        cell.textContent = `${ms(view.perFrame)} ms`;

        // A pass that runs 1 frame in N costs perRun when it runs and perFrame
        // on average. Both are shown, because the spike is what you feel and
        // the average is what you budget.
        detail.textContent =
          view.duty < 0.95
            ? `${ms(view.perRun)} @ 1/${(
                1 / Math.max(view.duty, 0.001)
              ).toFixed(1)}`
            : `max ${ms(view.max)}`;

        lastSubtotals.set(
          view.group,
          (lastSubtotals.get(view.group) ?? 0) + view.perFrame
        );
        if (view.key === 'frame.wall') wall = view.perFrame;
        else if (view.key === 'frame.cpu') cpu = view.perFrame;
      }

      let gpuTotal = 0;
      for (const [group, subtotal] of lastSubtotals) {
        const subtotalCell = cells.get(`group:${group}`);
        if (subtotalCell && group !== 'frame') {
          subtotalCell.textContent = `${ms(subtotal)} ms`;
        }
        if (group.startsWith('gpu/')) gpuTotal += subtotal;
      }

      paintVerdict(wall, cpu, gpuTotal, renderer.metrics.frameCount);
    };

    const paintVerdict = (
      wall: number,
      cpu: number,
      gpu: number,
      frames: number
    ) => {
      if (wall <= 0) {
        verdictElm.textContent = 'waiting for frames';
        verdictElm.className = 'verdict idle';
        return;
      }

      const fps = 1000 / wall;
      // CPU and GPU overlap, so the larger of the two is the floor the frame
      // could reach. Anything beyond it is time neither of them accounts for.
      const accounted = Math.max(cpu, gpu);
      const unaccounted = wall - accounted;

      let reading: string;
      let tone: string;

      if (frames < MIN_FRAMES) {
        reading = `only ${frames} frames in the window, too few to read`;
        tone = 'idle';
      } else if (gpu <= 0) {
        reading = 'no gpu timings (timestamp-query unavailable)';
        tone = 'idle';
      } else if (wall > STALL_MS && unaccounted > wall * 0.5) {
        // Neither side is busy and the frame is far too long for a refresh
        // interval. Something outside the render path is blocking: a shader
        // compile, an asset or impostor bake, a long GC.
        reading = 'stalled outside the render path';
        tone = 'warn';
      } else if (wall <= SLOWEST_VSYNC_MS && accounted < wall * 0.8) {
        reading = 'vsync capped, headroom on both';
        tone = 'good';
      } else if (gpu > cpu * 1.2) {
        reading = 'gpu bound';
        tone = 'warn';
      } else if (cpu > gpu * 1.2) {
        reading = 'cpu bound';
        tone = 'warn';
      } else {
        reading = 'balanced';
        tone = 'good';
      }

      lastVerdict =
        `${fps.toFixed(0)} fps · ${ms(wall)} ms frame · ` +
        `cpu ${ms(cpu)} ms · gpu ${ms(gpu)} ms · ${reading}`;
      verdictElm.textContent = lastVerdict;
      verdictElm.className = `verdict ${tone}`;
    };

    /**
     * The panel as plain text, for pasting into a bug report or at an LLM.
     *
     * The trailing note is not decoration. Without it a reader has no way to
     * tell an amortised figure from a per-run one, which is the single easiest
     * mistake to make with these numbers.
     */
    const buildReport = (): string => {
      const renderer = getActiveRenderer();
      const lines: string[] = [];

      lines.push(`rewild perf capture · ${new Date().toISOString()}`);
      if (renderer) {
        const quality = renderer.quality;
        const pins = Object.entries(quality.overrides)
          .map(([aspect, tier]) => `${aspect}=${tier}`)
          .join(' ');
        lines.push(
          `canvas ${renderer.canvas.width}x${renderer.canvas.height} · ` +
            `quality ${quality.level}${pins ? ` (${pins})` : ''}`
        );
      }
      const hidden = renderer ? [...renderer.hiddenSceneCategories] : [];
      if (hidden.length > 0) {
        lines.push(`ABLATED: ${hidden.join(', ')} hidden from every pass`);
      }
      lines.push(`verdict: ${lastVerdict || 'none'}`);

      for (const group of GROUP_ORDER) {
        const views = lastViews.filter((v) => v.group === group);
        if (views.length === 0) continue;

        const subtotal = lastSubtotals.get(group);
        const heading = GROUP_LABELS[group] ?? group;
        lines.push('');
        lines.push(
          group === 'frame' || group === 'counts' || subtotal === undefined
            ? heading
            : `${heading}  (subtotal ${ms(subtotal)} ms)`
        );

        for (const view of views) {
          const label = view.label.padEnd(28);
          if (view.kind === 'count') {
            lines.push(`  ${label}${Math.round(view.perRun)}`);
            continue;
          }
          const value = `${ms(view.perFrame)} ms`.padStart(10);
          const detail =
            view.duty < 0.95
              ? `${ms(view.perRun)} ms on 1 frame in ` +
                `${(1 / Math.max(view.duty, 0.001)).toFixed(1)}`
              : `max ${ms(view.max)}`;
          lines.push(`  ${label}${value}   ${detail}`);
        }
      }

      lines.push('');
      lines.push(
        'note: values are means over the last 2 seconds. a row marked "on 1 ' +
          'frame in N" runs periodically, and the stated per-run cost is what ' +
          'it costs on the frames it does run. the first 30 frames after a ' +
          'pipeline rebuild are discarded.'
      );
      return lines.join('\n');
    };

    const flashCopy = (message: string) => {
      copyElm.textContent = message;
      clearTimeout(copyResetHandle);
      copyResetHandle = window.setTimeout(() => {
        copyElm.textContent = 'copy';
      }, 1200);
    };

    const copyReport = async () => {
      const report = buildReport();
      try {
        await navigator.clipboard.writeText(report);
        flashCopy('copied');
        return;
      } catch {
        // Falls through. An insecure origin, or a document without focus,
        // rejects the async clipboard.
      }

      const scratch = document.createElement('textarea');
      scratch.value = report;
      scratch.style.position = 'fixed';
      scratch.style.opacity = '0';
      document.body.appendChild(scratch);
      scratch.select();
      const copied = document.execCommand('copy');
      scratch.remove();
      flashCopy(copied ? 'copied' : 'copy failed');
    };

    copyElm.addEventListener('click', copyReport);

    const tick = () => {
      paint();
      frameHandle = requestAnimationFrame(tick);
    };

    const setOpen = (next: boolean) => {
      if (next === open) return;
      open = next;
      root.hidden = !open;

      if (open) {
        getActiveRenderer()?.metrics.reset();
        tick();
        return;
      }

      cancelAnimationFrame(frameHandle);
      frameHandle = 0;
      // Leaves the renderer publishing nothing again, and drops the window so a
      // later open does not average in numbers from before.
      const renderer = getActiveRenderer();
      if (renderer) {
        renderer.metrics.enabled = false;
        renderer.metrics.reset();
      }
      rowCount = -1;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Backquote' && event.code !== 'KeyC') return;

      // Never steal the key from a field the user is typing in.
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) {
        return;
      }

      if (event.code === 'Backquote') {
        event.preventDefault();
        setOpen(!open);
        return;
      }

      // Copy has a key as well as a button because pointer lock swallows clicks
      // while the game has the cursor. Only bound while the panel is open, so
      // it never takes C away from the game.
      if (open && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        void copyReport();
      }
    };

    this.onMount = () => {
      document.addEventListener('keydown', onKeyDown);
    };

    this.onCleanup = () => {
      document.removeEventListener('keydown', onKeyDown);
      clearTimeout(copyResetHandle);
      setOpen(false);
    };

    return () => root;
  }

  getStyle() {
    return StyledPerfPanel;
  }
}

const StyledPerfPanel = cssStylesheet(css`
  :host {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 9000;
    pointer-events: none;
  }

  .panel {
    pointer-events: auto;
    margin: 12px;
    width: 340px;
    max-height: calc(100vh - 24px);
    overflow-y: auto;
    background: rgba(8, 14, 22, 0.72);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(120, 200, 255, 0.22);
    border-radius: 4px;
    color: #cfe6f5;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    line-height: 1.6;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
  }

  .titlebar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 9px;
    border-bottom: 1px solid rgba(120, 200, 255, 0.16);
    background: rgba(120, 200, 255, 0.06);
  }

  .title {
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #7fd4ff;
  }

  .hint {
    color: rgba(207, 230, 245, 0.4);
    margin-left: auto;
    margin-right: 8px;
  }

  .copy {
    font: inherit;
    color: #7fd4ff;
    background: rgba(120, 200, 255, 0.1);
    border: 1px solid rgba(120, 200, 255, 0.3);
    border-radius: 3px;
    padding: 0 7px;
    cursor: pointer;
    min-width: 54px;
  }

  .copy:hover {
    background: rgba(120, 200, 255, 0.22);
  }

  .copy:active {
    background: rgba(120, 200, 255, 0.34);
  }

  .verdict {
    padding: 6px 9px;
    border-bottom: 1px solid rgba(120, 200, 255, 0.12);
  }

  .verdict.good {
    color: #7ee0a8;
  }

  .verdict.warn {
    color: #ffc46b;
  }

  .verdict.idle {
    color: rgba(207, 230, 245, 0.45);
  }

  .body {
    padding: 4px 0 7px;
  }

  .group {
    display: flex;
    justify-content: space-between;
    padding: 6px 9px 2px;
    color: #7fd4ff;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .subtotal {
    color: rgba(127, 212, 255, 0.65);
    text-transform: none;
    letter-spacing: 0;
  }

  .row {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 10px;
    padding: 0 9px;
  }

  .row:hover {
    background: rgba(120, 200, 255, 0.07);
  }

  .label {
    color: rgba(207, 230, 245, 0.78);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .value {
    color: #eaf6ff;
    text-align: right;
    min-width: 62px;
  }

  .detail {
    color: rgba(207, 230, 245, 0.42);
    text-align: right;
    min-width: 74px;
  }
`);
