// ========================================
// CONFIG.JS - ÍNTEGRO
// Constantes, configurações e mapeamentos globais
// ========================================

const CONFIG = {
  ROTAS_POR_TIPO: {
    master_global: "master-global.html",
    master_local: "master-local.html",
    usuario_cliente: "master-local.html",
    vendedor: "vendedor.html",
    supervisor: "supervisor.html",
    financeiro: "financeiro.html",
    gerente: "master-local.html",
    auditor: "master-local.html"
  },

  ROTAS_POR_CARGO_CLIENTE: {
    gerente: "master-local.html",
    captador: "master-local.html",
    supervisor: "supervisor.html",
    vendedor: "vendedor.html",
    financeiro: "financeiro.html",
    auditor: "master-local.html"
  },

  TIPO_POR_PAGINA: {
    "master-global.html": "master_global",
    "master-local.html": "master_local",
    "vendedor.html": "vendedor",
    "supervisor.html": "supervisor",
    "financeiro.html": "financeiro"
  },

  TIPOS_USUARIO: {
    MASTER_GLOBAL: "master_global",
    USUARIO_INTEGRO: "usuario_integro",
    MASTER_LOCAL: "master_local",
    USUARIO_CLIENTE: "usuario_cliente",
    VENDEDOR: "vendedor",
    SUPERVISOR: "supervisor",
    FINANCEIRO: "financeiro"
  },

  TIPOS_USUARIO_OFICIAIS: {
    MASTER_GLOBAL: "master_global",
    USUARIO_INTEGRO: "usuario_integro",
    MASTER_LOCAL: "master_local",
    USUARIO_CLIENTE: "usuario_cliente"
  },

  CARGOS_USUARIO_CLIENTE: {
    GERENTE: "gerente",
    CAPTADOR: "captador",
    SUPERVISOR: "supervisor",
    VENDEDOR: "vendedor",
    FINANCEIRO: "financeiro",
    AUDITOR: "auditor"
  },

  STATUS_USUARIO: {
    ATIVO: "ATIVO",
    INATIVO: "INATIVO",
    BLOQUEADO: "BLOQUEADO"
  },

  STATUS_CAIXA: {
    ABERTO: "ABERTO",
    FECHADO: "FECHADO",
    PENDENTE: "PENDENTE"
  },

  STATUS_CLIENTE: {
    SEM_VENDA: "SEM_VENDA",
    ATIVO: "ATIVO",
    QUITADO: "QUITADO",
    INADIMPLENTE: "INADIMPLENTE",
    INATIVO: "INATIVO"
  },

  STATUS_SOLICITACAO: {
    PENDENTE: "PENDENTE",
    APROVADA: "APROVADA",
    RECUSADA: "RECUSADA",
    CANCELADA: "CANCELADA"
  },

  STATUS_CONTA: {
    PENDENTE: "PENDENTE",
    VENCIDA: "VENCIDA",
    PAGA: "PAGA",
    CANCELADA: "CANCELADA",
    AGENDADA: "AGENDADA"
  },

  FREQUENCIAS: {
    DIARIA: "DIÁRIA",
    SEMANAL: "SEMANAL",
    QUINZENAL: "QUINZENAL",
    MENSAL: "MENSAL",
    BIMESTRAL: "BIMESTRAL",
    TRIMESTRAL: "TRIMESTRAL",
    SEMESTRAL: "SEMESTRAL",
    ANUAL: "ANUAL",
    PERSONALIZADA: "PERSONALIZADA"
  },

  LIMITS: {
    USUARIOS: 300,
    CARGOS: 200,
    EQUIPES: 200,
    CAIXAS: 300,
    CLIENTES: 500,
    VENDAS: 500,
    PARCELAS: 1000,
    PAGAMENTOS: 300,
    SOLICITACOES: 300,
    LOGS: 300,

    CATEGORIAS_FINANCEIRAS: 200,
    FORMAS_PAGAMENTO: 100,
    FORNECEDORES: 500,
    CONTAS_PAGAR: 2000,
    PAGAMENTOS_CONTAS: 2000,
    RECORRENCIAS_FINANCEIRAS: 500
  },

  COLECOES: {
    USUARIOS: "usuarios",
    CARGOS: "cargos",
    EQUIPES: "equipes",
    CAIXAS: "caixas",

    CLIENTES: "clientes",
    VENDAS: "vendas",
    PARCELAS: "parcelas",
    PAGAMENTOS: "pagamentos",

    SOLICITACOES: "solicitacoes",
    LOGS: "logs",

    CATEGORIAS_FINANCEIRAS: "categoriasFinanceiras",
    FORMAS_PAGAMENTO: "formasPagamento",
    FORNECEDORES: "fornecedores",
    CONTAS_PAGAR: "contasPagar",
    PAGAMENTOS_CONTAS: "pagamentosContas",
    RECORRENCIAS_FINANCEIRAS: "recorrenciasFinanceiras"
  },

  ERROS: {
    EMAIL_INVALIDO: "Email ou senha inválidos.",
    CONEXAO_FALHA: "Falha de conexão. Verifique sua internet e tente novamente.",
    MUITAS_TENTATIVAS: "Muitas tentativas. Aguarde um momento e tente novamente.",
    EMAIL_JA_EXISTE: "Este email já existe no Firebase Auth.",
    USUARIO_NAO_ENCONTRADO: "Usuário não encontrado.",
    ACESSO_NEGADO: "Acesso negado para este perfil.",
    SESSAO_INVALIDA: "Sessão inválida. Por favor, faça login novamente.",
    CADASTRO_INCOMPLETO: "Cadastro incompleto: tipo de usuário não informado.",
    USUARIO_INATIVO: "Usuário inativo. Procure o administrador.",
    USUARIO_BLOQUEADO: "Usuário bloqueado. Procure o administrador.",
    ACESSO_BLOQUEADO: "Acesso bloqueado para este usuário."
  },

  TIMEOUTS: {
    TOAST: 3500,
    DEBOUNCE: 400
  },

  SENHA_PADRAO: "123456",
  TENANT_ID_KEY: "clientePlataformaId"
};

window.CONFIG = CONFIG;
