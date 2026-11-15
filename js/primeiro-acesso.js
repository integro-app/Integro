(function (global) {
  "use strict";
  let ocupado = false;
  let modal = null;
  async function encerrar() {
    try { await global.firebase.auth().signOut(); } catch (_) {}
    global.State?.limparSessao?.();
    modal?.remove();
    modal = null;
    const campo = document.getElementById("senha");
    if (campo) campo.value = "";
    document.getElementById("email")?.focus();
  }
  function exibir(usuario, usuarioAuth) {
    if (modal) return;
    if (!usuarioAuth || usuario.authUid !== usuarioAuth.uid || usuario.trocaSenhaObrigatoria !== true)
      throw new Error("Conta para primeiro acesso inválida.");
    modal = document.createElement("div");
    modal.id = "integroPrimeiroAcesso";
    modal.setAttribute("role","dialog");
    modal.setAttribute("aria-modal","true");
    modal.setAttribute("aria-labelledby","primeiroAcessoTitulo");
    modal.style.cssText = "position:fixed;inset:0;z-index:30000;background:rgba(3,11,24,.90);padding:18px;display:flex;align-items:center;justify-content:center;overflow-y:auto";
    modal.innerHTML = [
      '<form id="primeiroAcessoForm" autocomplete="off" style="background:#fff;color:#162031;border-radius:20px;padding:27px;width:min(100%,440px);box-shadow:0 20px 80px #0006">',
      '<h2 id="primeiroAcessoTitulo" style="font-size:22px;margin:0 0 10px">Defina sua senha definitiva</h2>',
      '<p style="font-size:14px;color:#475569;line-height:1.5;margin:0 0 14px">Primeiro acesso ao ÍNTEGRO. Troque a senha provisória antes de abrir os módulos.</p>',
      '<p id="primeiroAcessoEmail" style="overflow-wrap:anywhere;font-weight:700;margin-bottom:15px"></p>',
      '<label style="display:block;margin:9px 0">Senha provisória<input id="primeiroAcessoAntiga" type="password" autocomplete="current-password" required maxlength="128" style="width:100%;padding:12px;margin-top:5px;font-size:16px;border:1px solid #94a3b8;border-radius:10px"></label>',
      '<label style="display:block;margin:9px 0">Nova senha<input id="primeiroAcessoNova" type="password" autocomplete="new-password" required minlength="12" maxlength="128" style="width:100%;padding:12px;margin-top:5px;font-size:16px;border:1px solid #94a3b8;border-radius:10px"></label>',
      '<label style="display:block;margin:9px 0">Confirme a nova senha<input id="primeiroAcessoConfirmar" type="password" autocomplete="new-password" required minlength="12" maxlength="128" style="width:100%;padding:12px;margin-top:5px;font-size:16px;border:1px solid #94a3b8;border-radius:10px"></label>',
      '<p style="color:#64748b;font-size:12px;margin:10px 0">Use de 12 a 128 caracteres, com letras e números. Não repita a senha provisória.</p>',
      '<p id="primeiroAcessoErro" role="alert" style="min-height:20px;color:#b91c1c;font-size:13px"></p>',
      '<button id="primeiroAcessoSalvar" type="submit" style="width:100%;padding:13px;border:0;border-radius:10px;background:#ff6b00;color:white;font-weight:700;font-size:15px">Confirmar nova senha</button>',
      '<button id="primeiroAcessoSair" type="button" style="width:100%;margin-top:8px;padding:11px;border:0;border-radius:10px;background:#e2e8f0;color:#334155">Sair e fazer depois</button>',
      '</form>'
    ].join("");
    document.body.appendChild(modal);
    const campo = id => modal.querySelector("#"+id);
    campo("primeiroAcessoEmail").textContent=usuario.email || usuarioAuth.email || "";
    campo("primeiroAcessoAntiga").focus();
    campo("primeiroAcessoSair").onclick=()=>{if(!ocupado)encerrar();};
    campo("primeiroAcessoForm").onsubmit=async evento=>{
      evento.preventDefault();
      if(ocupado)return;
      const antiga=campo("primeiroAcessoAntiga").value;
      const nova=campo("primeiroAcessoNova").value;
      const confirmacao=campo("primeiroAcessoConfirmar").value;
      const erro=campo("primeiroAcessoErro");
      if(!antiga)return void(erro.textContent="Informe sua senha provisória.");
      if(nova.length<12||nova.length>128||!/[A-Za-z]/.test(nova)||!/\d/.test(nova))
        return void(erro.textContent="A nova senha precisa ter de 12 a 128 caracteres, com letras e números.");
      if(nova===antiga)return void(erro.textContent="A nova senha deve ser diferente da provisória.");
      if(nova!==confirmacao)return void(erro.textContent="A confirmação não confere.");
      if(!global.firebase?.functions)return void(erro.textContent="Serviço de autenticação indisponível.");
      ocupado=true;
      const botao=campo("primeiroAcessoSalvar");
      botao.disabled=true;botao.textContent="Salvando nova senha...";erro.textContent="";
      try{
        const credencial=global.firebase.auth.EmailAuthProvider.credential(usuarioAuth.email,antiga);
        await usuarioAuth.reauthenticateWithCredential(credencial);
        const chamada=global.firebase.app().functions("southamerica-east1").httpsCallable("solicitarCadastroDuplicadoV27");
        const resposta=await chamada({__integroRota:"PRIMEIRO_ACESSO_V1",novaSenha:nova});
        if(resposta?.data?.ok!==true||resposta.data.requerNovoLogin!==true)
          throw new Error("Confirmação de senha não recebida.");
        await encerrar();
        global.alert?.("Senha definida com sucesso! Entre novamente com sua nova senha.");
      }catch(e){
        const codigo=String(e?.code||"");
        erro.textContent=["auth/wrong-password","auth/invalid-credential"].includes(codigo)
          ?"Senha provisória incorreta.":"Não foi possível concluir a troca. Verifique os dados e tente novamente.";
      }finally{
        ocupado=false;
        if(botao.isConnected){botao.disabled=false;botao.textContent="Confirmar nova senha";}
      }
    };
  }
  global.IntegroPrimeiroAcesso=Object.freeze({exibir});
})(window);
