import { createSignal, createContext, useContext, Component, Accessor } from "solid-js";
import { onAuthStateChanged, signOut, signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../../firebase";

const AuthContext = createContext<AuthContext>();

interface AuthContext {
  loggedIn: Accessor<boolean>;
  loading: Accessor<boolean>;
  signOut: () => void;
  signIn: (email: string, password: string) => void;
}

export const AuthProvider: Component = (props) => {
  const [loggedIn, setLoggedIn] = createSignal(false);
  const [loading, setLoading] = createSignal(true);

  onAuthStateChanged(auth, (user) => {
    if (user) {
      setLoggedIn(true);
    } else {
      setLoggedIn(false);
    }
    setLoading(false);
  });

  const counter: AuthContext = {
    loggedIn,
    loading,
    signOut: async () => {
      setLoading(true);
      await signOut(auth);
    },
    signIn: async (email: string, password: string) => {
      setLoading(true);
      await signInWithEmailAndPassword(auth, email, password);
    },
  };

  return <AuthContext.Provider value={counter}>{props.children}</AuthContext.Provider>;
};

export function useCounter() {
  return useContext(AuthContext);
}
