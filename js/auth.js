// LOGIN ÍNTEGRO COMPLETO

function login() {
  const email = document.getElementById("email").value.trim();
  const senha = document.getElementById("senha").value.trim();

  if (!email || !senha) {
    alert("Preencha email e senha");
    return;
  }
 
  firebase.auth().signInWithEmailAndPassword(email, senha)
    .then((userCredential) => {
      const user = userCredential.user;

      // Buscar dados do usuário no Firestore
      firebase.firestore().collection("usuarios")
        .where("email", "==", user.email)
        .get()
        .then((querySnapshot) => {

          if (querySnapshot.empty) {
            alert("Usuário autenticado, mas não cadastrado no sistema");
            return;
          }

          const dados = querySnapshot.docs[0].data();

          // 🔒 BLOQUEIOS DE SEGURANÇA
          if (dados.status !== "ATIVO") {
            alert("Usuário inativo ou bloqueado");
            return;
          }

          if (dados.acessoLiberado === false) {
            alert("Acesso não liberado");
            return;
          }

          // 🧠 SALVAR SESSÃO
          localStorage.setItem("usuario", JSON.stringify(dados));

          // 🚀 REDIRECIONAMENTO POR PERFIL
          redirecionarUsuario(dados);

        })
        .catch((error) => {
          console.error(error);
          alert("Erro ao buscar dados do usuário");
        });

    })
    .catch((error) => {
      alert("Email ou senha inválidos");
    });
}


// 🚀 FUNÇÃO DE REDIRECIONAMENTO

function redirecionarUsuario(dados) {

  const tipo = dados.tipoUsuario;

  if (tipo === "master_global") {
    window.location.href = "master-global.html";
    return;
  }

  if (tipo === "master_local") {
    window.location.href = "master-local.html";
    return;
  }

  if (tipo === "vendedor") {

    // 🔴 REGRA CRÍTICA DO ÍNTEGRO
    validarCaixaVendedor(dados);

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

  alert("Tipo de usuário não identificado");
}


// 💰 VALIDAÇÃO DE CAIXA (REGRA PRINCIPAL)

function validarCaixaVendedor(dados) {

  const hoje = new Date().toISOString().split("T")[0];

  firebase.firestore().collection("caixas")
    .where("usuarioId", "==", dados.id)
    .where("data", "==", hoje)
    .where("status", "==", "ABERTO")
    .where("ativo", "==", true)
    .get()
    .then((querySnapshot) => {

      if (querySnapshot.empty) {
        alert("Caixa não aberto. Procure o supervisor.");
        return;
      }

      // Se tiver caixa aberto → entra
      window.location.href = "vendedor.html";

    })
    .catch((error) => {
      console.error(error);
      alert("Erro ao validar caixa");
    });
}