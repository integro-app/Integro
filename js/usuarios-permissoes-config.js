(function (global) {
  "use strict";

  let abaAtual = "usuarios";
  let montado = false;
  const origens = new Map();

  function guardarOrigem(id) {
    const secao = document.getElementById(id);
    const card = secao?.querySelector(":scope > .section-card");
    if (secao && card && !origens.has(id)) origens.set(id, { secao, card });
    return card || origens.get(id)?.card || null;
  }

  function devolverCards() {
    origens.forEach(({ secao, card }) => {
      if (card && card.parentElement !== secao) secao.appendChild(card);
    });
    const permissoesBox = document.getElementById("configPermissoesBox");
    const configuracoes = document.getElementById("configuracoes")?.querySelector(".section-card");
    if (permissoesBox && configuracoes && permissoesBox.parentElement !== configuracoes) configuracoes.appendChild(permissoesBox);
  }

  function host() {
    return document.getElementById("configUsuariosPermissoesBox");
  }

  function montar() {
    const destino = host();
    if (!destino) return false;
    ["usuarios", "equipes", "cargos"].forEach(guardarOrigem);
    destino.innerHTML = `
      <div class="usuarios-permissoes-shell">
        <div class="usuarios-permissoes-head">
          <div><small>CONFIGURAÇÕES DA EMPRESA</small><h2>Usuários e permissões</h2><p>Crie usuários e equipes, defina cargos e escolha exatamente quais telas e ações cada cargo pode utilizar.</p></div>
        </div>
        <div class="usuarios-permissoes-tabs" role="tablist">
          <button type="button" data-up-tab="usuarios" onclick="IntegroUsuariosPermissoes.abrir('usuarios')"><span class="material-symbols-rounded">group</span>Usuários</button>
          <button type="button" data-up-tab="equipes" onclick="IntegroUsuariosPermissoes.abrir('equipes')"><span class="material-symbols-rounded">hub</span>Equipes</button>
          <button type="button" data-up-tab="cargos" onclick="IntegroUsuariosPermissoes.abrir('cargos')"><span class="material-symbols-rounded">admin_panel_settings</span>Cargos e permissões</button>
        </div>
        <div id="usuariosPermissoesConteudo" class="usuarios-permissoes-conteudo"></div>
      </div>`;
    montado = true;
    return true;
  }

  function abrir(aba = "usuarios") {
    abaAtual = ["usuarios", "equipes", "cargos"].includes(aba) ? aba : "usuarios";
    global.abrirModuloNavegacaoIntegro?.("configuracoes", document.querySelector('#integroSidebarMenu [data-modulo="configuracoes"]'));
    global.abrirAbaConfiguracoes?.("usuariosPermissoes");
    if (!montado || !host()?.querySelector(".usuarios-permissoes-shell")) montar();

    const conteudo = document.getElementById("usuariosPermissoesConteudo");
    const card = guardarOrigem(abaAtual);
    if (!conteudo || !card) return false;
    devolverCards();
    conteudo.appendChild(card);
    document.querySelectorAll("[data-up-tab]").forEach(botao => botao.classList.toggle("active", botao.dataset.upTab === abaAtual));

    if (abaAtual === "usuarios") global.renderUsuarios?.();
    if (abaAtual === "equipes") global.renderEquipes?.();
    if (abaAtual === "cargos") {
      global.renderCargos?.();
      global.renderPermissoesConfig?.();
      const permissoesBox = document.getElementById("configPermissoesBox");
      if (permissoesBox) {
        permissoesBox.style.display = "block";
        conteudo.appendChild(permissoesBox);
      }
    }
    document.querySelectorAll(".config-module-tab").forEach(botao => botao.classList.remove("active"));
    document.getElementById("tabConfigUsuariosPermissoes")?.classList.add("active");
    return true;
  }


  const MATRIZ_USUARIO = [
    { id:"dashboard", nome:"Dashboard", acoes:["ver","visao_geral","comercial","carteira","equipe","operacao"] },
    { id:"chat_interno", nome:"Chat interno", acoes:["ver"] },
    { id:"operacao", nome:"Operação", acoes:["ver","cobrancas","vendas","registrar_pagamento","registrar_nao_pagamento","criar_venda"] },
    { id:"indicacoes", nome:"Captação e indicações", acoes:["ver","ver_proprio","criar","atribuir","atender","relatorios"] },
    { id:"equipe", nome:"Supervisão da equipe", acoes:["ver","clientes","leads","caixas","solicitacoes"] },
    { id:"clientes", nome:"Clientes", acoes:["ver","criar","editar","excluir","direcionar","atender"] },
    { id:"caixas", nome:"Caixas", acoes:["ver","abrir","fechar","reabrir"] },
    { id:"solicitacoes", nome:"Solicitações", acoes:["ver","criar","aprovar","recusar"] },
    { id:"financeiro", nome:"Financeiro", acoes:["ver","reconciliar","regularizar","estornar"] },
    { id:"relatorios", nome:"Relatórios", acoes:["ver","exportar"] },
    { id:"indicadores", nome:"Indicadores", acoes:["ver"] },
    { id:"logs", nome:"Auditoria", acoes:["ver"] },
    { id:"configuracoes", nome:"Configurações", acoes:["ver","editar","permissoes"] },
    { id:"minha_conta", nome:"Minha conta", acoes:["ver","editar"] }
  ];

  function escape(valor) { return String(valor ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]); }
  function permissaoUsuarioAtual(usuario) { return usuario?.permissoesUsuario || usuario?.permissoes || usuario?.permissoesCargo || {}; }

  function renderMatrizUsuario(permissoes) {
    return `<div class="up-user-permission-grid">${MATRIZ_USUARIO.map(modulo => `<section><div class="up-user-permission-head"><strong>${escape(modulo.nome)}</strong><button type="button" onclick="IntegroUsuariosPermissoes.marcarModuloUsuario('${modulo.id}',true)">Marcar tudo</button></div><div class="up-user-permission-actions">${modulo.acoes.map(acao => `<label><input type="checkbox" data-up-user-module="${modulo.id}" data-up-user-action="${acao}" ${permissoes?.[modulo.id]?.[acao] === true ? "checked" : ""}><span>${escape(acao.replace(/_/g," "))}</span></label>`).join("")}</div></section>`).join("")}</div>`;
  }

  async function abrirPermissoesUsuario(id) {
    const usuario = global.State?.encontrarUsuarioPorId?.(id);
    if (!usuario) return global.UIHelpers?.alerta?.("Usuário não encontrado.");
    const herdando = usuario.usarPermissoesPersonalizadas !== true;
    global.abrirDrawer?.("Permissões do usuário", `<div class="usuario-form-intro"><span class="material-symbols-rounded">shield_person</span><div><strong>${escape(usuario.nome || usuario.email || "Usuário")}</strong><p>Por padrão, o usuário herda as permissões do cargo. Ative a personalização somente para exceções.</p></div></div><label class="config-switch"><input id="upPersonalizarUsuario" type="checkbox" ${herdando ? "" : "checked"} onchange="document.getElementById('upMatrizUsuario').hidden=!this.checked"><span><strong>Usar permissões personalizadas</strong><small>Quando desligado, prevalece a matriz do cargo.</small></span></label><div id="upMatrizUsuario" ${herdando ? "hidden" : ""}>${renderMatrizUsuario(permissaoUsuarioAtual(usuario))}</div><div class="drawer-actions"><button class="ghost-btn" type="button" onclick="fecharDrawer()">Cancelar</button><button class="primary-btn" type="button" onclick="IntegroUsuariosPermissoes.salvarPermissoesUsuario('${escape(id)}')">Salvar permissões</button></div>`);
  }

  function coletarMatrizUsuario() {
    const matriz = {};
    document.querySelectorAll("[data-up-user-module][data-up-user-action]").forEach(input => {
      const modulo = input.dataset.upUserModule, acao = input.dataset.upUserAction;
      if (!matriz[modulo]) matriz[modulo] = {};
      matriz[modulo][acao] = input.checked === true;
    });
    return matriz;
  }

  async function salvarPermissoesUsuario(id) {
    try {
      const personalizar = document.getElementById("upPersonalizarUsuario")?.checked === true;
      const ref = (global.db || global.firebase?.firestore?.()).collection(global.CONFIG?.COLECOES?.USUARIOS || "usuarios").doc(id);
      const dados = personalizar ? { usarPermissoesPersonalizadas:true, permissoesUsuario:coletarMatrizUsuario(), permissoesUsuarioAtualizadasEm:global.firebase.firestore.FieldValue.serverTimestamp() } : { usarPermissoesPersonalizadas:false, permissoesUsuario:global.firebase.firestore.FieldValue.delete(), permissoesUsuarioAtualizadasEm:global.firebase.firestore.FieldValue.serverTimestamp() };
      await ref.update(dados);
      global.fecharDrawer?.();
      await global.carregarTudoMasterLocal?.();
      global.UIHelpers?.alerta?.("Permissões do usuário atualizadas.");
      document.dispatchEvent(new CustomEvent("integro-permissoes-atualizadas", { detail:{ usuario:global.State?.getUsuario?.() } }));
    } catch (erro) { console.error(erro); global.UIHelpers?.alerta?.(erro.message || "Não foi possível salvar as permissões."); }
  }

  function marcarModuloUsuario(modulo, valor) { document.querySelectorAll(`[data-up-user-module="${CSS.escape(modulo)}"]`).forEach(input => { input.checked = valor; }); }

  function instalar() {
    if (!document.getElementById("configUsuariosPermissoesBox")) return false;
    montar();
    return true;
  }

  document.addEventListener("DOMContentLoaded", instalar);
  document.addEventListener("usuario-validado", () => setTimeout(instalar, 0));

  global.IntegroUsuariosPermissoes = Object.freeze({ abrir, montar, instalar, devolverCards, abrirPermissoesUsuario, salvarPermissoesUsuario, marcarModuloUsuario, get abaAtual() { return abaAtual; } });
})(window);
