import { initializeApp, FirebaseOptions } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { auth as UIAuth } from "firebaseui";
import { collection, QueryDocumentSnapshot, DocumentData, SnapshotOptions } from "firebase/firestore";
import { IProject } from "models";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig: FirebaseOptions = {
  apiKey: "AIzaSyBZduJ1GmPdMR2TBqV0ukBkeqG91vlP9Lg",
  authDomain: "rewild-96f5b.firebaseapp.com",
  projectId: "rewild-96f5b",
  storageBucket: "rewild-96f5b.appspot.com",
  messagingSenderId: "790922805889",
  appId: "1:790922805889:web:13bbff536b49f6200c8380",
  measurementId: "G-5JW3NFQVC1",
};

if (location.hostname === "127.0.0.1") {
  firebaseConfig.databaseURL = "http://localhost:8080?ns=emulatorui";
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const auth = getAuth(app);
export const authUI = new UIAuth.AuthUI(auth);
export const db = getFirestore(app);

if (location.hostname === "127.0.0.1") {
  connectFirestoreEmulator(db, "localhost", 8080);
}

const converter = <T>() => ({
  toFirestore: (data: T) => data,
  fromFirestore: (snapshot: QueryDocumentSnapshot<DocumentData>, options?: SnapshotOptions) => snapshot.data() as T,
});

export const dbs = {
  projects: collection(db, "projects").withConverter<IProject>(converter<IProject>()),
};
