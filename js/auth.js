// LOGIN ÍNTEGRO

function login() {
  const email = document.getElementById("email").value;
  const senha = document.getElementById("senha").value;

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
            alert("Usuário não cadastrado no sistema");
            return;
          }

          const dados = querySnapshot.docs[0].data();

          if (dados.status !== "ATIVO") {
            alert("Usuário inativo ou bloqueado");
            return;
          }

          alert("Login realizado com sucesso");

          // Redirecionamento futuro por tipo de usuário
          console.log(dados);

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