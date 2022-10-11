import { styled } from "solid-styled-components";
import { Component } from "solid-js";

interface Props {
  size?: number;
}

export const Loading: Component<Props> = (props) => {
  return (
    <StyledLoading size={props.size || 60} class="loading">
      <div></div>
      <div></div>
    </StyledLoading>
  );
};

const StyledLoading = styled.div<{ size: number }>`
  display: inline-block;
  position: relative;
  width: ${(e) => e.size}px;
  height: ${(e) => e.size}px;

  div {
    position: absolute;
    border: 4px solid ${(e) => e.theme?.colors.subtle600};
    opacity: 1;
    border-radius: 50%;
    animation: lds-ripple 1s cubic-bezier(0, 0.2, 0.8, 1) infinite;
  }
  div:nth-child(2) {
    animation-delay: -0.5s;
  }
  @keyframes lds-ripple {
    0% {
      top: ${(e) => e.size / 2 - 4}px;
      left: ${(e) => e.size / 2 - 4}px;
      width: 0;
      height: 0;
      opacity: 0;
    }
    4.9% {
      top: ${(e) => e.size / 2 - 4}px;
      left: ${(e) => e.size / 2 - 4}px;
      width: 0;
      height: 0;
      opacity: 0;
    }
    5% {
      top: ${(e) => e.size / 2 - 4}px;
      left: ${(e) => e.size / 2 - 4}px;
      width: 0;
      height: 0;
      opacity: 1;
    }
    100% {
      top: 0px;
      left: 0px;
      width: ${(e) => e.size - 4}px;
      height: ${(e) => e.size - 4}px;
      opacity: 0;
    }
  }
`;
