(function (global) {
  "use strict";
  let active = false;
  const state = () => global.State || (typeof State !== "undefined" ? State : null);
  function incorporar(result) {
    if (!result?.caixaId || !result.caixa) return;
    const box = {...result.caixa,id:result.caixaId};
    const merge = list => [...(list || []).filter(item => item.id !== box.id),box];
    global.caixasCache = merge(global.caixasCache || state()?.getCaixas?.());
    state()?.setCaixas?.(global.caixasCache);
    if (global.CX) global.CX.caixas = merge(global.CX.caixas);
    global.IntegroDataRuntime?.invalidar?.("caixas-tela:");
  }
  async function executar(tasks) {
    if (active || !tasks.length) return null;
    active = true;
    let completed = 0, dialog;
    try {
      dialog = document.createElement("dialog");
      dialog.className = "caixa-date-dialog caixa-opening-progress";
      dialog.setAttribute("aria-label","Abertura de caixa em andamento");
      dialog.innerHTML = '<h2>Abrindo caixa</h2><p role="status" aria-live="polite"></p><progress aria-label="Caixas confirmados"></progress><p>Aguarde a confirmação da abertura.</p>';
      dialog.addEventListener("cancel",event => event.preventDefault());
      document.body.appendChild(dialog);
      dialog.showModal();
      const bar = dialog.querySelector("progress"), status = dialog.querySelector('[role="status"]');
      bar.max = tasks.length;
      // Uma única chamada usa a barra indeterminada até o servidor confirmar.
      if (tasks.length > 1) bar.value = 0;
      for (const task of tasks) {
        status.textContent = `Abrindo caixa ${completed+1} de ${tasks.length}…`;
        await task();
        bar.value = ++completed;
        status.textContent = `${completed} de ${tasks.length} caixa(s) confirmado(s).`;
      }
      return {concluidos:completed};
    } catch (error) {
      throw new Error(`${completed} de ${tasks.length} caixas confirmados. ${error.message || "A abertura falhou."} Os caixas já abertos foram preservados.`);
    } finally {
      dialog?.close();
      dialog?.remove();
      active = false;
    }
  }
  global.IntegroAberturaCaixa = {executar,incorporar};
})(window);
