import { Component, register } from "../../Component";
import { projectStore } from "../../stores/ProjectStore";
import { EditorGrid } from "./EditorGrid";

interface Props {
  onHome: () => void;
  projectId: string;
}

@register("x-editor")
export class Editor extends Component<Props> {
  constructor() {
    super({ useShadow: false });
  }

  init() {
    return () => <EditorGrid onHome={this.props.onHome} />;
  }

  connectedCallback(): void {
    projectStore.getProject(this.props.projectId);
    super.connectedCallback();
  }

  getStyle() {
    return css`
      x-editor {
        width: 100%;
        height: 100%;
        display: block;
      }
    `;
  }
}
