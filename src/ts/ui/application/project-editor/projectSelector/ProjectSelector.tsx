import { Component, createSignal, For, onMount, Show } from "solid-js";
import { styled } from "solid-styled-components";
import { IProject } from "models";
import { Button } from "../../../common/Button";
import { Typography } from "../../../common/Typography";
import { StyledMaterialIcon } from "../../../common/MaterialIcon";
import { Popup } from "../../../common/Popup";
import { Card } from "../../../common/Card";
import { Loading } from "../../../common/Loading";
import { useProjects } from "./useProjects";
import { NewProjectForm } from "../NewProjectForm";
import { createProject } from "./ProjectSelectorUtils";

interface Props {
  open: boolean;
  onBack: () => void;
  onOpen: (projectUid: string) => void;
}

export const ProjectSelector: Component<Props> = (props) => {
  const [newProject, setNewProject] = createSignal<Partial<IProject> | null>(null);
  const [selectedProject, setSelectedProject] = createSignal<IProject>();
  const { loading, error, addProject, projects, getProjects, removeProjects } = useProjects();

  onMount(async () => {
    await getProjects();
  });

  const onCreate = async () => {
    await addProject(newProject()!);
    setNewProject(null);
  };

  const onDelete = async () => {
    await removeProjects(selectedProject()!.id!);
  };

  const onBack = () => {
    if (newProject()) setNewProject(null);
    else props.onBack();
  };

  const isProjectValid = () => {
    if (!newProject()?.name) return false;
    return true;
  };

  const onNewProject = () => {
    setNewProject(createProject());
    setSelectedProject(undefined);
  };

  const projectList = (
    <div class="projects-list">
      <Card button raised onClick={onNewProject}>
        <Typography variant="h4">
          <div>
            <StyledMaterialIcon icon="add_circle" />
          </div>
          Add New Project
        </Typography>
      </Card>

      <Show when={loading() || error()}>{error() ? error() : <Loading />}</Show>
      <Show when={!loading()}>
        <For each={projects()}>
          {(item) => (
            <Card button raised onClick={(e) => setSelectedProject(item)} pushed={selectedProject()?.id === item.id}>
              <Typography variant="h4">{item.name}</Typography>
            </Card>
          )}
        </For>
      </Show>
    </div>
  );

  return (
    <Popup open={props.open}>
      <StyledContainer>
        <StyledNavButtons>
          <Button variant="text" onClick={onBack}>
            <StyledMaterialIcon icon="chevron_left" />
            <span>Back</span>
          </Button>
        </StyledNavButtons>
        <StyledProjectName>
          <Show when={!!selectedProject()}>
            <Typography variant="h4">{selectedProject()!.name}</Typography>
          </Show>
        </StyledProjectName>

        <StyledProjects>
          <Show when={!!newProject()} fallback={projectList}>
            <NewProjectForm project={newProject()} onChange={(project) => setNewProject(project)} />
            <Show when={!!error()}>{error()}</Show>
          </Show>
        </StyledProjects>

        <StyledProjectDetails>
          <Show when={!!selectedProject()}>
            <Typography variant="label">Description</Typography>
            <Typography variant="body1">{selectedProject()!.description}</Typography>
          </Show>
        </StyledProjectDetails>

        <StyledProjectActions>
          <Show when={!!selectedProject()}>
            <Button color="error" variant="text" fullWidth onClick={onDelete}>
              Delete
            </Button>
          </Show>

          <Show when={!!selectedProject()}>
            <Button onClick={(e) => props.onOpen(selectedProject()!.id!)} fullWidth>
              Open
            </Button>
          </Show>

          <Show when={!!newProject()}>
            <Button onClick={onCreate} fullWidth disabled={loading() || !isProjectValid()}>
              Create Project
            </Button>
          </Show>
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

  .projects-list {
    overflow: auto;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    grid-gap: 10px 0;
  }

  .card {
    width: 160px;
    height: 160px;
    text-align: center;
    display: inline-flex;
    justify-content: center;
    align-items: center;
    transition: box-shadow 0.25s;
    margin: 2px;
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
