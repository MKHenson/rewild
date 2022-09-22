import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { auth as UIAuth } from "firebaseui";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBZduJ1GmPdMR2TBqV0ukBkeqG91vlP9Lg",
  authDomain: "rewild-96f5b.firebaseapp.com",
  projectId: "rewild-96f5b",
  storageBucket: "rewild-96f5b.appspot.com",
  messagingSenderId: "790922805889",
  appId: "1:790922805889:web:13bbff536b49f6200c8380",
  measurementId: "G-5JW3NFQVC1",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const auth = getAuth(app);
export const authUI = new UIAuth.AuthUI(auth);
