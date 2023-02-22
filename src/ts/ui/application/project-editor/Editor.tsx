import { Component, register } from "../../Component";
import { projectStore } from "../../stores/Project";
import { EditorGrid } from "./EditorGrid";

interface Props {
  onHome: () => void;
  projectId: string;
}

@register("x-editor")
export class Editor extends Component<Props> {
  init() {
    return () => <EditorGrid onHome={this.props.onHome} />;
  }

  connectedCallback(): void {
    projectStore.getProject(this.props.projectId);
    super.connectedCallback();
  }
}
