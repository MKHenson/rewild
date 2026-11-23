import { Component, register } from 'rewild-ui';
import { ViewportStateMachine } from './ViewportStateMachine';

interface Props {
  projectId: string;
  onQuit: () => void;
}

/**
 * A game session. The game owns its menus, so this only makes the viewport,
 * and makes it again to restart or to travel to another level.
 */
@register('x-in-game')
export class InGame extends Component<Props> {
  init() {
    const [levelId, setLevelId] = this.useState<string | undefined>(undefined);

    const createViewport = () =>
      (
        <ViewportStateMachine
          projectId={this.props.projectId}
          levelId={levelId()}
          onTravel={onTravel}
          onRestart={onRestart}
          onQuit={onQuit}
        />
      ) as ViewportStateMachine;

    const onRestart = () => {
      viewport.dispose();
      viewport = createViewport();
      this.render();
    };

    const onTravel = (target: string) => {
      viewport.dispose();
      setLevelId(target, false);
      viewport = createViewport();
      this.render();
    };

    const onQuit = () => {
      this.props.onQuit();
    };

    this.onCleanup = () => {
      viewport.dispose();
    };

    let viewport = createViewport();

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
