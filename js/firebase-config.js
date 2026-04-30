// Firebase Config - ÍNTEGRO OFICIAL

const firebaseConfig = {
  apiKey: "AIzaSyBwqnPjj3b8DbTS-27J3p1SYIwGTX8W89g",
  authDomain: "integro-novo.firebaseapp.com",
  projectId: "integro-novo",
  storageBucket: "integro-novo.firebasestorage.app",
  messagingSenderId: "234462716664",
  appId: "1:234462716664:web:7a745f7dac04095161d10d"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);

// Inicializar serviços
const auth = firebase.auth();
const db = firebase.firestore();