(function (global) {
  "use strict";
  if (global.__INTEGRO_V272_LEAD_OPEN_GUARD__) return;
  global.__INTEGRO_V272_LEAD_OPEN_GUARD__ = true;

  function usuario() {
    return global.State?.getUsuario?.() || global.usuarioLogado || global.currentUserData || {};
  }
  function normalizarStatus(item) {
    return global.IntegroIndicacoes?.normalizarStatusIndicacao?.(item?.statusIndicacao || item?.status || "RECEBIDA") ||
      String(item?.statusIndicacao || item?.status || "RECEBIDA").toUpperCase();
  }
  function encontrar(id) {
    return (global.indicacoesCache || []).find(item => String(item.id) === String(id));
  }
  async function iniciarSeNovo(id) {
    const item = encontrar(id);
    if (!item || normalizarStatus(item) !== "ATRIBUIDA") return false;
    const service = global.IntegroIndicacoes;
    if (!service?.iniciarAtendimentoIndicacao) return false;
    await service.iniciarAtendimentoIndicacao(id, usuario());
    await global.carregarIndicacoes?.();
    global.renderIndicacoes?.();
    return true;
  }
  function install() {
    const original = global.abrirDetalheIndicacao;
    if (typeof original !== "function" || original.__integroV272Wrapped) return false;
    async function abrirDetalheV272(id) {
      try {
        await iniciarSeNovo(id);
      } catch (error) {
        console.error("[ÍNTEGRO V27.2] Falha ao iniciar atendimento automático do lead.", error);
        global.notificarIntegro?.(`O lead foi aberto, mas o atendimento automático falhou.\n\n${error.message || error}`);
      }
      return original.call(this, id);
    }
    abrirDetalheV272.__integroV272Wrapped = true;
    abrirDetalheV272.__integroOriginal = original;
    global.abrirDetalheIndicacao = abrirDetalheV272;
    return true;
  }

  document.addEventListener("integro-v272-pronto", install);
  document.addEventListener("usuario-validado", () => setTimeout(install, 0));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(install, 0), { once: true });
  else setTimeout(install, 0);

  global.IntegroV272LeadOpenGuard = Object.freeze({ install, iniciarSeNovo });
})(window);
