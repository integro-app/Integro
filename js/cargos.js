// ========================================
// CARGOS - MASTER LOCAL ÍNTEGRO
// CRUD de cargos + permissões por módulo
// ========================================

const MODULOS_PERMISSAO = [
  "dashboard",
  "usuarios",
  "clientes",
  "vendas",
  "cobrancas",
  "caixas",
  "solicitacoes",
  "relatorios",
  "configuracoes",
  "auditoria"
];

let permissoesCargoCache = [];

// ===============================
// CARREGAR CARGOS
// ===============================

async function carregarCargos() {
  try {
    const tenantId = State.getTenantId();

    let ref = db.collection("cargos");

    if (tenantId) {
      ref = ref.where("clientePlataformaId", "==", tenantId);
    }

    const snap = await ref.get();

    const cargos = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    if (State.setCargos) {
      State.setCargos(cargos);
    }

    await carregarPermissoesCargo();

    renderCargos();

  } catch (erro) {
    console.error("Erro ao carregar cargos:", erro);
    if (State.setCargos) State.setCargos([]);
  }
}

async function carregarPermissoesCargo() {
  try {
    const tenantId = State.getTenantId();

    let ref = db.collection("permissoes_cargo");

    if (tenantId) {
      ref = ref.where("clientePlataformaId", "==", tenantId);
    }

    const snap = await ref.get();

    permissoesCargoCache = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

  } catch (erro) {
    console.error("Erro ao carregar permissões dos cargos:", erro);
    permissoesCargoCache = [];
  }
}

// ===============================
// RENDER CARGOS
// ===============================

let filtroStatusCargosEstrutura = "";
function abrirFiltrosCargosEstrutura(){
  abrirDrawer("Filtros de cargos","Selecione a situação exibida.",'<div class="usuario-form-section"><div class="form-group"><label for="filtroStatusCargosDrawer">Situação</label><select id="filtroStatusCargosDrawer"><option value="">TODOS OS CARGOS</option><option value="ATIVO">ATIVOS</option><option value="INATIVO">INATIVOS</option></select></div></div><div class="drawer-actions usuario-drawer-actions"><button class="ghost-btn" onclick="filtroStatusCargosEstrutura=\'\';fecharDrawer();renderCargos()">Limpar</button><button class="primary-btn" onclick="filtroStatusCargosEstrutura=document.getElementById(\'filtroStatusCargosDrawer\').value;fecharDrawer();renderCargos()">Aplicar filtros</button></div>');
  setTimeout(()=>{const c=document.getElementById("filtroStatusCargosDrawer");if(c)c.value=filtroStatusCargosEstrutura},0);
}
function renderCargos(){
 const el=document.getElementById("listaCargos");if(!el)return;
 const todos=State.getCargos?State.getCargos():[],usuarios=State.getUsuarios?State.getUsuarios():[],termo=String(document.getElementById("buscaCargos")?.value||"").trim().toLowerCase();
 const cargos=todos.filter(c=>{const ativo=c.ativo!==false;return(!filtroStatusCargosEstrutura||(filtroStatusCargosEstrutura==="ATIVO"?ativo:!ativo))&&(!termo||[c.nome,c.descricao,c.tipoUsuario].some(v=>String(v||"").toLowerCase().includes(termo)))});
 const ativos=todos.filter(c=>c.ativo!==false).length,vinculados=usuarios.filter(u=>u.cargoId).length,configurados=new Set(permissoesCargoCache.map(p=>p.cargoId).filter(Boolean)).size;
 const host=document.getElementById("cargosIndicadores");if(host)host.innerHTML=[["admin_panel_settings","Total",todos.length],["verified","Ativos",ativos],["block","Inativos",todos.length-ativos],["group","Usuários vinculados",vinculados],["shield","Com permissões",configurados]].map(([i,r,v])=>'<div class="estrutura-kpi"><span class="material-symbols-rounded">'+i+'</span><div><small>'+r+'</small><strong>'+v+'</strong><em>Atualização em tempo real</em></div></div>').join("");
 const resumo=document.getElementById("cargosFiltroResumo");if(resumo)resumo.textContent=filtroStatusCargosEstrutura||"Todos os cargos";const contador=document.getElementById("cargosContador");
 if(!cargos.length){el.innerHTML='<div class="estrutura-empty"><span class="material-symbols-rounded">admin_panel_settings</span><strong>Nenhum cargo encontrado</strong><p>Ajuste a pesquisa ou crie um novo cargo.</p></div>';if(contador)contador.textContent="0 cargos exibidos";return}
 const linhas=cargos.map(c=>{const ativo=c.ativo!==false,uv=usuarios.filter(u=>u.cargoId===c.id).length,qp=permissoesCargoCache.filter(p=>p.cargoId===c.id).length;return '<tr><td data-label="Cargo"><div class="estrutura-identidade"><span class="usuario-avatar">'+String(c.nome||"C").slice(0,2).toUpperCase()+'</span><div><strong>'+String(c.nome||"Cargo sem nome")+'</strong><small>'+String(c.descricao||"Função operacional")+'</small></div></div></td><td data-label="Perfil">'+String(c.tipoUsuario||c.perfil||"Personalizado").replace(/_/g," ")+'</td><td data-label="Usuários">'+uv+'</td><td data-label="Permissões">'+qp+' módulo'+(qp===1?"":"s")+'</td><td data-label="Status"><span class="usuario-status '+(ativo?"is-success":"is-danger")+'">'+(ativo?"ATIVO":"INATIVO")+'</span></td><td data-label="Ações"><div class="usuario-table-actions"><button class="ghost-btn" onclick="abrirEditarCargo(\''+c.id+'\')">Editar</button><button class="ghost-btn" onclick="abrirPermissoesCargo(\''+c.id+'\')">Permissões</button><button class="'+(ativo?"danger-btn":"success-btn")+' usuario-action-muted" onclick="alterarStatusCargo(\''+c.id+'\','+(!ativo)+')">'+(ativo?"Desativar":"Ativar")+'</button><button class="danger-btn usuario-action-muted" onclick="excluirCargo(\''+c.id+'\')">Excluir</button></div></td></tr>'}).join("");
 el.innerHTML='<div class="estrutura-table-scroll"><table class="estrutura-table"><thead><tr><th>Cargo</th><th>Perfil</th><th>Usuários</th><th>Permissões</th><th>Status</th><th>Ações</th></tr></thead><tbody>'+linhas+'</tbody></table></div>';if(contador)contador.textContent=cargos.length+' cargo'+(cargos.length===1?'':'s')+' exibido'+(cargos.length===1?'':'s');
}
// FORMUL// FORMULÁRIO CARGO
// ===============================

function abrirNovoCargo() {
  abrirDrawer(
    "Novo cargo",
    "Crie uma função operacional para esta empresa.",
    formularioCargo()
  );
}

function abrirEditarCargo(id) {
  const cargo = (State.getCargos ? State.getCargos() : []).find(c => c.id === id);

  if (!cargo) {
    notificarIntegro("Cargo não encontrado.");
    return;
  }

  abrirDrawer(
    "Editar cargo",
    "Atualize os dados do cargo selecionado.",
    formularioCargo(cargo)
  );
}

function formularioCargo(cargo = null) {
  return `
    <div class="form-grid">
      <div class="form-group full">
        <label>Nome do cargo</label>
        <input id="cargoNome" placeholder="Ex: Vendedor, Supervisor, Financeiro" value="${cargo?.nome || ""}">
      </div>

      <div class="form-group full">
        <label>Descrição</label>
        <input id="cargoDescricao" placeholder="Descrição interna do cargo" value="${cargo?.descricao || ""}">
      </div>

      <div class="form-group">
        <label>Status</label>
        <select id="cargoAtivo">
          <option value="true" ${cargo?.ativo !== false ? "selected" : ""}>Ativo</option>
          <option value="false" ${cargo?.ativo === false ? "selected" : ""}>Inativo</option>
        </select>
      </div>

      <div class="form-group">
        <label>Cor visual</label>
        <select id="cargoCor">
          <option value="#ff8a00" ${cargo?.cor === "#ff8a00" ? "selected" : ""}>Laranja ÍNTEGRO</option>
          <option value="#1683ff" ${cargo?.cor === "#1683ff" ? "selected" : ""}>Azul</option>
          <option value="#16c784" ${cargo?.cor === "#16c784" ? "selected" : ""}>Verde</option>
          <option value="#8b5cf6" ${cargo?.cor === "#8b5cf6" ? "selected" : ""}>Roxo</option>
          <option value="#ff405d" ${cargo?.cor === "#ff405d" ? "selected" : ""}>Vermelho</option>
        </select>
      </div>
    </div>

    <div class="drawer-actions">
      <button class="primary-btn drawer-primary" onclick="${cargo ? `salvarCargo('${cargo.id}')` : "salvarCargo()"}">
        ${cargo ? "Salvar alterações" : "Criar cargo"}
      </button>
    </div>
  `;
}

async function salvarCargo(id = null) {
  try {
    const usuario = State.getUsuario ? State.getUsuario() : {};
    const tenantId = State.getTenantId();

    const nome = document.getElementById("cargoNome").value.trim();
    const descricao = document.getElementById("cargoDescricao").value.trim();
    const ativo = document.getElementById("cargoAtivo").value === "true";
    const cor = document.getElementById("cargoCor").value;

    if (!nome) {
      notificarIntegro("Informe o nome do cargo.");
      return;
    }

    const dados = {
      nome,
      descricao,
      ativo,
      cor,
      clientePlataformaId: tenantId,
      empresaId: tenantId,
      empresaNome: usuario?.clientePlataformaNome || usuario?.empresaNome || "",
      atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
      atualizadoPorUid: usuario?.authUid || "",
      atualizadoPorNome: usuario?.nome || usuario?.email || ""
    };

    if (id) {
      await db.collection("cargos").doc(id).update(dados);
      notificarIntegro("Cargo atualizado com sucesso.");
    } else {
      await db.collection("cargos").add({
        ...dados,
        criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
        criadoPorUid: usuario?.authUid || "",
        criadoPorNome: usuario?.nome || usuario?.email || ""
      });

      notificarIntegro("Cargo criado com sucesso.");
    }

    fecharDrawer();
    await carregarCargos();

  } catch (erro) {
    console.error("Erro ao salvar cargo:", erro);
    notificarIntegro("Erro ao salvar cargo: " + erro.message);
  }
}

async function alterarStatusCargo(id, ativo) {
  try {
    await db.collection("cargos").doc(id).update({
      ativo,
      atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });

    await carregarCargos();

  } catch (erro) {
    console.error("Erro ao alterar status do cargo:", erro);
    notificarIntegro("Erro ao alterar status do cargo: " + erro.message);
  }
}

// ===============================
// PERMISSÃ•ES
// ===============================

function abrirPermissoesCargo(id) {
  const cargo = (State.getCargos ? State.getCargos() : []).find(c => c.id === id);

  if (!cargo) {
    notificarIntegro("Cargo não encontrado.");
    return;
  }

  abrirDrawer(
    "Permissões do cargo",
    cargo.nome || "Cargo",
    formularioPermissoesCargo(cargo)
  );
}

function formularioPermissoesCargo(cargo) {
  const blocos = MODULOS_PERMISSAO.map(modulo => {
    const perm = permissoesCargoCache.find(p =>
      p.cargoId === cargo.id &&
      String(p.modulo || "").toLowerCase() === modulo
    ) || {};

    return `
      <div class="permission-card">
        <div class="permission-title">${formatarModulo(modulo)}</div>

        <label><input type="checkbox" id="perm_${modulo}_visualizar" ${perm.podeVisualizar || perm.visualizar ? "checked" : ""}> Visualizar</label>
        <label><input type="checkbox" id="perm_${modulo}_criar" ${perm.podeCriar ? "checked" : ""}> Criar</label>
        <label><input type="checkbox" id="perm_${modulo}_editar" ${perm.podeEditar ? "checked" : ""}> Editar</label>
        <label><input type="checkbox" id="perm_${modulo}_excluir" ${perm.podeExcluir ? "checked" : ""}> Excluir</label>
        <label><input type="checkbox" id="perm_${modulo}_aprovar" ${perm.podeAprovar ? "checked" : ""}> Aprovar</label>
        <label><input type="checkbox" id="perm_${modulo}_exportar" ${perm.podeExportar ? "checked" : ""}> Exportar</label>
      </div>
    `;
  }).join("");

  return `
    <div class="permissions-grid">
      ${blocos}
    </div>

    <div class="drawer-actions">
      <button class="primary-btn drawer-primary" onclick="salvarPermissoesCargo('${cargo.id}')">
        Salvar permissões
      </button>
    </div>
  `;
}

async function salvarPermissoesCargo(cargoId) {
  try {
    const usuario = State.getUsuario ? State.getUsuario() : {};
    const tenantId = State.getTenantId();

    const snap = await db.collection("permissoes_cargo")
      .where("clientePlataformaId", "==", tenantId)
      .where("cargoId", "==", cargoId)
      .get();

    const existentes = {};
    snap.docs.forEach(doc => {
      existentes[String(doc.data().modulo || "").toLowerCase()] = doc.id;
    });

    const batch = db.batch();

    MODULOS_PERMISSAO.forEach(modulo => {
      const dados = {
        cargoId,
        modulo,
        empresaId: tenantId,
        clientePlataformaId: tenantId,
        podeVisualizar: checked(`perm_${modulo}_visualizar`),
        visualizar: checked(`perm_${modulo}_visualizar`),
        podeCriar: checked(`perm_${modulo}_criar`),
        podeEditar: checked(`perm_${modulo}_editar`),
        podeExcluir: checked(`perm_${modulo}_excluir`),
        podeAprovar: checked(`perm_${modulo}_aprovar`),
        aprovar: checked(`perm_${modulo}_aprovar`),
        podeExportar: checked(`perm_${modulo}_exportar`),
        atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
        atualizadoPorUid: usuario?.authUid || ""
      };

      const docId = existentes[modulo];

      if (docId) {
        batch.update(db.collection("permissoes_cargo").doc(docId), dados);
      } else {
        batch.set(db.collection("permissoes_cargo").doc(), {
          ...dados,
          criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
          criadoPorUid: usuario?.authUid || ""
        });
      }
    });

    await batch.commit();

    notificarIntegro("Permissões salvas com sucesso.");

    fecharDrawer();
    await carregarCargos();

  } catch (erro) {
    console.error("Erro ao salvar permissões:", erro);
    notificarIntegro("Erro ao salvar permissões: " + erro.message);
  }
}

function checked(id) {
  return document.getElementById(id)?.checked || false;
}

function formatarModulo(modulo) {
  const nomes = {
    dashboard: "Dashboard",
    usuarios: "Usuários",
    clientes: "Clientes",
    vendas: "Vendas",
    cobrancas: "Cobranças",
    caixas: "Caixas",
    solicitacoes: "Solicitações",
    relatorios: "Relatórios",
    configuracoes: "Configurações",
    auditoria: "Auditoria"
  };

  return nomes[modulo] || modulo;
}

async function excluirCargo(id) {
  try {
    const usuarios = State.getUsuarios ? State.getUsuarios() : [];
    const cargo = (State.getCargos ? State.getCargos() : []).find(c => c.id === id);

    if (!cargo) {
      notificarIntegro("Cargo não encontrado.");
      return;
    }

    const usuariosVinculados = usuarios.filter(u => u.cargoId === id).length;

    if (usuariosVinculados > 0) {
      notificarIntegro(
        "Não é possível excluir este cargo.\n\n" +
        "Existem " + usuariosVinculados + " usuário(s) vinculado(s) a ele.\n\n" +
        "Remova ou altere o cargo desses usuários antes de excluir."
      );
      return;
    }

    if (!confirm("Deseja excluir definitivamente o cargo '" + (cargo.nome || "sem nome") + "'?\n\nAs permissões vinculadas também serão removidas.")) {
      return;
    }

    const batch = db.batch();

    batch.delete(db.collection("cargos").doc(id));

    const permissoesSnap = await db.collection("permissoes_cargo")
      .where("clientePlataformaId", "==", State.getTenantId())
      .where("cargoId", "==", id)
      .get();

    permissoesSnap.docs.forEach(doc => {
      batch.delete(db.collection("permissoes_cargo").doc(doc.id));
    });

    await batch.commit();

    notificarIntegro("Cargo excluído com sucesso.");

    await carregarCargos();

  } catch (erro) {
    console.error("Erro ao excluir cargo:", erro);
    notificarIntegro("Erro ao excluir cargo: " + erro.message);
  }
}

// ===============================
// EXPORTAR GLOBAL
// ===============================

window.carregarCargos = carregarCargos;
window.renderCargos = renderCargos;
window.abrirNovoCargo = abrirNovoCargo;
window.abrirEditarCargo = abrirEditarCargo;
window.salvarCargo = salvarCargo;
window.alterarStatusCargo = alterarStatusCargo;
window.abrirPermissoesCargo = abrirPermissoesCargo;
window.salvarPermissoesCargo = salvarPermissoesCargo;
window.excluirCargo = excluirCargo;
