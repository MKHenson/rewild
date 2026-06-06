import {
  Card,
  Typography,
  Switch,
  Date,
  Input,
  Button,
  Component,
  register,
} from 'rewild-ui';
import { projectStore } from '../../../stores/ProjectStore';
import { StoredRecord, IProject } from 'models';

interface Props {}

@register('x-project-settings')
export class ProjectSettings extends Component<Props> {
  init() {
    this.on(projectStore.dispatcher);
    const [updatedProject, setUpdatedProject] = this.useState({
      ...projectStore.project,
    });

    return () => {
      const { project, level } = projectStore;
      return (
        <Card stretched>
          {project ? (
            <div>
              <Typography variant="label">Name</Typography>
              <Typography variant="body2">{project.name}</Typography>
              <Typography variant="label">Last Modified</Typography>
              <Typography variant="body2">
                <Date date={project.updatedAt!} />
              </Typography>
              <Typography variant="label">Last Published</Typography>
              <Typography variant="body2">
                <Date date={level?.updatedAt} />
              </Typography>
              <Typography variant="label">Active on Startup</Typography>
              <Switch
                onClick={(e) => {
                  setUpdatedProject(
                    {
                      ...updatedProject(),
                      activeOnStartup: !updatedProject().activeOnStartup,
                    },
                    false
                  );
                }}
                checked={updatedProject().activeOnStartup}
              />
              <Typography variant="label">Start Event</Typography>
              <Input
                fullWidth
                value={updatedProject().startEvent}
                onChange={(e) => {
                  setUpdatedProject(
                    { ...updatedProject(), startEvent: e },
                    false
                  );
                }}
              />
              <div class="buttons">
                <div></div>
                <div>
                  <Button
                    fullWidth
                    onClick={(e) => {
                      projectStore.project = updatedProject() as StoredRecord<IProject>;
                      projectStore.updateProject();
                    }}>
                    Save
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </Card>
      );
    };
  }

  getStyle() {
    return StyledContainer;
  }
}

const StyledContainer = cssStylesheet(css`
  .buttons {
    display: flex;
    padding: 4px;
    margin: 1rem 0 0 0;
  }

  .buttons > div {
    flex: 1;
  }
`);
