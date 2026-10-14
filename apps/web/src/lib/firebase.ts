import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

// Public web config — identifies the Firebase project, not a secret. Access is enforced by the API's team list.
const app = initializeApp({
  apiKey: "AIzaSyCNuOTAHSCjh06-YyKXpU6pwDjagP3rXkw",
  authDomain: "theoysterstudios-crm-staging.firebaseapp.com",
  projectId: "theoysterstudios-crm-staging",
  appId: "1:263893568719:web:731daa9baeba397ac27bba",
  messagingSenderId: "263893568719",
});

export const auth = getAuth(app);
export const google = new GoogleAuthProvider();
google.setCustomParameters({ prompt: "select_account" });
