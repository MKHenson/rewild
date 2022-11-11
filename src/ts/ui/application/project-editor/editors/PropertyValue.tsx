import { styled } from "solid-styled-components";
import { Typography } from "../../../common/Typography";

interface Props<T> {
  label: string;
  type: "string";
  value?: T;
  readonly?: boolean;
  onChange?: (newValue: T) => void;
}

export function PropertyValue<T extends string | number>(props: Props<T>) {
  const getEditor = (type: "string") => {
    return (
      <StyledStringValue
        readOnly={props.readonly}
        value={(props.value as string) || ""}
        onKeyDown={(e) => {
          if (!props.onChange) return;
          if (e.key === "Enter") props.onChange(e.currentTarget.value as T);
        }}
      />
    );
  };

  return [
    <div>
      <Typography variant="label">{props.label}</Typography>
    </div>,
    <StyledValueContainer>{getEditor(props.type)}</StyledValueContainer>,
  ];
}

const StyledStringValue = styled.input`
  width: 100%;
  outline: none;
  border: none;
  box-sizing: border-box;

  height: 100%;
  &[readonly] {
    background: ${(e) => e.theme?.colors.subtle400};
  }
`;

const StyledValueContainer = styled.div``;
