// AUTH ÍNTEGRO - LOGIN OFICIAL

async function login() {
  const email = document.getElementById("email").value.trim();
  const senha = document.getElementById("senha").value.trim();

  if (!email || !senha) {
    alert("Preencha email e senha.");
    return;
  }

  try {
    const credencial = await firebase.auth().signInWithEmailAndPassword(email, senha);
    const authUser = credencial.user;

    const db = firebase.firestore();

    // Busca primeiro pelo authUid
    let snap = await db.collection("usuarios")
      .where("authUid", "==", authUser.uid)
      .limit(1)
      .get();

    // Se não achar, tenta pelo email
    if (snap.empty) {
      snap = await db.collection("usuarios")
        .where("email", "==", authUser.email)
        .limit(1)
        .get();
    }

    if (snap.empty) {
      alert("Usuário autenticado, mas não cadastrado no sistema.");
      await firebase.auth().signOut();
      return;
    }

    const doc = snap.docs[0];
    const usuario = {
      id: doc.id,
      ...doc.data()
    };

    if (usuario.status !== "ATIVO") {
      alert("Usuário inativo ou bloqueado.");
      await firebase.auth().signOut();
      return;
    }

    if (usuario.acessoLiberado === false) {
      alert("Acesso bloqueado. Procure o administrador.");
      await firebase.auth().signOut();
      return;
    }

    localStorage.setItem("usuario", JSON.stringify(usuario));

    await redirecionarUsuario(usuario);

  } catch (erro) {
    console.error("Erro no login:", erro);
    alert("Email ou senha inválidos.");
  }
}

async function redirecionarUsuario(usuario) {
  const tipo = usuario.tipoUsuario;

  if (tipo === "master_global") {
    window.location.href = "master-global.html";
    return;
  }

  if (tipo === "master_local") {
    window.location.href = "master-local.html";
    return;
  }

  if (tipo === "supervisor") {
    window.location.href = "supervisor.html";
    return;
  }

  if (tipo === "financeiro") {
    window.location.href = "financeiro.html";
    return;
  }

  if (tipo === "vendedor") {
    await validarCaixaVendedor(usuario);
    return;
  }

  alert("Tipo de usuário não identificado.");
}

async function validarCaixaVendedor(usuario) {
  try {
    const db = firebase.firestore();

    const hoje = new Date().toISOString().split("T")[0];

    const snap = await db.collection("caixas")
      .where("usuarioId", "==", usuario.id)
      .where("status", "==", "ABERTO")
      .where("ativo", "==", true)
      .limit(1)
      .get();

    if (snap.empty) {
      alert("Caixa não aberto. Procure o supervisor.");
      await firebase.auth().signOut();
      localStorage.removeItem("usuario");
      return;
    }

    const caixaDoc = snap.docs[0];
    const caixa = {
      id: caixaDoc.id,
      ...caixaDoc.data()
    };

    localStorage.setItem("caixaAtual", JSON.stringify(caixa));

    window.location.href = "vendedor.html";

  } catch (erro) {
    console.error("Erro ao validar caixa:", erro);
    alert("Erro ao validar caixa do vendedor.");
  }
}

function logout() {
  firebase.auth().signOut().then(() => {
    localStorage.removeItem("usuario");
    localStorage.removeItem("caixaAtual");
    window.location.href = "index.html";
  });
}