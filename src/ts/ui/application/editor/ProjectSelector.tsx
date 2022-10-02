import { Component, createResource, createSignal, For, Show } from "solid-js";
import { styled } from "solid-styled-components";
import { Button } from "../../common/Button";
import { Typography } from "../../common/Typography";
import { StyledMaterialIcon } from "../../common/MaterialIcon";
import { Popup } from "../../common/Popup";
import { Card } from "../../common/Card";
import { getProjects } from "./ProjectSelectorUtils";

interface Props {
  open: boolean;
  onBack: () => void;
  onOpen: (projectUid: string) => void;
}

export const ProjectSelector: Component<Props> = (props) => {
  const [selectedProject, setSelectedProject] = createSignal("");
  const [projects] = createResource(getProjects);

  return (
    <Popup open={props.open}>
      <StyledContainer>
        <StyledNavButtons>
          <Button variant="text" onClick={props.onBack}>
            <StyledMaterialIcon icon="chevron_left" />
            <span>Back</span>
          </Button>
        </StyledNavButtons>
        <StyledProjectName>
          <Typography variant="h4">Select</Typography>
        </StyledProjectName>

        <StyledProjects>
          <div>
            <Card>
              <Typography variant="h4">
                <div>
                  <StyledMaterialIcon icon="add_circle" />
                </div>
                Add New Project
              </Typography>
            </Card>

            <Show when={projects.loading || projects.error}>
              {projects.error ? projects.error.toString() : "Loading..."}
            </Show>
            <Show when={!projects.loading}>
              <For each={projects()}>
                {(item) => (
                  <Card onClick={(e) => setSelectedProject(item.name)}>
                    <Typography variant="h4">{item.name}</Typography>
                  </Card>
                )}
              </For>
            </Show>
          </div>
        </StyledProjects>

        <StyledProjectDetails>Project Details Here</StyledProjectDetails>
        <StyledProjectActions>
          <Button disabled={!selectedProject()} variant="text" fullWidth>
            Delete
          </Button>
          <Button disabled={!selectedProject()} onClick={(e) => props.onOpen(selectedProject())} fullWidth>
            Open
          </Button>
        </StyledProjectActions>
      </StyledContainer>
    </Popup>
  );
};

const StyledContainer = styled.div`
  display: grid;
  align-content: stretch;
  grid-template-columns: 2fr 1fr;
  grid-template-rows: 40px 1fr 1fr;
  width: 860px;
  height: 500px;
  min-height: 300px;
`;

const StyledProjectName = styled.div``;
const StyledProjectDetails = styled.div``;
const StyledProjects = styled.div`
  grid-row-start: 2;
  grid-row-end: 4;

  > div {
    overflow: auto;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    grid-gap: 10px;
  }

  .card {
    cursor: pointer;
    width: 160px;
    height: 160px;
    box-shadow: ${(e) => e.theme?.colors.shadowShort1};
    text-align: center;
    display: inline-flex;
    justify-content: center;
    align-items: center;
    transition: box-shadow 0.25s;
    margin: 2px;
  }
  .card:hover {
    box-shadow: ${(e) => e.theme?.colors.shadowShort2};
  }
`;
const StyledProjectActions = styled.div`
  align-self: end;
`;
const StyledNavButtons = styled.div`
  button {
    padding: 0;
  }
`;
