import { Component } from "solid-js";
import { styled } from "solid-styled-components";
import { Typography } from "../common/Typography";

export const InGameUI: Component = () => {
  return (
    <StyledContainer>
      <StyledFooter>
        <Typography variant="h2">The Game Will End in 15 Seconds</Typography>
      </StyledFooter>
    </StyledContainer>
  );
};

const StyledContainer = styled.div`
  width: 100%;
  height: 100%;
  position: absolute;
  pointer-events: none;
`;

const StyledFooter = styled.div`
  pointer-events: initial;
  width: 90%;
  height: 5%;
  min-height: 50px;
  position: absolute;
  bottom: 30px;
  background: rgb(84 92 135);
  margin: 0 0 0 5%;
  border-radius: 10px;
  box-sizing: border-box;
  color: white;
  justify-content: center;
  align-items: center;
  display: flex;

  > div {
    flex: 0 1 auto;
  }
`;
