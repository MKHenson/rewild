import { Card } from "../../../common/Card";
import { Typography } from "../../../common/Typography";
import { Switch } from "../../../common/Switch";
import { Date } from "../../../common/Date";
import { Input } from "../../../common/Input";
import { Button } from "../../../common/Button";
import { Component, register } from "../../../Component";
import { projectStore } from "../../../stores/Project";
import { IProject } from "models";

interface Props {}

@register("x-project-settings")
export class ProjectSettings extends Component<Props> {
  init() {
    const projectStoreProxy = this.observeStore(projectStore);
    const [updatedProject, setUpdatedProject] = this.useState({ ...projectStoreProxy.project });

    return () => {
      const { project, level } = projectStoreProxy;
      return (
        <Card stretched>
          <Typography variant="h3">Project Settings</Typography>
          {project ? (
            <div>
              <Typography variant="label">Name</Typography>
              <Typography variant="body2">{project.name}</Typography>
              <Typography variant="label">Last Modified</Typography>
              <Typography variant="body2">
                <Date date={project.lastModified!.toDate()} />
              </Typography>
              <Typography variant="label">Last Published</Typography>
              <Typography variant="body2">
                <Date date={level?.lastModified?.toDate()} />
              </Typography>
              <Typography variant="label">Active on Startup</Typography>
              <Switch
                onClick={(e) => {
                  setUpdatedProject({ ...updatedProject(), activeOnStartup: !updatedProject().activeOnStartup }, false);
                }}
                checked={updatedProject().activeOnStartup}
              />
              <Typography variant="label">Start Event</Typography>
              <Input
                fullWidth
                value={updatedProject().startEvent}
                onChange={(e) => {
                  setUpdatedProject({ ...updatedProject(), startEvent: e }, false);
                }}
              />
              <div class="buttons">
                <div></div>
                <div>
                  <Button
                    fullWidth
                    onClick={(e) => {
                      projectStoreProxy.project = updatedProject() as IProject;
                      projectStore.updateProject();
                    }}
                  >
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
