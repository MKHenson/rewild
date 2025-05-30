import { Component, register } from 'rewild-ui';
import { projectStore } from '../../stores/ProjectStore';
import { gameManager } from 'src/core/GameManager';
import { PaneManager } from './PaneManager';

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

    const paneManager = <PaneManager onHome={this.props.onHome} />;

    return () => paneManager;
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
