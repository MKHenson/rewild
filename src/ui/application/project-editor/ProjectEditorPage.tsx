import { Editor } from './Editor';
import { ProjectSelector } from './projectSelector/ProjectSelector';
import { navigate, RouterSwitch, Route, Component, register } from 'rewild-ui';

interface Props {
  onQuit: () => void;
}

@register('x-project-editor-page')
export class ProjectEditorPage extends Component<Props> {
  init() {
    const onHomeClick = () => {
      this.props.onQuit();
    };

    this.onMount = () => {};

    return () => (
      <RouterSwitch>
        <Route
          exact
          path="/editor"
          onRender={(params) => (
            <ProjectSelector
              onBack={onHomeClick}
              open
              onOpen={(uid) => navigate(`/editor/${uid}`)}
            />
          )}
        />
        <Route
          path="/editor/:project"
          onRender={(params) => (
            <Editor onHome={onHomeClick} projectId={params.project} />
          )}
        />
      </RouterSwitch>
    );
  }

  getStyle() {
    return css`
      :host {
        height: 100%;
        width: 100%;
        top: 0;
        left: 0;
        position: absolute;
        display: block;
        box-sizing: border-box;
      }
    `;
  }
}
