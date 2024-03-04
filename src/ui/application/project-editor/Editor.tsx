import { Component, register } from 'rewild-ui';
import { projectStore } from '../../stores/ProjectStore';
import { EditorGrid } from './EditorGrid';
import { gameManager } from 'src/core/GameManager';

interface Props {
  onHome: () => void;
  projectId: string;
}

@register('x-editor')
export class Editor extends Component<Props> {
  constructor() {
    super({ useShadow: false });
  }

  init() {
    this.onMount = () => {
      projectStore.getProject(this.props.projectId);
      gameManager.onEnterEditorMode();
    };

    return () => <EditorGrid onHome={this.props.onHome} />;
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
