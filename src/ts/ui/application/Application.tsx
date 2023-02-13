// // import { Component, createSignal, Show } from "solid-js";
// // import { styled } from "solid-styled-components";
// // import { Routes, Route, useNavigate } from "@solidjs/router";
// // import { IBindable } from "src/ts/core/IBindable";
// // import { UIEventManager } from "../../core/UIEventManager";
// // import { Renderer } from "../../renderer/Renderer";
// // import { GameLoader } from "../../core/GameLoader";
// // import { WasmManager } from "../../core/WasmManager";
// // import { Pane3D } from "../common/Pane3D";
// // import { MainMenu } from "./MainMenu";
// // import { ApplicationEventType } from "../../../common/EventTypes";
// // import { ProjectEditorPage } from "./project-editor/ProjectEditorPage";
// import { ErrorType, StartError } from "./StartError";
// // import { Auth } from "./Auth";
// // import { InGame } from "./InGame";

// import { Route } from "../common/Route";
// import { RouterSwitch } from "../common/RouterSwitch";
// import { Component } from "../Component";

// interface Props {}

// export class Application extends Component<Props> {
//   init() {
//     return () => {
//       // let renderer: Renderer;
//       const [errorType] = this.useState<ErrorType>("OTHER"); // setErrorType
//       const [errorMessage] = this.useState(""); // , setErrorMessage
//       // const [ready] = this.useState(false); // , setReady

//       this.shadow!.append(
//         <div>
//           {/* <Pane3D onCanvasReady={onCanvasReady} /> */}

//           <RouterSwitch>
//             <Route
//               path="/"
//               onRender={(params) =>
//                 errorMessage() === "" ? (
//                   <StartError open errorMsg={errorMessage()} errorType={errorType()} />
//                 ) : (
//                   <MainMenu open onStart={onStart} onEditor={onEditor} />
//                 )
//               }
//             />
//             {/* { ready() ?
//                     <div>
//                             <Route
//                             path="/game"
//                             element={<InGame renderer={renderer!} eventManager={eventManager!} onQuit={onQuit} />}
//                             />
//                             <Route
//                             path="/editor/*"
//                             element={<ProjectEditorPage onQuit={onQuit} renderer={renderer!} eventManager={eventManager!} />}
//                             />
//                             </div>
//                      : ''
//                     } */}
//           </RouterSwitch>
//           {/* <Auth /> */}
//         </div>
//       );
//     };
//   }

//   //   const [errorType, setErrorType] = createSignal<ErrorType>("OTHER");
//   //   const navigate = useNavigate();

//   //   let gameLoader: GameLoader;
//   //   let eventManager: UIEventManager;
//   //   const wasmManager: WasmManager = new WasmManager();

//   //   const onCanvasReady = async (canvas: HTMLCanvasElement) => {
//   //     renderer = new Renderer(canvas);
//   //     gameLoader = new GameLoader(renderer);
//   //     eventManager = new UIEventManager();

//   //     const bindables: IBindable[] = [renderer, eventManager];

//   //     try {
//   //       await wasmManager.load(bindables);

//   //       if (!renderer.hasWebGPU()) {
//   //         setErrorMessage("Your browser does not support WebGPU");
//   //         setErrorType("WGPU");
//   //         return;
//   //       }

//   //       await renderer.init();
//   //       await gameLoader.loadInitialContainers();

//   //       // Call the first frame so the containers can initialize
//   //       renderer.onFrame();

//   //       setReady(true);
//   //     } catch (err: unknown) {
//   //       setErrorMessage("An Error occurred while setting up the scene. Please check the console for more info.");
//   //       setErrorType("OTHER");
//   //       console.log(err);
//   //     }
//   //   };

//   //   const onStart = async () => {
//   //     navigate("/game");
//   //     await gameLoader.loadInitialLevels();
//   //     eventManager.triggerUIEvent(ApplicationEventType.StartGame);
//   //   };

//   //   const onEditor = () => {
//   //     navigate("/editor");
//   //   };

//   //   const onQuit = () => {
//   //     navigate("/");
//   //     gameLoader.unloadInitialLevels();
//   //     eventManager.triggerUIEvent(ApplicationEventType.Quit);
//   //   };

//   css() {
//     return css`
//       width: 100%;
//       height: 100%;
//       margin: 0;
//     `;
//   }
// }
