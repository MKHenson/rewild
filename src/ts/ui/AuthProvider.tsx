import { createSignal, createContext, useContext, Component, Accessor, ParentProps } from "solid-js";
import { onAuthStateChanged, User, signOut, signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../firebase";

const AuthContext = createContext<AuthContext>();

interface AuthContext {
  loggedIn: Accessor<User | null>;
  loading: Accessor<boolean>;
  signOut: () => void;
  signIn: (email: string, password: string) => void;
}

export const AuthProvider: Component<ParentProps> = (props) => {
  const [loggedIn, setLoggedIn] = createSignal<User | null>(null);
  const [loading, setLoading] = createSignal(true);

  onAuthStateChanged(auth, (user) => {
    if (user) {
      setLoggedIn(user);
    } else {
      setLoggedIn(null);
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

export function useAuth() {
  return useContext(AuthContext)!;
}
