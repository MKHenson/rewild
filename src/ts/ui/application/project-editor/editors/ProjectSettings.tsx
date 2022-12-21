import { styled } from "solid-styled-components";
import { Component, Show } from "solid-js";
import { Card } from "../../../common/Card";
import { Typography } from "../../../common/Typography";
import { Switch } from "../../../common/Switch";
import { Date } from "../../../common/Date";
import { Input } from "../../../common/Input";
import { useEditor } from "../EditorProvider";

interface Props {}

export const ProjectSettings: Component<Props> = (props) => {
  const { project, level, loading, setProject } = useEditor();

  return (
    <Card>
      <Show when={loading()}>LOADING</Show>
      <Typography variant="h3">Project Settings</Typography>
      <Show when={project}>
        <StyledContainer>
          <Typography variant="label">Name</Typography>
          <Typography variant="body2">{project.name}</Typography>
          <Typography variant="label">Last Modified</Typography>
          <Typography variant="body2">
            <Date date={project.lastModified!.toDate()} />
          </Typography>
          <Typography variant="label">Last Published</Typography>
          <Typography variant="body2">
            <Date date={level()?.lastModified?.toDate()} />
          </Typography>
          <Typography variant="label">Active on Startup</Typography>
          <Switch
            onClick={(e) => {
              setProject("activeOnStartup", !project.activeOnStartup);
            }}
            checked={project.activeOnStartup}
          />
          <Typography variant="label">Start Event</Typography>
          <Input fullWidth value={project.startEvent} onChange={(e) => setProject("startEvent", e)} />
        </StyledContainer>
      </Show>
    </Card>
  );
};

const StyledContainer = styled.div``;
