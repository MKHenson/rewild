import { authUI } from "../../../firebase";
import { EmailAuthProvider, GoogleAuthProvider } from "firebase/auth";
import { Avatar } from "../common/Avatar";
import { Popup } from "../common/Popup";
import { Component, register } from "../Component";
import { authStore } from "../stores/Auth";

type Props = {};

function initAuth(elm: Element) {
  authUI.start(elm, {
    signInFlow: "popup",
    callbacks: {
      signInSuccessWithAuthResult: () => false,
    },
    signInOptions: [
      { provider: EmailAuthProvider.PROVIDER_ID, signInMethod: EmailAuthProvider.EMAIL_LINK_SIGN_IN_METHOD },
      GoogleAuthProvider.PROVIDER_ID,
    ],
    // Other config options...
  });
}

@register("x-auth")
export class Auth extends Component<Props> {
  signInSection: HTMLDivElement | null = null;

  constructor() {
    super({ useShadow: false });
  }

  connectedCallback(): void {
    const elm = this.querySelector("#sign-in");
    if (elm) initAuth(elm);
  }

  init() {
    const auth = this.observeStore(authStore);
    const [menuOpen, setMenuOpen] = this.useState(false);
    const [hasLoggedOutOnce, setHasLoggedOutOnce] = this.useState(false);

    const onClick = () => {
      if (auth.loggedIn) {
        authStore.signOut();
        setMenuOpen(false);
        setHasLoggedOutOnce(true);
      } else {
        if (hasLoggedOutOnce()) {
          authUI.reset();
        }

        setMenuOpen(true);
        const elm = this.querySelector("#sign-in");
        if (elm) initAuth(elm);
      }
    };

    return () => {
      this.signInSection = (<div id="sign-in" />) as Node as HTMLDivElement;

      this.append(
        <div>
          <Avatar src={auth.user?.photoURL || undefined} onClick={onClick} />
          <Popup
            open={menuOpen() && !auth.user}
            onClose={() => {
              setMenuOpen(false);
            }}
            withBackground
          >
            {this.signInSection}
          </Popup>
        </div>
      );
    };
  }

  css() {
    return css`
      x-auth {
        position: absolute;
        top: 0;
        right: 0;
        padding: 1rem;
      }

      x-avatar {
        cursor: pointer;
      }
      #sign-in {
      }
    `;
  }
}
