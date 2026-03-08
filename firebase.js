// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Sua configuração (Cortex-FMVZ)
const firebaseConfig = {
  apiKey: "AIzaSyAUYDzhtKr5QJTAIYj0vJwajqksg2oETH4",
  authDomain: "cortex-fmvz.firebaseapp.com",
  projectId: "cortex-fmvz",
  storageBucket: "cortex-fmvz.firebasestorage.app",
  messagingSenderId: "340285417104",
  appId: "1:340285417104:web:4e09d58851caad5ec31a15"
};

// Inicializa o app
const app = initializeApp(firebaseConfig);

// Inicializa e exporta os serviços para usarmos no resto do site
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);