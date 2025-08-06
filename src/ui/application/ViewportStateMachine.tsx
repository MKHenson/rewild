import { Component, Pane3D, register } from 'rewild-ui';
import { Renderer } from 'rewild-renderer';
import { Player } from 'src/core/routing/Player';
import { InGameUI } from './InGameUI';

interface Props {}

@register('x-viewport-statemachine')
export class ViewportStateMachine extends Component<Props> {
  renderer: Renderer;
  hasInitialized: boolean = false;
  player: Player;

  init() {
    this.renderer = new Renderer();
    this.player = new Player('Player');

    const onUpdate = () => {
      (inGame as InGameUI).update();
    };

    const onCanvasReady = async (pane3D: Pane3D) => {
      try {
        if (this.hasInitialized) return; // Prevent re-initialization
        this.hasInitialized = true;

        await this.renderer.init(pane3D.canvas()!);

        this.renderer.onUpdate = onUpdate;

        this.player.cameraController = this.renderer.perspectiveCam;
      } catch (err: unknown) {
        console.error(err);
      }
    };

    const canvas = (<Pane3D onCanvasReady={onCanvasReady} />) as Pane3D;
    const inGame = <InGameUI player={this.player} />;
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
    this.renderer.onUpdate = null;
    this.renderer.dispose();
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
