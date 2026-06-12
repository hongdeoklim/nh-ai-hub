import { initializeApp } from "firebase/app";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  projectId: "nh-ai-hub-90829",
  appId: "1:200477728686:web:0dcbfabf6f7cfb607cf23f",
  storageBucket: "nh-ai-hub-90829.firebasestorage.app",
  apiKey: "AIzaSyALahAl8_UmqOEJQ7PpzvP1v53YOLKDZbA",
  authDomain: "nh-ai-hub-90829.firebaseapp.com",
  messagingSenderId: "200477728686",
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const storage = getStorage(app);
