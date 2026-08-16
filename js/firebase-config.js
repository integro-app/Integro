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

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

const integroEmAmbienteLocal = ["localhost", "127.0.0.1", "::1"].includes(String(window.location.hostname || "").toLowerCase());
const integroParametros = new URLSearchParams(window.location.search);
const integroParametroEmulator = integroParametros.get("emulator");
const integroPaginaAtual = String(window.location.pathname || "").toLowerCase();
const integroPaginaLogin = integroPaginaAtual === "/" || integroPaginaAtual.endsWith("/index.html");

if (integroEmAmbienteLocal && integroParametroEmulator === "1") {
  sessionStorage.setItem("integro:usar-emulator", "1");
} else if (integroParametroEmulator === "0" || (integroEmAmbienteLocal && integroPaginaLogin)) {
  sessionStorage.removeItem("integro:usar-emulator");
}

const integroUsarEmulator = integroEmAmbienteLocal && sessionStorage.getItem("integro:usar-emulator") === "1";

if (integroUsarEmulator) {
  auth.useEmulator("http://127.0.0.1:9099", { disableWarnings: true });
  db.useEmulator("127.0.0.1", 8080);
  if (typeof firebase.storage === "function") firebase.storage().useEmulator("127.0.0.1", 9199);
  window.__INTEGRO_EMULATOR__ = Object.freeze({ auth: "http://127.0.0.1:9099", firestore: "127.0.0.1:8080", storage: "127.0.0.1:9199" });
}

auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch((erro) => {
  console.error("[ÍNTEGRO] Erro ao configurar persistência do Auth:", erro);
});

console.info("[ÍNTEGRO Firebase]", { ambiente: window.location.hostname, projeto: firebaseConfig.projectId, emulator: integroUsarEmulator, versao: "27" });

window.auth = auth;
window.db = db;

// V27: carrega as políticas transversais sem exigir alterações em cada página legado.
(function carregarBootstrapV27() {
  if (document.querySelector('script[data-integro-v27-bootstrap="1"]')) return;
  const script = document.createElement("script");
  script.src = "js/v27-bootstrap.js?v=20260816-v27-1";
  script.async = false;
  script.dataset.integroV27Bootstrap = "1";
  document.head.appendChild(script);
})();
