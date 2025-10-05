import { IProject } from 'models';
import {
  Loading,
  Card,
  Popup,
  Component,
  register,
  Typography,
  Button,
  StyledMaterialIcon,
} from 'rewild-ui';
import { NewProjectForm } from '../NewProjectForm';
import { projectsStore } from '../../../stores/ProjectsStore';
import { ProjectStore } from 'src/ui/stores/ProjectStore';

interface Props {
  open: boolean;
  onBack: () => void;
  onOpen: (projectUid: string) => void;
}

@register('x-project-selector')
export class ProjectSelector extends Component<Props> {
  init() {
    const projectStoreProxy = this.observeStore(projectsStore);

    const onCreate = async () => {
      await projectsStore.addProject(newProject()!);
      setNewProject(null);
    };

    const onDelete = async () => {
      await projectsStore.removeProjects(selectedProject()!.id!);
    };

    const onBack = () => {
      if (newProject()) setNewProject(null);
      else this.props.onBack();
    };

    const isProjectValid = () => {
      if (!newProject()?.name) return false;
      return true;
    };

    const onNewProject = () => {
      setNewProject(ProjectStore.createProject());
      setSelectedProject(null);
    };

    this.onMount = () => {
      projectsStore.getProjects();
    };

    const [newProject, setNewProject] = this.useState<Partial<IProject> | null>(
      null
    );
    const [selectedProject, setSelectedProject] =
      this.useState<IProject | null>(null);

    return () => {
      const isProjectSelected = !!selectedProject();
      const isNewProject = !!newProject();
      const props = this.props;
      const loading = projectStoreProxy.loading;

      return (
        <Popup open={props.open}>
          <div class="container">
            <div class="nav-buttons">
              <Button variant="text" onClick={onBack}>
                <StyledMaterialIcon icon="chevron_left" />
                <span>Back</span>
              </Button>
            </div>
            <div>
              {isProjectSelected && (
                <Typography variant="h4">{selectedProject()!.name}</Typography>
              )}
            </div>

            <div class="projects">
              {isNewProject ? (
                [
                  <NewProjectForm
                    project={newProject()}
                    onChange={(project) => setNewProject(project, false)}
                  />,
                  !!projectStoreProxy.error && projectStoreProxy.error,
                ]
              ) : (
                <div class="projects-list">
                  <Card button raised disabled={loading} onClick={onNewProject}>
                    <Typography variant="h4">
                      <div>
                        <StyledMaterialIcon icon="add_circle" />
                      </div>
                      Add New Project
                    </Typography>
                  </Card>
                  {loading || projectStoreProxy.error ? (
                    projectStoreProxy.error ? (
                      projectStoreProxy.error
                    ) : (
                      <Loading />
                    )
                  ) : undefined}
                  {!loading
                    ? projectStoreProxy.projects.map((item) => (
                        <Card
                          button
                          raised
                          onClick={(e) => setSelectedProject(item)}
                          pushed={selectedProject()?.id === item.id}>
                          <Typography variant="h4">{item.name}</Typography>
                        </Card>
                      ))
                    : null}
                </div>
              )}
            </div>

            <div>
              {isProjectSelected && [
                <Typography variant="label">Description</Typography>,
                <Typography variant="body1">
                  {selectedProject()!.description}
                </Typography>,
              ]}
            </div>

            <div class="actions">
              {isProjectSelected && (
                <Button
                  color="error"
                  variant="text"
                  fullWidth
                  onClick={onDelete}>
                  Delete
                </Button>
              )}

              {isProjectSelected && (
                <Button
                  onClick={(e) => props.onOpen(selectedProject()!.id!)}
                  fullWidth>
                  Open
                </Button>
              )}

              {isNewProject && (
                <Button
                  onClick={onCreate}
                  fullWidth
                  disabled={loading || !isProjectValid()}>
                  Create Project
                </Button>
              )}
            </div>
          </div>
        </Popup>
      );
    };
  }

  getStyle() {
    return css`
      .container {
        display: grid;
        align-content: stretch;
        grid-template-columns: 2fr 1fr;
        grid-template-rows: 40px 1fr 1fr;
        width: 860px;
        height: 500px;
        min-height: 300px;
      }

      .projects {
        grid-row-start: 2;
        grid-row-end: 4;
      }

      .projects .projects-list {
        overflow: auto;
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        grid-gap: 10px 0;
      }

      .projects x-card {
        width: 160px;
        height: 160px;
        text-align: center;
        display: inline-flex;
        justify-content: center;
        align-items: center;
        transition: box-shadow 0.25s;
        margin: 2px;
      }

      .actions {
        align-self: end;
      }

      .nav-buttons x-button {
        padding: 0;
      }
    `;
  }
}
