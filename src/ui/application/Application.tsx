import { Route, navigate, RouterSwitch, Component, register } from 'rewild-ui';
import { MainMenu } from './MainMenu';
import { ProjectEditorPage } from './project-editor/ProjectEditorPage';
import { InGame } from './InGame';
import { Auth } from './Auth';

interface Props {}

@register('x-application')
export class Application extends Component<Props> {
  init() {
    const onStart = async () => {
      navigate('/game');
    };

    const onEditor = () => {
      navigate('/editor');
    };

    const onQuit = () => {
      navigate('/');
    };

    const canvas = <div class="background" />;

    return () => {
      return [
        canvas,
        <RouterSwitch>
          <Route
            path="/"
            onRender={(params) => (
              <MainMenu open onStart={onStart} onEditor={onEditor} />
            )}
          />
          <Route path="/game" onRender={() => <InGame onQuit={onQuit} />} />
          <Route
            path="/editor"
            onRender={(params) => <ProjectEditorPage onQuit={onQuit} />}
          />
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

      .background {
        height: 100%;
        background-image: url('/earth.jpg');
        background-size: cover;
        background-position: center;
      }
    `;
  }
}
