// import { Editor } from "./Editor";
import { Renderer } from "../../../renderer/Renderer";
import { UIEventManager } from "../../../core/UIEventManager";
import { ApplicationEventType } from "../../../../common/EventTypes";
import { ProjectSelector } from "./projectSelector/ProjectSelector";
import { Component, register } from "../../Component";
import { Route } from "../../common/Route";
import { RouterSwitch } from "../../common/RouterSwitch";
import { navigate } from "../../common/RouterProvider";

interface Props {
  renderer: Renderer;
  eventManager: UIEventManager;
  onQuit: () => void;
}

@register("x-project-editor-page")
export class ProjectEditorPage extends Component<Props> {
  init() {
    const onHomeClick = () => {
      this.props.onQuit();
    };

    return () => (
      <RouterSwitch>
        <Route
          path="/editor"
          onRender={(params) => (
            <ProjectSelector onBack={onHomeClick} open onOpen={(uid) => navigate(`/editor/${uid}`)} />
          )}
        />
        <Route path="/editor/:project" onRender={(params) => <div>EDITOR</div>} />
      </RouterSwitch>
    );
  }

  // <Editor onHome={onHomeClick} />

  connectedCallback() {
    super.connectedCallback();
    this.props.eventManager.triggerUIEvent(ApplicationEventType.StartEditor);
  }

  getStyle() {
    return css`
      :host {
        height: 100%;
        width: 100%;
        top: 0;
        left: 0;
        position: absolute;
        display: flex;
        box-sizing: border-box;
      }
    `;
  }
}
