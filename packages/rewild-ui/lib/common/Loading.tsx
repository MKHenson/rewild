import { Component, register } from '../Component';
import { theme } from '../theme';
import { createNautilusGeometry } from '../utils/nautilus';

interface Props {
  /** Rendered width and height of the shell, in px. */
  size?: number;
  /** Shows an animated caption beneath the shell when set. */
  label?: string;
  /** Covers the nearest positioned ancestor with a dimmed backdrop. */
  overlay?: boolean;
}

/** Seconds for the highlight to travel from the apex out to the aperture. */
const DURATION = 2.2;

const NAUTILUS = createNautilusGeometry();

/**
 * Phase offset for a chamber. Each chamber lags the one inside it, so the
 * highlight sweeps from the apex out to the aperture.
 */
const delayFor = (t: number) => `animation-delay:${(-t * DURATION).toFixed(3)}s`;

@register('x-loading')
export class Loading extends Component<Props> {
  constructor() {
    super({ props: { size: 96 } });
  }

  init() {
    return () => {
      const size = this.props.size ?? 96;
      const label = this.props.label;

      this.toggleAttribute('overlay', !!this.props.overlay);
      this.setAttribute('role', 'status');
      this.setAttribute('aria-label', label || 'Loading');

      return (
        <div class="loading">
          <svg
            class="shell"
            width={size}
            height={size}
            viewBox={NAUTILUS.viewBox}
            aria-hidden="true"
          >
            {NAUTILUS.chambers.map((chamber) => (
              <path class="chamber" d={chamber.d} style={delayFor(chamber.t)} />
            ))}
          </svg>
          {label ? (
            <div class="label">
              {label}
              <span class="dot">.</span>
              <span class="dot">.</span>
              <span class="dot">.</span>
            </div>
          ) : undefined}
        </div>
      );
    };
  }

  getStyle() {
    return StyledLoading;
  }
}

const StyledLoading = cssStylesheet(css`
  :host {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: ${theme.colors.subtle600};
  }

  :host([overlay]) {
    position: absolute;
    inset: 0;
    z-index: 20;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(2px);
  }

  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.85rem;
  }

  .shell {
    display: block;
    overflow: visible;
  }

  .chamber {
    fill: currentColor;
    fill-opacity: 0.12;
    stroke: currentColor;
    stroke-width: 1.4;
    stroke-linejoin: round;
    animation: nautilus-chamber ${DURATION}s linear infinite;
  }

  @keyframes nautilus-chamber {
    0% {
      opacity: 0.22;
    }
    20% {
      opacity: 1;
    }
    60% {
      opacity: 0.22;
    }
    100% {
      opacity: 0.22;
    }
  }

  .label {
    font-size: ${theme.colors.fontSizeSmall};
    letter-spacing: 0.09em;
    opacity: 0.85;
  }

  .dot {
    animation: nautilus-dot ${DURATION}s linear infinite;
  }

  .dot:nth-child(2) {
    animation-delay: ${DURATION / 3}s;
  }

  .dot:nth-child(3) {
    animation-delay: ${(DURATION / 3) * 2}s;
  }

  @keyframes nautilus-dot {
    0% {
      opacity: 0.2;
    }
    35% {
      opacity: 1;
    }
    70% {
      opacity: 0.2;
    }
    100% {
      opacity: 0.2;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .chamber,
    .dot {
      animation: none;
      opacity: 0.8;
    }
  }
`);
