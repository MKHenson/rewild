import { styled } from "solid-styled-components";
import { IEditorResource, PropValue, IProperty } from "models";
import { Component, For, Show } from "solid-js";
import { Card } from "../../../common/Card";
import { Typography } from "../../../common/Typography";
import { useEditor } from "../EditorProvider";
import { PropertyValue } from "./PropertyValue";

interface Props {}

export const Properties: Component<Props> = (props) => {
  const { selectedResource, setProject, loading } = useEditor();

  const onPropEdited = (val: PropValue, prop: IProperty) => {
    const node = selectedResource();

    setProject("sceneGraph", "containers", (containers) =>
      containers.map((container) => {
        if (container === node) return container;
        else return { ...container };
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
          <For each={(selectedResource()?.resource as IEditorResource).properties}>
            {(prop) => (
              <PropertyValue
                label={prop.name}
                value={prop.value}
                type={prop.type}
                onChange={(val) => onPropEdited(val, prop)}
              />
            )}
          </For>
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
