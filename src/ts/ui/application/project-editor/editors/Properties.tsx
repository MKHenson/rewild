import { styled } from "solid-styled-components";
import { IContainer } from "models";
import { Component, Show } from "solid-js";
import { Card } from "../../../common/Card";
import { Typography } from "../../../common/Typography";
import { useEditor } from "../EditorProvider";
import { PropertyValue } from "./PropertyValue";
import { produce } from "solid-js/store";

interface Props {}

export const Properties: Component<Props> = (props) => {
  const { selectedResource, setProjectDirty, setProjectStore, loading } = useEditor();

  const onNameEdited = (val: string) => {
    const resource = selectedResource() as IContainer;
    setProjectDirty(true);

    setProjectStore(
      produce((state) => {
        if (selectedResource()?.type === "container") {
          const container = state.containers?.find((c) => c.id === resource.id)!;
          container.name = val;
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
            onChange={onNameEdited}
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
