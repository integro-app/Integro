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
          <div><small>CONFIGURAÇÕES DA EMPRESA</small><h2>Usuários e permissões</h2><p>Cadastre cargos e seus acessos em Permissões. Nos usuários, selecione o cargo que será aplicado.</p></div>
        </div>
        <div class="usuarios-permissoes-tabs" role="tablist">
          <button type="button" data-up-tab="usuarios" onclick="IntegroUsuariosPermissoes.abrir('usuarios')"><span class="material-symbols-rounded">group</span>Usuários</button>
          <button type="button" data-up-tab="equipes" onclick="IntegroUsuariosPermissoes.abrir('equipes')"><span class="material-symbols-rounded">hub</span>Equipes</button>
          <button type="button" data-up-tab="cargos" onclick="IntegroUsuariosPermissoes.abrir('cargos')"><span class="material-symbols-rounded">admin_panel_settings</span>Permissões</button>
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

    }
    document.querySelectorAll(".config-module-tab").forEach(botao => botao.classList.remove("active"));
    document.getElementById("tabConfigUsuariosPermissoes")?.classList.add("active");
    return true;
  }


  function abrirPermissoesUsuario(id) {
    const usuario = global.State?.encontrarUsuarioPorId?.(id);
    if (!usuario?.cargoId) {
      global.UIHelpers?.alerta?.("Selecione um cargo no cadastro do usuário. As permissões são definidas pelo cargo.");
      return false;
    }
    abrir("cargos");
    global.abrirPermissoesCargo?.(usuario.cargoId);
    return true;
  }

  function instalar() {
    if (!document.getElementById("configUsuariosPermissoesBox")) return false;
    montar();
    return true;
  }

  document.addEventListener("DOMContentLoaded", instalar);
  document.addEventListener("usuario-validado", () => setTimeout(instalar, 0));

  global.IntegroUsuariosPermissoes = Object.freeze({ abrir, montar, instalar, devolverCards, abrirPermissoesUsuario, get abaAtual() { return abaAtual; } });
})(window);
