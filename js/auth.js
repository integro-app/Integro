// AUTH ÍNTEGRO - DEBUG REAL

async function login() {
alert("AUTH NOVO CARREGADO");
  const email = document.getElementById("email").value.trim();
  const senha = document.getElementById("senha").value.trim();

  if (!email || !senha) {
    alert("Preencha email e senha.");
    return;
  }

  try {
    console.log("Tentando login com:", email);

    const credencial = await firebase.auth().signInWithEmailAndPassword(email, senha);
    const authUser = credencial.user;

    console.log("AUTH OK:", authUser.uid, authUser.email);

    const db = firebase.firestore();

    let snap = await db.collection("usuarios")
      .where("authUid", "==", authUser.uid)
      .limit(1)
      .get();

    if (snap.empty) {
      snap = await db.collection("usuarios")
        .where("email", "==", authUser.email)
        .limit(1)
        .get();
    }

    if (snap.empty) {
      alert("Login autenticado, mas usuário não encontrado na coleção usuarios.");
      return;
    }

    const doc = snap.docs[0];
    const usuario = {
      id: doc.id,
      ...doc.data()
    };

    console.log("USUÁRIO FIRESTORE:", usuario);

    if (usuario.status !== "ATIVO") {
      alert("Usuário inativo ou bloqueado.");
      return;
    }

    if (usuario.acessoLiberado === false) {
      alert("Acesso bloqueado.");
      return;
    }

    localStorage.setItem("usuario", JSON.stringify(usuario));

    redirecionarUsuario(usuario);

  } catch (erro) {
    console.error("ERRO REAL NO LOGIN:", erro);

    alert(
      "Erro real do Firebase:\n\n" +
      "Código: " + erro.code + "\n" +
      "Mensagem: " + erro.message
    );
  }
}

function redirecionarUsuario(usuario) {
  const tipo = usuario.tipoUsuario;

  if (tipo === "master_global") {
    window.location.href = "master-global.html";
    return;
  }

  if (tipo === "master_local") {
    window.location.href = "master-local.html";
    return;
  }

  if (tipo === "vendedor") {
    window.location.href = "vendedor.html";
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

  alert("Tipo de usuário não identificado: " + tipo);
}