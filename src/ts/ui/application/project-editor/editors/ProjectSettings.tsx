import { styled } from "solid-styled-components";
import { Component, For, Show } from "solid-js";
import { Card } from "../../../common/Card";
import { Typography } from "../../../common/Typography";
import { Date } from "../../../common/Date";
import { useEditor } from "../EditorProvider";

interface Props {}

export const ProjectSettings: Component<Props> = (props) => {
  const { project, levels, loading } = useEditor();

  return (
    <Card>
      <Show when={loading()}>LOADING</Show>
      <Typography variant="h3">Project Settings</Typography>
      <Show when={project}>
        <StyledContainer>
          <Typography variant="h2">Details</Typography>
          <Typography variant="body2">{project.name}</Typography>
          <Typography variant="h2">Levels</Typography>
          <Show when={!loading()}>
            <For each={levels()}>
              {(item) => (
                <div>
                  <StyledField>
                    <Typography variant="label">Created</Typography>
                    <Typography variant="body1">
                      <Date date={item.created.toDate()} />
                    </Typography>
                  </StyledField>
                </div>
              )}
            </For>
          </Show>
        </StyledContainer>
      </Show>
    </Card>
  );
};

const StyledContainer = styled.div``;
const StyledField = styled.div`
  margin: 0 0 1rem 0;
`;
