import { initializeApp } from "firebase/app";
import { getStorage } from "firebase/storage";
import { getMessaging, isSupported, type Messaging } from "firebase/messaging";

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

/** FCM Web Push VAPID public key (Firebase Console → Cloud Messaging → Web Push certificates). */
export const FCM_VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY?.trim() ?? "";

/** Returns a Messaging instance if the browser supports FCM (SW + Push API), else null. */
export async function getMessagingIfSupported(): Promise<Messaging | null> {
  try {
    if (!(await isSupported())) return null;
    return getMessaging(app);
  } catch {
    return null;
  }
}
