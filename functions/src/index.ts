import { onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { ILevel } from "models";

import * as admin from "firebase-admin";

// The Firebase Admin SDK to access Firestore.
admin.initializeApp();

// Start writing Firebase Functions
// https://firebase.google.com/docs/functions/typescript

export const helloworld = onCall<ILevel>({ cors: false }, (data) => {
  logger.info("we are in the function boyiiii", { structuredData: true });
  return data.data;
});
