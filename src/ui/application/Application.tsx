import { Route, navigate, RouterSwitch, Component, register } from 'rewild-ui';
import { MainMenu } from './MainMenu';
import { ProjectEditorPage } from './project-editor/ProjectEditorPage';
import { InGame } from './InGame';
import { Auth } from './Auth';
import { ConfirmationModal } from './ConfirmationModal';
import { ResetPassword } from './ResetPassword';
import { SettingsPanel } from './SettingsPanel';
import { PerfPanel } from './PerfPanel';
import { AdminPage } from './admin/AdminPage';
import { LaunchPage } from './launch/LaunchPage';
import { resolveAssetUrl } from 'rewild-renderer/lib/managers/TextureManager';
import {
  audio,
  audioSettings,
  loadAudioTemplates,
} from '../../core/audio/audio';
import { registerAudioDebugCommands } from '../../core/debug/AudioDebugCommands';

interface Props {}

@register('x-application')
export class Application extends Component<Props> {
  init() {
    audio.startOnGesture(document);
    audio.suspendWhenHidden(document, () => audioSettings.muteInBackground);
    audioSettings.bindBackgroundMute(window);
    if (navigator.mediaDevices)
      audio.followOutputDevice(navigator.mediaDevices);
    loadAudioTemplates();
    registerAudioDebugCommands(audio);

    const onNewGame = () => {
      navigate('/launch');
    };

    const onPlay = (projectId: string) => {
      navigate(`/game/${projectId}`);
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

    const onAdmin = () => {
      navigate('/admin');
    };

    // App level rather than inside a route, so backquote opens it over the game
    // and the editor alike. It finds whichever renderer is mounted.
    const perfPanel = <PerfPanel />;

    const mainMenuBackgrounds = [
      'screenshots/understory-plains.webp',
      'screenshots/pelagic.jpg',
    ];

    const pickRandomBackground = () => {
      const index = Math.floor(Math.random() * mainMenuBackgrounds.length);
      return mainMenuBackgrounds[index];
    };

    const canvas = <div class="background" />;
    canvas.style.backgroundImage = `url(${resolveAssetUrl(
      pickRandomBackground()
    )})`;

    return () => {
      return [
        canvas,
        perfPanel,
        <RouterSwitch>
          <Route
            path="/"
            onRender={(params) => (
              <MainMenu
                open
                onStart={onNewGame}
                onOptions={onOptions}
                onEditor={onEditor}
                onAdmin={onAdmin}
              />
            )}
          />
          <Route
            path="/launch"
            onRender={() => <LaunchPage onStart={onPlay} onBack={onQuit} />}
          />
          <Route
            path="/settings"
            onRender={() => <SettingsPanel onClose={onQuit} />}
          />
          <Route
            path="/game/:project"
            onRender={(params) => (
              <InGame projectId={params.project} onQuit={onQuit} />
            )}
          />
          <Route
            path="/editor"
            onRender={(params) => <ProjectEditorPage onQuit={onQuit} />}
          />
          <Route
            path="/admin"
            onRender={() => <AdminPage onClose={onQuit} />}
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
