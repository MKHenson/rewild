import { styled } from "solid-styled-components";
import { Component } from "solid-js";

export type TypographyVariant = "h1" | "h2" | "h3" | "h4" | "body1" | "body2";
export type TypographyAlign = "center" | "inherit" | "justify" | "left" | "right";

interface Props {
  variant: TypographyVariant;
  align?: TypographyAlign;
}

export const Typography: Component<Props> = (props) => {
  return (
    <StyledTypography className={`typography ${props.variant}`} style={{ textAlign: props.align }}>
      {props.children}
    </StyledTypography>
  );
};

const StyledTypography = styled.div`
  margin: 0;
  font-family: var(--font-family);
  margin-bottom: 0.35em;

  .h1 {
    font-weight: 300;
    font-size: 6rem;
    line-height: 1.167;
    letter-spacing: -0.01562em;
  }

  .h2 {
    font-weight: 300;
    font-size: 3.75rem;
    line-height: 1.2;
    letter-spacing: -0.00833em;
  }

  .h3 {
    font-weight: 400;
    font-size: 3rem;
    line-height: 1.167;
    letter-spacing: 0em;
  }

  .h4 {
    font-weight: 400;
    font-size: 2.125rem;
    line-height: 1.235;
    letter-spacing: 0.00735em;
  }

  .body1 {
    font-weight: 400;
    font-size: 1rem;
    line-height: 1.5;
    letter-spacing: 0.00938em;
  }

  .body2 {
    font-weight: 400;
    font-size: 0.875rem;
    line-height: 1.43;
    letter-spacing: 0.01071em;
  }
`;
