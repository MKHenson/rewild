import { Component } from "solid-js";
import { styled } from "solid-styled-components";
import { Typography } from "../common/Typography";

export const InGameUI: Component = () => {
  return (
    <StyledContainer>
      <StyledFooter>
        <Typography variant="h4">In Game</Typography>
      </StyledFooter>
    </StyledContainer>
  );
};

const StyledContainer = styled.div`
  width: 100%;
  height: 100%;
  position: absolute;
`;
const StyledFooter = styled.div`
  width: 90%;
  height: 5%;
  position: absolute;
  bottom: 30px;
  background: rgb(84 92 135);
  margin: 0 0 0 5%;
  border-radius: 10px;
  padding: 1rem;
  box-sizing: border-box;
  color: white;
`;
