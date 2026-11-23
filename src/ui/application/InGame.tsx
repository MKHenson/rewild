import { Component, register } from 'rewild-ui';
import { ViewportStateMachine } from './ViewportStateMachine';

interface Props {
  projectId: string;
  onQuit: () => void;
}

/**
 * A game session. The game owns its menus and changes level in place, so
 * this only makes the viewport.
 */
@register('x-in-game')
export class InGame extends Component<Props> {
  init() {
    const viewport = (
      <ViewportStateMachine
        projectId={this.props.projectId}
        onQuit={() => this.props.onQuit()}
      />
    ) as ViewportStateMachine;

    this.onCleanup = () => {
      viewport.dispose();
    };

    return () => <div>{viewport}</div>;
  }

  getStyle() {
    return StyledInGame;
  }
}

const StyledInGame = cssStylesheet(css`
  :host {
    width: 100%;
    height: 100%;
    margin: 0;
    top: 0;
    left: 0;
    position: absolute;
  }

  > div {
    width: 100%;
    height: 100%;
    margin: 0;
  }
`);
