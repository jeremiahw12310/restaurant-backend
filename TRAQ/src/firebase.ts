import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDOzTnrm_ym-kDal9ymk3dlDidih9nVdXM",
  authDomain: "traq-caab9.firebaseapp.com",
  projectId: "traq-caab9",
  storageBucket: "traq-caab9.firebasestorage.app",
  messagingSenderId: "243250182808",
  appId: "1:243250182808:web:0de888e4d93526e1afaeed",
  measurementId: "G-C2WKHWK360"
}

// Initialize synchronously (modern browsers only; legacy is no longer supported)
const app = initializeApp(firebaseConfig)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db: any = getFirestore(app)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const storage: any = getStorage(app)
const waitForFirebase = (): Promise<void> => Promise.resolve()

// Get Firebase connection status
const getFirebaseStatus = async (): Promise<{ connected: boolean; error?: string }> => {
  await waitForFirebase()
  return { connected: db !== null, error: db ? undefined : 'Firestore not initialized' }
}

export { db, waitForFirebase, getFirebaseStatus }
export { storage }



