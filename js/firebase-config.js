// ========================================
// FIREBASE CONFIG - ÍNTEGRO OFICIAL
// ========================================

const firebaseConfig = {

  apiKey: "AIzaSyBwqnPjj3b8DbTS-27J3p1SYIwGTX8W89g",

  authDomain: "integro-novo.firebaseapp.com",

  projectId: "integro-novo",

  storageBucket: "integro-novo.firebasestorage.app",

  messagingSenderId: "234462716664",

  appId: "1:234462716664:web:7a745f7dac04095161d10d"

};

// ========================================
// INICIALIZAR FIREBASE
// ========================================

if (!firebase.apps.length) {

  firebase.initializeApp(firebaseConfig);

}

// ========================================
// SERVIÇOS GLOBAIS
// ========================================

const auth = firebase.auth();

const db = firebase.firestore();

// Emuladores locais exigem ativacao explicita (?emulator=1). Assim, abrir o
// sistema em localhost para uso normal continua conectado ao Firebase real.
const integroEmAmbienteLocal = ["localhost", "127.0.0.1", "::1"].includes(
  String(window.location.hostname || "").toLowerCase()
);
const integroParametros = new URLSearchParams(window.location.search);
const integroParametroEmulator = integroParametros.get("emulator");

if (integroEmAmbienteLocal && integroParametroEmulator === "1") {
  sessionStorage.setItem("integro:usar-emulator", "1");
} else if (integroParametroEmulator === "0") {
  sessionStorage.removeItem("integro:usar-emulator");
}

const integroUsarEmulator = integroEmAmbienteLocal &&
  sessionStorage.getItem("integro:usar-emulator") === "1";

// ========================================
// FIRESTORE SETTINGS
// ========================================

db.settings({
  ignoreUndefinedProperties: true
});

if (integroUsarEmulator) {
  auth.useEmulator("http://127.0.0.1:9099", { disableWarnings: true });
  db.useEmulator("127.0.0.1", 8080);

  if (typeof firebase.storage === "function") {
    firebase.storage().useEmulator("127.0.0.1", 9199);
  }

  window.__INTEGRO_EMULATOR__ = Object.freeze({
    auth: "http://127.0.0.1:9099",
    firestore: "127.0.0.1:8080",
    storage: "127.0.0.1:9199"
  });
}

// ========================================
// AUTH SETTINGS
// ========================================

auth.setPersistence(
  firebase.auth.Auth.Persistence.LOCAL
);

// ========================================
// HELPERS GLOBAIS
// ========================================

window.auth = auth;
window.db = db;
