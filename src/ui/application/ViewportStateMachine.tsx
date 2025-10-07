import { Component, Pane3D, register } from 'rewild-ui';
import { Renderer } from 'rewild-renderer';
import { Player } from 'src/core/routing/Player';
import { InGameUI } from './InGameUI';
import { StateMachine } from 'rewild-routing';
import { Clock } from 'src/core/Clock';
import { loadInitialLevels } from 'src/core/GameLoader';
import { StateMachineData } from 'src/core/routing/Types';

interface Props {}

@register('x-viewport-statemachine')
export class ViewportStateMachine extends Component<Props> {
  renderer: Renderer;
  stateMachine: StateMachine<StateMachineData> | null;
  hasInitialized: boolean = false;
  player: Player;

  init() {
    this.renderer = new Renderer();
    this.player = new Player('Player');
    const clock = new Clock();

    const onFrame = () => {
      // Update UI
      inGame.update();

      const delta = clock.getDelta();
      const total = clock.getElapsedTime();

      this.stateMachine?.OnLoop(delta, total);
      this.renderer.onFrame();

      if (!this.renderer.disposed) window.requestAnimationFrame(onFrame);
    };

    const onCanvasReady = async (pane3D: Pane3D) => {
      try {
        if (this.hasInitialized) return; // Prevent re-initialization
        this.hasInitialized = true;

        await this.renderer.init(pane3D.canvas()!, false);
        this.player.setCamera(this.renderer.perspectiveCam);
        this.stateMachine = await loadInitialLevels(this.player, this.renderer);

        if (!this.stateMachine) throw new Error('Could not load statemachine');

        // Start the rendering loop
        window.requestAnimationFrame(onFrame);
        clock.start();
      } catch (err: unknown) {
        console.error(err);
      }
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
    this.stateMachine?.dispose();
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
