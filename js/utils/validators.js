// ========================================
// VALIDATORS.JS - ÍNTEGRO
// Funções de validação centralizadas
// ========================================

const Validators = {
  // ===============================
  // VALIDAR USUÁRIO
  // ===============================
  validarUsuario(usuario) {
    if (!usuario) {
      return {
        ok: false,
        mensagem: CONFIG.ERROS.USUARIO_NAO_ENCONTRADO
      };
    }

    const status = String(usuario.status || "").toUpperCase();

    if (!usuario.tipoUsuario) {
      return {
        ok: false,
        mensagem: CONFIG.ERROS.CADASTRO_INCOMPLETO
      };
    }

    if (status === CONFIG.STATUS_USUARIO.INATIVO) {
      return {
        ok: false,
        mensagem: CONFIG.ERROS.USUARIO_INATIVO
      };
    }

    if (status === CONFIG.STATUS_USUARIO.BLOQUEADO) {
      return {
        ok: false,
        mensagem: CONFIG.ERROS.USUARIO_BLOQUEADO
      };
    }

    if (usuario.acessoLiberado === false) {
      return {
        ok: false,
        mensagem: CONFIG.ERROS.ACESSO_BLOQUEADO
      };
    }

    return {
      ok: true
    };
  },

  // ===============================
  // VALIDAR TIPO DE USUÁRIO
  // ===============================
  validarTipoUsuario(tipoUsuario, tipoObrigatorio) {
    if (!tipoObrigatorio) return true;

    return String(tipoUsuario || "").toLowerCase() === String(tipoObrigatorio || "").toLowerCase();
  },

  // ===============================
  // VALIDAR EMAIL
  // ===============================
  validarEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  },

  // ===============================
  // VALIDAR DADOS DE USUÁRIO
  // ===============================
  validarDadosUsuario(dados) {
    const erros = [];

    if (!dados.nome || !dados.nome.trim()) {
      erros.push("Nome é obrigatório.");
    }

    if (!dados.email || !dados.email.trim()) {
      erros.push("Email é obrigatório.");
    } else if (!this.validarEmail(dados.email)) {
      erros.push("Email inválido.");
    }

    if (!dados.tipoUsuario) {
      erros.push("Tipo de usuário é obrigatório.");
    }

    return {
      valido: erros.length === 0,
      erros
    };
  },

  // ===============================
  // VALIDAR DADOS DE CARGO
  // ===============================
  validarDadosCargo(dados) {
    const erros = [];

    if (!dados.nome || !dados.nome.trim()) {
      erros.push("Nome do cargo é obrigatório.");
    }

    return {
      valido: erros.length === 0,
      erros
    };
  },

  // ===============================
  // VALIDAR DADOS DE EQUIPE
  // ===============================
  validarDadosEquipe(dados) {
    const erros = [];

    if (!dados.nome || !dados.nome.trim()) {
      erros.push("Nome da equipe é obrigatório.");
    }

    return {
      valido: erros.length === 0,
      erros
    };
  }
};

// Fazer Validators disponível globalmente
window.Validators = Validators;
