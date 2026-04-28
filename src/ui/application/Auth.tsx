import { Avatar, Popup, Component, register } from 'rewild-ui';
import { authStore } from '../stores/AuthStore';

type Props = {};

function initAuth(_elm: Element) {
  // Stub — sign-in UI to be implemented with Ktor JWT auth
}

@register('x-auth')
export class Auth extends Component<Props> {
  signInSection: HTMLDivElement | null = null;

  init() {
    const auth = this.observeStore(authStore);
    const [menuOpen, setMenuOpen] = this.useState(false);

    this.onMount = () => {
      const elm = this.shadow!.querySelector('#sign-in');
      if (elm) initAuth(elm);
    };

    const onClick = () => {
      if (auth.loggedIn) {
        authStore.signOut();
        setMenuOpen(false);
      } else {
        setMenuOpen(true);
        const elm = this.shadow!.querySelector('#sign-in');
        if (elm) {
          setTimeout(() => (elm.className = 'fadein'), 30);
          initAuth(elm);
        }
      }
    };

    return () => {
      this.signInSection = (<div id="sign-in" />) as Node as HTMLDivElement;

      return (
        <div>
          <Avatar src={auth.user?.photoURL || undefined} onClick={onClick} />
          <Popup
            open={menuOpen() && !auth.user}
            onClose={() => {
              setMenuOpen(false);
            }}
            withBackground>
            {this.signInSection}
          </Popup>
        </div>
      );
    };
  }

  getStyle() {
    return css`
      :host {
        position: absolute;
        top: 0;
        right: 0;
        padding: 1rem;
      }

      x-avatar {
        cursor: pointer;
      }

      #sign-in {
        transition: opacity 1s;
        opacity: 0;
      }

      #sign-in.fadein {
        opacity: 1;
      }
    `;
  }
}
