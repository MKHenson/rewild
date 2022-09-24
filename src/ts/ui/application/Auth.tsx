import { Component, createSignal, onMount } from "solid-js";
import { styled } from "solid-styled-components";
import { authUI } from "../../../firebase";
import { EmailAuthProvider, GoogleAuthProvider } from "firebase/auth";
import { Avatar } from "../common/Avatar";
import { Popup } from "../common/Popup";
import { useAuth } from "../providers/AuthProvider";

type Props = {};

function initAuth() {
  authUI.start("#sign-in", {
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

export const Auth: Component<Props> = (props) => {
  const [menuOpen, setMenuOpen] = createSignal(false);
  const [hasLoggedOutOnce, setHasLoggedOutOnce] = createSignal(false);
  const { loggedIn, signOut } = useAuth();

  onMount(() => {
    initAuth();
  });

  const onClick = () => {
    if (loggedIn()) {
      signOut();
      setMenuOpen(false);
      setHasLoggedOutOnce(true);
    } else {
      if (hasLoggedOutOnce()) {
        authUI.reset();
      }

      initAuth();
      setMenuOpen(true);
    }
  };

  return (
    <StyledContainer>
      <Avatar src={loggedIn()?.photoURL || undefined} onClick={onClick} />
      <Popup
        open={menuOpen() && !loggedIn()}
        onClose={() => {
          setMenuOpen(false);
        }}
        withBackground
      >
        <div id="sign-in" />
      </Popup>
    </StyledContainer>
  );
};

const StyledContainer = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  padding: 1rem;

  .avatar {
    cursor: pointer;
  }

  #sign-in {
  }
`;
