import { createUUID } from "../utils/createUUID";
import { Component, register } from "../Component";

interface Props {
  size: number;
  strokeSize: number;
  value: number;
}

@register("x-circular-progress")
export class CircularProgress extends Component<Props> {
  init() {
    //https://codepen.io/JMChristensen/pen/AGbeEy

    const radius = this.props.size / 2 - this.props.strokeSize / 2;
    const c = Math.PI * (radius * 2);
    const gradientId = createUUID();
    const size = this.props.size;
    const strokeSize = this.props.strokeSize;

    const val = () => {
      let val = this.props.value;

      if (val < 0) {
        val = 0;
      }
      if (val > 100) {
        val = 100;
      }

      return val;
    };

    const elm = (
      <div class="outer-div">
        <svg
          id="svg"
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          version="1.1"
          xmlns="http://www.w3.org/2000/svg"
        >
          <linearGradient id={gradientId} x1="1" x2="0.5" y1="1" y2="0.5">
            <stop
              class="stop1"
              stop-color={val() < 50 ? "#ff0000" : "#eeff50"}
              offset="0%"
            />
            <stop
              class="stop2"
              stop-color={val() < 50 ? "#eeff50" : "#9198e5"}
              offset="100%"
            />
          </linearGradient>
          <circle
            id="first-circle"
            r={radius}
            cx={this.props.size / 2}
            cy={this.props.size / 2}
            fill="transparent"
            stroke-dasharray={(c * 2).toFixed(2)}
            stroke-dashoffset="0"
          ></circle>
          <circle
            id="bar"
            r={radius}
            cx={this.props.size / 2}
            cy={this.props.size / 2}
            fill="transparent"
            stroke-dasharray={(c * 2).toFixed(2)}
            stroke={`url(#$gradient)`}
          ></circle>
        </svg>
        <div class="label-section">{val()}</div>
      </div>
    );

    const firstCircle = elm.querySelector("#first-circle") as SVGCircleElement;
    const circleBar = elm.querySelector("#bar") as SVGCircleElement;
    const labelSection = elm.querySelector(".label-section") as HTMLDivElement;
    const outerDivSection = elm;

    return () => {
      const value = val();
      const pct = ((100 - value) / 100) * c + c;

      firstCircle.style.strokeWidth = `${strokeSize}px`;

      outerDivSection.style.height = `${size}px`;
      outerDivSection.style.width = `${size}px`;

      this.style.height = `${size}px`;
      this.style.width = `${size}px`;

      circleBar.style.strokeWidth = strokeSize + "px";
      circleBar.style.stroke = `url(#${gradientId})`;
      circleBar.style.strokeDashoffset = `${pct}px`;

      labelSection.style.height = `${size - strokeSize * 2}px`;
      labelSection.style.width = `${size - strokeSize * 2}px`;
      labelSection.style.marginTop = `-${size / 2 - strokeSize}px`;
      labelSection.style.marginLeft = `-${size / 2 - strokeSize}px`;
      labelSection.style.lineHeight = `${size - strokeSize * 2}px`;

      labelSection.innerHTML = value.toString();

      return elm;
    };
  }

  getStyle() {
    return StyledCircle;
  }
}

// styled.div<{ strokeSize: number; size: number }>
// styled.div<{ gradientId: string; strokeSize: number; size: number; val: number }>

const StyledCircle = cssStylesheet(css`
  :host {
    display: inline-block;
  }

  svg {
    display: block;
    width: 100%;
    height: 100%;
  }

  .label-section {
    position: absolute;
    display: block;
    left: 50%;
    top: 50%;
    box-shadow: inset 0 0 1em black;
    border-radius: 100%;
    font-size: 1.5em;
    text-shadow: 0 0 0.5em black;
    text-align: center;
  }

  .outer-div {
    display: inline-block;
    box-shadow: 0 0 1em black;
    border-radius: 100%;
    position: relative;
  }

  .outer-div stop {
    transition: stop-color 5s;
  }

  .outer-div circle {
    stroke-dashoffset: 0;
    transition: stroke-dashoffset 0.3s linear, stroke 2s linear;
    stroke: #666;
  }
`);
