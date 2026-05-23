import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyCIKc2a6OE3UUcAWSOp5RXTldXOPPpMbBw',
  authDomain: 'opt-poker.firebaseapp.com',
  projectId: 'opt-poker',
  storageBucket: 'opt-poker.firebasestorage.app',
  messagingSenderId: '1036456986972',
  appId: '1:1036456986972:web:52b3dc4587ee35285ed999',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
