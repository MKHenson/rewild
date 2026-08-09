import { Route, navigate, RouterSwitch, Component, register } from 'rewild-ui';
import { MainMenu } from './MainMenu';
import { ProjectEditorPage } from './project-editor/ProjectEditorPage';
import { InGame } from './InGame';
import { Auth } from './Auth';
import { ConfirmationModal } from './ConfirmationModal';
import { ResetPassword } from './ResetPassword';
import { SettingsPanel } from './SettingsPanel';
import { resolveAssetUrl } from 'rewild-renderer/lib/managers/TextureManager';

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

    const onOptions = () => {
      navigate('/settings');
    };

    const onQuit = () => {
      navigate('/');
    };

    const canvas = <div class="background" />;
    canvas.style.backgroundImage = `url(${resolveAssetUrl('strata-bg.jpg')})`;

    return () => {
      return [
        canvas,
        <RouterSwitch>
          <Route
            path="/"
            onRender={(params) => (
              <MainMenu
                open
                onStart={onStart}
                onOptions={onOptions}
                onEditor={onEditor}
              />
            )}
          />
          <Route
            path="/settings"
            onRender={() => <SettingsPanel onClose={onQuit} />}
          />
          <Route path="/game" onRender={() => <InGame onQuit={onQuit} />} />
          <Route
            path="/editor"
            onRender={(params) => <ProjectEditorPage onQuit={onQuit} />}
          />
          <Route path="/reset-password" onRender={() => <ResetPassword />} />
        </RouterSwitch>,
        <Auth />,
        <ConfirmationModal />,
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
        background-size: cover;
        background-position: center;
      }
    `;
  }
}
