import { styled } from "solid-styled-components";
import { IContainer } from "models";
import { Component, Show } from "solid-js";
import { Card } from "../../../common/Card";
import { Typography } from "../../../common/Typography";
import { useEditor } from "../EditorProvider";
import { PropertyValue } from "./PropertyValue";
import { produce } from "solid-js/store";

interface Props {}

interface StringEditFunction<T, K extends keyof T> {
  (value: T[K], key: K): void;
}

function setProperty<T, K extends keyof T>(obj: T, key: K, value: T[K]) {
  obj[key] = value;
}

export const Properties: Component<Props> = (props) => {
  const { selectedResource, setProject, loading } = useEditor();

  const onContainerEdited: StringEditFunction<IContainer, keyof IContainer> = (val, type) => {
    const resource = selectedResource() as IContainer;
    setProject(
      produce((state) => {
        if (selectedResource()?.type === "container") {
          const container: IContainer = state.containers?.find((c) => c.id === resource.id)!;
          setProperty(container, type, val);
        }
      })
    );
  };

  return (
    <Card>
      <Show when={loading()}>LOADING</Show>
      <Typography variant="h3">Properties</Typography>
      <Show when={selectedResource()}>
        <StyledPropGrid>
          <PropertyValue label="ID" value={selectedResource()?.id} type="string" readonly />
          <PropertyValue
            label="Name"
            value={(selectedResource() as IContainer).name}
            type="string"
            onChange={(val) => onContainerEdited(val, "name")}
          />
          <PropertyValue
            label="Base Container"
            value={(selectedResource() as IContainer).baseContainer}
            type="string"
            onChange={(val) => onContainerEdited(val, "baseContainer")}
          />
          <PropertyValue<boolean>
            label="Active On Startup"
            value={(selectedResource() as IContainer).activeOnStartup}
            type="boolean"
            onChange={(val) => onContainerEdited(val, "activeOnStartup")}
          />
        </StyledPropGrid>
      </Show>
    </Card>
  );
};

const StyledPropGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;

  > * {
    border-top: 1px solid ${(e) => e.theme?.colors.onSurfaceLight};
    border-left: 1px solid ${(e) => e.theme?.colors.onSurfaceLight};
    border-right: 1px solid ${(e) => e.theme?.colors.onSurfaceLight};
  }

  > *:nth-child(even) {
    border-left: none;
  }

  > *:nth-last-child(1),
  > *:nth-last-child(2) {
    border-bottom: 1px solid ${(e) => e.theme?.colors.onSurfaceLight};
  }
`;
