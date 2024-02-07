import {
  Pane3D,
  Route,
  navigate,
  RouterSwitch,
  Component,
  register,
  InfoBox,
} from 'rewild-ui';
import { MainMenu } from './MainMenu';
import { ProjectEditorPage } from './project-editor/ProjectEditorPage';
import { ErrorType, StartError } from './StartError';
import { InGame } from './InGame';
import { Auth } from './Auth';
import { gameManager } from '../../core/GameManager';

interface Props {}

@register('x-application')
export class Application extends Component<Props> {
  init() {
    const [errorType, setErrorType] = this.useState<ErrorType>('OTHER');
    const [errorMessage, setErrorMessage] = this.useState('');
    const [ready, setReady] = this.useState(false);

    const onStart = async () => {
      navigate('/game');
      await gameManager.onStart();
    };

    const onEditor = () => {
      navigate('/editor');
    };

    const onQuit = () => {
      navigate('/');
      gameManager.onQuit();
    };

    const onCanvasReady = async (canvas: Pane3D) => {
      if (gameManager.renderer) return;

      try {
        const hasWebgGPU = await gameManager.applicationStarted(canvas);

        if (!hasWebgGPU) {
          setErrorMessage('Your browser does not support WebGPU');
          setErrorType('WGPU');
          return;
        }

        setReady(true);
      } catch (err: unknown) {
        setErrorMessage(
          'An Error occurred while setting up the scene. Please check the console for more info.'
        );
        setErrorType('OTHER');
        console.log(err);
      }
    };

    const canvas = (<Pane3D onCanvasReady={onCanvasReady} />) as Pane3D;

    return () => {
      if (errorMessage())
        return (
          <InfoBox title="Error" variant="error">
            {errorMessage()}
          </InfoBox>
        );

      return [
        canvas,
        <RouterSwitch>
          <Route
            path="/"
            onRender={(params) =>
              errorMessage() !== '' ? (
                <StartError
                  open
                  errorMsg={errorMessage()}
                  errorType={errorType()}
                />
              ) : (
                <MainMenu open onStart={onStart} onEditor={onEditor} />
              )
            }
          />
          {ready() ? (
            <Route
              path="/game"
              onRender={() => (
                <InGame
                  renderer={gameManager.renderer!}
                  eventManager={gameManager.eventManager!}
                  onQuit={onQuit}
                />
              )}
            />
          ) : undefined}

          {ready() ? (
            <Route
              path="/editor"
              onRender={(params) => (
                <ProjectEditorPage
                  onQuit={onQuit}
                  renderer={gameManager.renderer!}
                  eventManager={gameManager.eventManager!}
                />
              )}
            />
          ) : undefined}
        </RouterSwitch>,
        <Auth />,
      ];
    };
  }

  getStyle() {
    return css`
      :host {
        width: 100%;
        height: 100%;
        margin: 0;
        display: block;
      }
    `;
  }
}
