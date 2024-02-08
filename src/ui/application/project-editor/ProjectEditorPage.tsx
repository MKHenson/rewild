import { Editor } from './Editor';
import { Renderer } from '../../../core/renderer/Renderer';
import { UIEventManager } from '../../../core/UIEventManager';
import { ApplicationEventType } from 'rewild-common';
import { ProjectSelector } from './projectSelector/ProjectSelector';
import { navigate, RouterSwitch, Route, Component, register } from 'rewild-ui';

interface Props {
  renderer: Renderer;
  eventManager: UIEventManager;
  onQuit: () => void;
}

@register('x-project-editor-page')
export class ProjectEditorPage extends Component<Props> {
  init() {
    const onHomeClick = () => {
      this.props.onQuit();
    };

    this.onMount = () => {
      this.props.eventManager.triggerUIEvent(ApplicationEventType.StartEditor);
    };

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
