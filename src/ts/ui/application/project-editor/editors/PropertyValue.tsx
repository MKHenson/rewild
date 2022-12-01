import { styled } from "solid-styled-components";
import { Typography } from "../../../common/Typography";
import { Switch } from "../../../common/Switch";

type PropType = "string" | "boolean";

interface Props<T> {
  label: string;
  type: PropType;
  value?: T;
  readonly?: boolean;
  onChange?: (newValue: T) => void;
}

export function PropertyValue<T extends any>(props: Props<T>) {
  const getEditor = (type: PropType) => {
    if (type === "string")
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
    if (type === "boolean")
      return (
        <Switch
          checked={props.value as boolean}
          onClick={(e) => {
            if (!props.onChange) return;
            props.onChange(!props.value as boolean as T);
          }}
        />
      );

    return null;
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
