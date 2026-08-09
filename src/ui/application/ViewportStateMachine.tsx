import { Component, Pane3D, register } from 'rewild-ui';
import { Renderer } from 'rewild-renderer';
import { Player } from 'src/core/routing/Player';
import { InGameUI } from './InGameUI';
import { GameManager } from 'src/core/GameManager';

interface Props {
  onUnlock: () => void;
}

@register('x-viewport-statemachine')
export class ViewportStateMachine extends Component<Props> {
  gameManager: GameManager;
  player: Player;

  init() {
    this.player = new Player('Player');
    this.gameManager = new GameManager(this.player, this.props.onUnlock);

    const onFrame = () => {
      inGame.update();
      this.gameManager.onUpdate();

      if (!this.gameManager.renderer.disposed)
        window.requestAnimationFrame(onFrame);
    };

    const onCanvasReady = async (pane3D: Pane3D) => {
      const initialized = await this.gameManager.init(pane3D);
      this.gameManager.onUnlock = this.props.onUnlock;
      if (initialized) window.requestAnimationFrame(onFrame);
    };

    // Answers getActiveRenderer() the same way the editor viewport does, so UI
    // that touches the renderer — the settings panel — works in a game session
    // as well as in the editor.
    const onRequestRendererEvent = (event: Event) => {
      const detail = (event as CustomEvent).detail as {
        renderer: Renderer | null;
      };
      detail.renderer = this.gameManager.renderer;
    };

    this.onMount = () => {
      document.addEventListener('request-renderer', onRequestRendererEvent);
    };

    this.onCleanup = () => {
      document.removeEventListener('request-renderer', onRequestRendererEvent);
    };

    const canvas = (<Pane3D onCanvasReady={onCanvasReady} />) as Pane3D;
    const inGame = (<InGameUI player={this.player} />) as InGameUI;
    const toReturn = (
      <div class="container">
        {canvas}
        {inGame}
      </div>
    );

    return () => toReturn;
  }

  getStyle() {
    return StyledInGame;
  }

  dispose() {
    this.gameManager.dispose();
  }
}

const StyledInGame = cssStylesheet(css`
  :host {
    width: 100vw;
    height: 100vh;
    display: block;
  }

  .container {
    width: 100%;
    height: 100%;
  }
`);
