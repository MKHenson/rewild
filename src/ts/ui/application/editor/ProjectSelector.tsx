import { Component, createResource, createSignal, For, Show } from "solid-js";
import { styled } from "solid-styled-components";
import { Button } from "../../common/Button";
import { Typography } from "../../common/Typography";
import { StyledMaterialIcon } from "../../common/MaterialIcon";
import { Popup } from "../../common/Popup";
import { Card } from "../../common/Card";
import { Input } from "../../common/Input";
import { getProjects, addProject, removeProjects } from "./ProjectSelectorUtils";
import { IProject } from "models";
import { Field } from "../../common/Field";

interface Props {
  open: boolean;
  onBack: () => void;
  onOpen: (projectUid: string) => void;
}

export const ProjectSelector: Component<Props> = (props) => {
  const [newProject, setNewProject] = createSignal<Partial<IProject | null>>(null);
  const [mutating, setMutating] = createSignal(false);
  const [mutationError, setMutationError] = createSignal("");
  const [selectedProject, setSelectedProject] = createSignal<IProject>();
  const [projectsResource, { refetch }] = createResource(getProjects);

  const onCreate = async () => {
    setMutating(true);
    setMutationError("");
    try {
      await addProject(newProject()!);
      setNewProject(null);
      setMutating(false);
      refetch();
    } catch (err: any) {
      setMutationError(err.toString());
      setMutating(false);
    }
  };

  const onDelete = async () => {
    setMutating(true);
    setMutationError("");
    try {
      await removeProjects(selectedProject()!.id!);
      setMutating(false);
      refetch();
    } catch (err: any) {
      setMutationError(err.toString());
      setMutating(false);
    }
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
    setNewProject({ name: "New Project" });
    setSelectedProject(undefined);
  };

  const projectList = (
    <div className="projects-list">
      <Card onClick={onNewProject}>
        <Typography variant="h4">
          <div>
            <StyledMaterialIcon icon="add_circle" />
          </div>
          Add New Project
        </Typography>
      </Card>

      <Show when={projectsResource.loading || projectsResource.error}>
        {projectsResource.error ? projectsResource.error.toString() : "Loading..."}
      </Show>
      <Show when={!projectsResource.loading}>
        <For each={projectsResource()}>
          {(item) => (
            <Card onClick={(e) => setSelectedProject(item)}>
              <Typography variant="h4">{item.name}</Typography>
            </Card>
          )}
        </For>
      </Show>
    </div>
  );

  const newProjectForm = (
    <div>
      <Field label="Name" required>
        <Input
          autoFocus
          placeholder="Enter project name"
          value={newProject()?.name}
          onChange={(name) => setNewProject({ ...newProject(), name })}
        />
      </Field>
      <Field label="Description">
        <Input
          placeholder="Enter a description"
          value={newProject()?.description}
          onChange={(description) => setNewProject({ ...newProject(), description })}
        />
      </Field>
      <Show when={!!mutationError()}>{mutationError()}</Show>
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
            {newProjectForm}
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
            <Button variant="text" fullWidth onClick={onDelete}>
              Delete
            </Button>
          </Show>

          <Show when={!!selectedProject()}>
            <Button onClick={(e) => props.onOpen(selectedProject()!.id!)} fullWidth>
              Open
            </Button>
          </Show>

          <Show when={!!newProject()}>
            <Button onClick={onCreate} fullWidth disabled={mutating() || !isProjectValid()}>
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
