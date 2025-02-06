import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

// Your Firebase configuration object
export const firebaseConfig = {
    apiKey: "your-api-key",
    authDomain: "whales-d0eeb.firebaseapp.com",
    databaseURL: "https://whales-d0eeb-default-rtdb.firebaseio.com",
    projectId: "whales-d0eeb",
    storageBucket: "whales-d0eeb.appspot.com",
    messagingSenderId: "your-messaging-sender-id",
    appId: "your-app-id"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const functions = getFunctions(app);

// Use this during local development
if (location.hostname === "localhost") {
    connectFunctionsEmulator(functions, "localhost", 5001);
} 