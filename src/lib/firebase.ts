import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBns74VGgSMH2Cq4pv0zLlBQwZ9IVmIV5M",
  authDomain: "shoppinglist-7a66b.firebaseapp.com",
  projectId: "shoppinglist-7a66b",
  storageBucket: "shoppinglist-7a66b.firebasestorage.app",
  messagingSenderId: "160198112977",
  appId: "1:160198112977:web:673bcb89d68d8c55e677f0",
};

const firebaseApp = initializeApp(firebaseConfig);

export const firebaseAuth = getAuth(firebaseApp);
export const firestore = getFirestore(firebaseApp);
