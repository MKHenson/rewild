import { styled } from "solid-styled-components";
import { ParentComponent, JSX } from "solid-js";
import format from "date-fns/format";

interface Props extends JSX.HTMLAttributes<HTMLDivElement> {
  date: Date;
  withTime?: boolean;
}

export const Date: ParentComponent<Props> = (props) => {
  return (
    <StyledDate>
      {format(props.date, props.withTime || props.withTime === undefined ? "do MMMM y, p" : "do MMMM y")}
    </StyledDate>
  );
};

const StyledDate = styled.div``;
