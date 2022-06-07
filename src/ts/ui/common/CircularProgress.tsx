import { styled } from "solid-styled-components";
import { Component } from "solid-js";
import { generateUUID } from "../../../common/math/MathUtils";

export type ButtonVariant = "contained" | "outlined";
export type ButtonColor = "primary" | "secondary" | "error";

interface Props {
  size: number;
  strokeSize: number;
  value: number;
}

export const CircularProgress: Component<Props> = (props) => {
  //https://codepen.io/JMChristensen/pen/AGbeEy
  let circleBar!: SVGCircleElement;

  const radius = props.size / 2 - props.strokeSize / 2;
  const c = Math.PI * (radius * 2);
  const val = () => {
    let val = props.value;

    if (val < 0) {
      val = 0;
    }
    if (val > 100) {
      val = 100;
    }

    const pct = ((100 - val) / 100) * c + c;
    if (circleBar) circleBar.style.strokeDashoffset = `${pct}px`;

    return val;
  };

  const pct = ((100 - val()) / 100) * c + c;

  const gradientId = generateUUID();

  return (
    <StyledDiv gradientId={gradientId} val={val()} size={props.size} strokeSize={props.strokeSize}>
      <svg
        id="svg"
        width={props.size}
        height={props.size}
        viewBox={`0 0 ${props.size} ${props.size}`}
        version="1.1"
        xmlns="http://www.w3.org/2000/svg"
      >
        <linearGradient id={gradientId} x1="1" x2="0.5" y1="1" y2="0.5">
          <stop class="stop1" stop-color={val() < 50 ? "#ff0000" : "#eeff50"} offset="0%" />
          <stop class="stop2" stop-color={val() < 50 ? "#eeff50" : "#9198e5"} offset="100%" />
        </linearGradient>
        <circle
          r={radius}
          cx={props.size / 2}
          cy={props.size / 2}
          fill="transparent"
          stroke-dasharray={(c * 2).toFixed(2)}
          stroke-dashoffset="0"
        ></circle>
        <circle
          ref={circleBar}
          id="bar"
          r={radius}
          cx={props.size / 2}
          cy={props.size / 2}
          fill="transparent"
          stroke-dasharray={(c * 2).toFixed(2)}
          stroke-dashoffset={pct}
          stroke={`url(#$gradient)`}
        ></circle>
      </svg>
      <StyledLabel size={props.size} strokeSize={props.strokeSize}>
        {val()}
      </StyledLabel>
    </StyledDiv>
  );
};

const StyledLabel = styled.div<{ strokeSize: number; size: number }>`
  position: absolute;
  display: block;
  height: ${(e) => e.size - e.strokeSize * 2}px;
  width: ${(e) => e.size - e.strokeSize * 2}px;
  left: 50%;
  top: 50%;
  box-shadow: inset 0 0 1em black;
  margin-top: -${(e) => e.size / 2 - e.strokeSize}px;
  margin-left: -${(e) => e.size / 2 - e.strokeSize}px;
  border-radius: 100%;
  line-height: ${(e) => e.size - e.strokeSize * 2}px;
  font-size: 1.5em;
  text-shadow: 0 0 0.5em black;
  text-align: center;
`;

const StyledDiv = styled.div<{ gradientId: string; strokeSize: number; size: number; val: number }>`
  display: inline-block;
  height: ${(e) => e.size}px;
  width: ${(e) => e.size}px;
  box-shadow: 0 0 1em black;
  border-radius: 100%;
  position: relative;

  stop {
    transition: stop-color 5s;
  }

  circle {
    stroke-dashoffset: 0;
    transition: stroke-dashoffset 0.3s linear, stroke 2s linear;
    stroke: #666;
    stroke-width: ${(e) => e.strokeSize}px;
  }

  #bar {
    stroke: url(#${(e) => e.gradientId});
  }
`;
