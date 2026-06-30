// ========================================
// STATE.JS - ÍNTEGRO
// Gerenciador centralizado de estado (cache)
// ========================================

const State = {
  // ===============================
  // ESTADO DE AUTENTICAÇÃO
  // ===============================
  usuario: null,
  usuarioId: null,
  tipoUsuario: null,
  tenantId: null,
  authUid: null,
  empresaNome: null,

  // ===============================
  // DADOS EM CACHE
  // ===============================
  usuarios: [],
  cargos: [],
  equipes: [],
  caixas: [],
  clientes: [],
  vendas: [],
  pagamentos: [],
  solicitacoes: [],
  logs: [],

  // ===============================
  // SETTERS - AUTENTICAÇÃO
  // ===============================
  setUsuario(usuario) {
    if (!usuario) {
      this.limparSessao();
      return;
    }

    this.usuario = usuario;
    this.usuarioId = usuario.id || "";
    this.tipoUsuario = usuario.tipoUsuario || "";
    this.tenantId = usuario.clientePlataformaId || usuario.empresaId || usuario.tenantId || "";
    this.authUid = usuario.authUid || "";
    this.empresaNome = usuario.clientePlataformaNome || usuario.empresaNome || "";

    // Salvar em localStorage para persistência
    this._salvarEmLocalStorage();
  },

  // ===============================
  // SETTERS - DADOS
  // ===============================
  setUsuarios(data) {
    this.usuarios = data || [];
  },

  setCargos(data) {
    this.cargos = data || [];
  },

  setEquipes(data) {
    this.equipes = data || [];
  },

  setCaixas(data) {
    this.caixas = data || [];
  },

  setClientes(data) {
    this.clientes = data || [];
  },

  setVendas(data) {
    this.vendas = data || [];
  },

  setPagamentos(data) {
    this.pagamentos = data || [];
  },

  setSolicitacoes(data) {
    this.solicitacoes = data || [];
  },

  setLogs(data) {
    this.logs = data || [];
  },

  // ===============================
  // GETTERS - AUTENTICAÇÃO
  // ===============================
  getUsuario() {
    return this.usuario;
  },

  getTenantId() {
    return this.tenantId;
  },

  getTipoUsuario() {
    return this.tipoUsuario;
  },

  getEmpresaNome() {
    return this.empresaNome;
  },

  isAuthenticated() {
    return !!this.usuario && !!this.tenantId;
  },

  // ===============================
  // GETTERS - DADOS
  // ===============================
  getUsuarios() {
    return this.usuarios;
  },

  getCargos() {
    return this.cargos;
  },

  getEquipes() {
    return this.equipes;
  },

  getCaixas() {
    return this.caixas;
  },

  getClientes() {
    return this.clientes;
  },

  getVendas() {
    return this.vendas;
  },

  getPagamentos() {
    return this.pagamentos;
  },

  getSolicitacoes() {
    return this.solicitacoes;
  },

  getLogs() {
    return this.logs;
  },

  // ===============================
  // BUSCAS ESPECÍFICAS
  // ===============================
  encontrarUsuarioPorId(id) {
    return this.usuarios.find(u => u.id === id);
  },

  encontrarCargoPorId(id) {
    return this.cargos.find(c => c.id === id);
  },

  encontrarEquipePorId(id) {
    return this.equipes.find(e => e.id === id);
  },

  encontrarClientePorId(id) {
    return this.clientes.find(c => c.id === id);
  },

  // ===============================
  // CONTADORES
  // ===============================
  contarUsuarios() {
    return this.usuarios.length;
  },

  contarCargos() {
    return this.cargos.length;
  },

  contarEquipes() {
    return this.equipes.length;
  },

  contarCaixasAbertos() {
    return this.caixas.filter(c => String(c.status || "").toUpperCase() === CONFIG.STATUS_CAIXA.ABERTO).length;
  },

  contarClientesAtivos() {
    return this.clientes.filter(c => String(c.status || "").toUpperCase() === CONFIG.STATUS_CLIENTE.ATIVO).length;
  },

  contarSolicitacoesPendentes() {
    return this.solicitacoes.filter(s => String(s.status || "").toUpperCase() === CONFIG.STATUS_SOLICITACAO.PENDENTE).length;
  },

  // ===============================
  // SOMAS
  // ===============================
  somaCarteira() {
    return this.clientes.reduce((total, c) => {
      return total + Number(c.saldoDevedor || c.saldo || 0);
    }, 0);
  },

  somaInadimplencia() {
    return this.clientes.reduce((total, c) => {
      const status = String(c.status || "").toUpperCase();
      const saldo = Number(c.saldoDevedor || c.saldo || 0);
      if (status.includes("INAD")) return total + saldo;
      return total;
    }, 0);
  },

  somaPagamentosHoje() {
    return this.pagamentos.reduce((total, p) => {
      return total + Number(p.valor || 0);
    }, 0);
  },

  contarVendasHoje() {
    const hoje = new Date().toISOString().split("T")[0];
    return this.vendas.filter(v => String(v.data || v.dataVenda || "").includes(hoje)).length;
  },

  // ===============================
  // LIMPEZA
  // ===============================
  limparSessao() {
    const usuarioAnterior = this.usuario;
    this.usuario = null;
    this.usuarioId = null;
    this.tipoUsuario = null;
    this.tenantId = null;
    this.authUid = null;
    this.empresaNome = null;
    if (window.IntegroOperacional?.limparSessaoLocal) {
      window.IntegroOperacional.limparSessaoLocal({
        usuario: usuarioAnterior,
        limparFila: true
      });
    } else {
      [
        "usuario",
        "usuarioLogado",
        "usuarioAtual",
        "integroUsuario",
        "usuarioId",
        "tipoUsuario",
        "clientePlataformaId",
        "clientePlataformaNome",
        "empresaId",
        "tenantId",
        "caixaAtual"
      ].forEach(chave => localStorage.removeItem(chave));
    }
  },

  limparDados() {
    this.usuarios = [];
    this.cargos = [];
    this.equipes = [];
    this.caixas = [];
    this.clientes = [];
    this.vendas = [];
    this.pagamentos = [];
    this.solicitacoes = [];
    this.logs = [];
  },

  resetAll() {
    this.limparSessao();
    this.limparDados();
  },

  // ===============================
  // PERSISTÊNCIA
  // ===============================
  _salvarEmLocalStorage() {
    localStorage.setItem("usuario", JSON.stringify(this.usuario));
    localStorage.setItem("usuarioId", this.usuarioId);
    localStorage.setItem("tipoUsuario", this.tipoUsuario);
    localStorage.setItem("clientePlataformaId", this.tenantId);
    localStorage.setItem("clientePlataformaNome", this.empresaNome);
  },

  restaurarDoLocalStorage() {
    try {
      const usuarioJson = localStorage.getItem("usuario");
      if (usuarioJson) {
        const usuario = JSON.parse(usuarioJson);
        this.setUsuario(usuario);
      }
    } catch (erro) {
      console.error("Erro ao restaurar do localStorage:", erro);
    }
  }
};

// Fazer State disponível globalmente
window.State = State;
