// import { Modal } from "../common/Modal";
// import { Button } from "../common/Button";
// import { Typography } from "../common/Typography";
// import { MaterialIcon } from "../common/MaterialIcon";
// import { useAuth } from "../AuthProvider";
// import { Loading } from "../common/Loading";
// import { Component } from "../Component";

// type Props = {
//   open: boolean;
//   onStart: () => void;
//   onEditor: () => void;
// };

// export class MainMenu extends Component<Props> {
//   init() {
//     return () => {
//       const onOptionsClick = () => {};
//       const { loading, loggedIn } = useAuth()!;
//       const props = this.props;

//       this.shadow!.append(
//         <Modal
//           hideConfirmButtons
//           open={props.open}
//           title={
//             <Typography
//               variant="h2"
//               style={css`
//                 text-align: center;
//                 margin: 0;
//               `}
//             >
//               Rewild
//             </Typography>
//           }
//         >
//           <div class="tag-line">
//             <Typography variant="light">
//               Welcome to rewild. A game about exploration, natural history and saving the planet
//             </Typography>
//           </div>
//           {loading() ? (
//             <div
//               style={css`
//                 text-align: center;
//               `}
//             >
//               <Loading />
//             </div>
//           ) : (
//             <div class="styled-buttons">
//               <Button onClick={props.onStart} fullWidth>
//                 New Game
//               </Button>
//               <Button onClick={onOptionsClick} fullWidth disabled>
//                 Options
//               </Button>
//               <Button
//                 disabled={!loggedIn() || loggedIn()?.email !== "mat@webinate.net"}
//                 onClick={props.onEditor}
//                 fullWidth
//               >
//                 <MaterialIcon size="s" icon="build_circle" /> Editor
//               </Button>
//             </div>
//           )}
//         </Modal>
//       );
//     };
//   }

//   css() {
//     return css`
//       .styled-buttons x-button {
//         margin: 1rem 0 0 0;
//       }

//       .tag-line .light {
//         margin: 0 auto 2rem auto;
//         width: 70%;
//         text-align: center;
//       }
//     `;
//   }
// }
