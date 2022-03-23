import { styled } from "solid-styled-components";
import { Component, onCleanup, onMount } from "solid-js";

interface Props {
  onCanvasReady: (canvas: HTMLCanvasElement) => void;
}

export const Pane3D: Component<Props> = (props) => {
  let parent!: HTMLDivElement;

  const onResizeDelegate = () => {
    const canvas = parent.firstElementChild as HTMLCanvasElement;
    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;
  };

  onMount(() => {
    window.addEventListener("resize", onResizeDelegate);
    onResizeDelegate();
  });

  onCleanup(() => {
    window.removeEventListener("resize", onResizeDelegate);
  });

  return (
    <StyledCanvas ref={parent}>
      <canvas ref={props.onCanvasReady}></canvas>
    </StyledCanvas>
  );
};

const StyledCanvas = styled.div`
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: block;
`;
