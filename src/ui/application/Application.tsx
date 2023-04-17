import { IBindable } from "src/core/IBindable";
import { UIEventManager } from "../../core/UIEventManager";
import { Renderer } from "../../renderer/Renderer";
import { GameLoader } from "../../core/GameLoader";
import { WasmManager } from "../../core/WasmManager";
import { Pane3D } from "rewild-ui/lib/common/Pane3D";
import { MainMenu } from "./MainMenu";
import { ApplicationEventType } from "rewild-common";
import { ProjectEditorPage } from "./project-editor/ProjectEditorPage";
import { ErrorType, StartError } from "./StartError";
import { InGame } from "./InGame";
import { Route } from "rewild-ui/lib/common/Route";
import { navigate } from "rewild-ui/lib/common/RouterProvider";
import { RouterSwitch } from "rewild-ui/lib/common/RouterSwitch";
import { Component, register } from "rewild-ui/lib/Component";
import { Auth } from "./Auth";

interface Props {}

@register("x-application")
export class Application extends Component<Props> {
  init() {
    let renderer: Renderer;
    const [errorType, setErrorType] = this.useState<ErrorType>("OTHER");
    const [errorMessage, setErrorMessage] = this.useState("");
    const [ready, setReady] = this.useState(false);

    let gameLoader: GameLoader;
    let eventManager: UIEventManager;
    const wasmManager: WasmManager = new WasmManager();

    const onStart = async () => {
      navigate("/game");
      await gameLoader.loadInitialLevels();
      eventManager.triggerUIEvent(ApplicationEventType.StartGame);
    };

    const onEditor = () => {
      navigate("/editor");
    };

    const onQuit = () => {
      navigate("/");
      gameLoader.unloadInitialLevels();
      eventManager.triggerUIEvent(ApplicationEventType.Quit);
    };

    const onCanvasReady = async (canvas: Pane3D) => {
      if (renderer) return;

      renderer = new Renderer(canvas);
      gameLoader = new GameLoader(renderer);
      eventManager = new UIEventManager();

      const bindables: IBindable[] = [renderer, eventManager];

      try {
        await wasmManager.load(bindables);

        if (!renderer.hasWebGPU()) {
          setErrorMessage("Your browser does not support WebGPU");
          setErrorType("WGPU");
          return;
        }

        await renderer.init();
        await gameLoader.loadInitialContainers();

        // Call the first frame so the containers can initialize
        renderer.onFrame();

        setReady(true);
      } catch (err: unknown) {
        setErrorMessage("An Error occurred while setting up the scene. Please check the console for more info.");
        setErrorType("OTHER");
        console.log(err);
      }
    };

    const canvas = (<Pane3D onCanvasReady={onCanvasReady} />) as Pane3D;

    return () => {
      return [
        canvas,
        <RouterSwitch>
          <Route
            path="/"
            onRender={(params) =>
              errorMessage() !== "" ? (
                <StartError open errorMsg={errorMessage()} errorType={errorType()} />
              ) : (
                <MainMenu open onStart={onStart} onEditor={onEditor} />
              )
            }
          />
          {ready() ? (
            <Route
              path="/game"
              onRender={() => <InGame renderer={renderer!} eventManager={eventManager!} onQuit={onQuit} />}
            />
          ) : undefined}

          {ready() ? (
            <Route
              path="/editor"
              onRender={(params) => (
                <ProjectEditorPage onQuit={onQuit} renderer={renderer!} eventManager={eventManager!} />
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
