(function (global) {
  "use strict";

  const CAMPOS = [
    { id: "nome", label: "Nome do cliente", obrigatorio: true, aliases: ["nome", "cliente", "nome cliente", "nome completo", "razao social"] },
    { id: "documento", label: "CPF/CNPJ", obrigatorio: true, aliases: ["documento", "cpf", "cnpj", "cpf cnpj", "cpf/cnpj"] },
    { id: "telefone", label: "Telefone", obrigatorio: true, aliases: ["telefone", "contato", "celular", "whatsapp", "telefone contato"] },
    { id: "status", label: "Status", aliases: ["status", "situacao", "situacao cliente", "status cliente"] },
    { id: "tipoCliente", label: "Tipo de cliente", aliases: ["tipo cliente", "tipo de cliente", "pessoa", "pf pj", "pf/pj"] },
    { id: "equipe", label: "Equipe", aliases: ["equipe", "time", "unidade", "setor", "equipe vendedor"] },
    { id: "vendedor", label: "Vendedor", aliases: ["vendedor", "responsavel", "consultor", "atendente", "equipe vendedor"] },
    { id: "regiao", label: "Região (cidade/UF)", aliases: ["regiao", "cidade estado", "cidade uf", "municipio", "cidade"] },
    { id: "endereco", label: "Endereço completo", aliases: ["endereco", "endereco completo", "logradouro"] },
    { id: "ultimaAtualizacao", label: "Última atualização", aliases: ["ultima atualizacao", "atualizado em", "data atualizacao", "ultima movimentacao"] },
    { id: "origem", label: "Canal de origem", aliases: ["origem", "canal", "canal origem", "fonte", "lead veio", "captacao"] }
  ];

  const STATUS_CLIENTE = new Map([
    ["ativo", "ATIVO"], ["ativa", "ATIVO"], ["inativo", "INATIVO"], ["inativa", "INATIVO"],
    ["quitado", "QUITADO"], ["quitada", "QUITADO"], ["inadimplente", "INADIMPLENTE"],
    ["bloqueado", "BLOQUEADO"], ["bloqueada", "BLOQUEADO"]
  ]);

  const STATUS_ATENDIMENTO = new Map([
    ["aguardando", "AGUARDANDO_ATENDIMENTO"], ["aguardando atendimento", "AGUARDANDO_ATENDIMENTO"],
    ["recebido", "RECEBIDO"], ["recebida", "RECEBIDO"], ["em atendimento", "EM_ATENDIMENTO"],
    ["tentativa contato", "TENTATIVA_CONTATO"], ["sem retorno", "SEM_RETORNO"],
    ["retorno agendado", "RETORNO_AGENDADO"], ["proposta apresentada", "PROPOSTA_APRESENTADA"],
    ["convertido", "CONVERTIDO"], ["convertida", "CONVERTIDO"],
    ["nao convertido", "NAO_CONVERTIDO"], ["nao convertida", "NAO_CONVERTIDO"],
    ["recusado", "RECUSADO"], ["recusada", "RECUSADO"], ["em retrabalho", "EM_RETRABALHO"]
  ]);

  function texto(valor) {
    if (valor == null) return "";
    if (valor instanceof Date) return valor;
    if (typeof valor === "object") {
      if (valor.text != null) return String(valor.text).trim();
      if (valor.result != null) return texto(valor.result);
      if (Array.isArray(valor.richText)) return valor.richText.map(item => item.text || "").join("").trim();
    }
    return String(valor).trim();
  }

  function normalizar(valor) {
    return String(texto(valor) || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function slug(valor, padrao = "CADASTRO_DIRETO") {
    const normalizado = normalizar(valor).replace(/\s+/g, "_").toUpperCase();
    return normalizado || padrao;
  }

  function somenteNumeros(valor) {
    return String(texto(valor) || "").replace(/\D/g, "");
  }

  function normalizarTelefone(valor) {
    let numero = somenteNumeros(valor);
    if (numero.startsWith("00")) numero = numero.slice(2);
    if (numero.startsWith("55") && numero.length > 11) numero = numero.slice(2);
    return numero.slice(0, 11);
  }

  function formatarTelefone(valor) {
    const numero = normalizarTelefone(valor);
    if (numero.length <= 2) return numero;
    if (numero.length <= 6) return `(${numero.slice(0, 2)}) ${numero.slice(2)}`;
    if (numero.length <= 10) return `(${numero.slice(0, 2)}) ${numero.slice(2, 6)}-${numero.slice(6)}`;
    return `(${numero.slice(0, 2)}) ${numero.slice(2, 7)}-${numero.slice(7)}`;
  }

  function valorData(valor) {
    if (valor instanceof Date && !Number.isNaN(valor.getTime())) return valor.toISOString();
    const bruto = String(texto(valor) || "").trim();
    if (!bruto) return "";
    const br = bruto.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (br) {
      const [, dia, mes, ano, hora = "00", minuto = "00", segundo = "00"] = br;
      return `${ano}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}T${hora.padStart(2, "0")}:${minuto}:${segundo}-03:00`;
    }
    const data = new Date(bruto);
    return Number.isNaN(data.getTime()) ? bruto : data.toISOString();
  }

  function parseCsv(conteudo) {
    const textoCsv = String(conteudo || "").replace(/^\uFEFF/, "");
    const primeiraLinha = textoCsv.split(/\r?\n/, 1)[0] || "";
    const contagem = separador => (primeiraLinha.match(new RegExp(`\\${separador}`, "g")) || []).length;
    const separador = contagem(";") > contagem(",") ? ";" : ",";
    const linhas = [];
    let linha = [];
    let campo = "";
    let aspas = false;
    for (let i = 0; i < textoCsv.length; i += 1) {
      const char = textoCsv[i];
      if (char === '"') {
        if (aspas && textoCsv[i + 1] === '"') { campo += '"'; i += 1; }
        else aspas = !aspas;
      } else if (char === separador && !aspas) {
        linha.push(campo); campo = "";
      } else if ((char === "\n" || char === "\r") && !aspas) {
        if (char === "\r" && textoCsv[i + 1] === "\n") i += 1;
        linha.push(campo); campo = "";
        if (linha.some(valor => String(valor).trim())) linhas.push(linha);
        linha = [];
      } else campo += char;
    }
    linha.push(campo);
    if (linha.some(valor => String(valor).trim())) linhas.push(linha);
    return linhas;
  }

  function extrairPlanilhaExcel(workbook) {
    const worksheet = workbook.worksheets?.[0];
    if (!worksheet) throw new Error("O arquivo não possui uma planilha legível.");
    const linhas = [];
    worksheet.eachRow({ includeEmpty: false }, row => {
      const valores = [];
      for (let coluna = 1; coluna <= Math.max(worksheet.columnCount, row.cellCount); coluna += 1) {
        valores.push(texto(row.getCell(coluna).value));
      }
      if (valores.some(valor => String(valor).trim())) linhas.push(valores);
    });
    return { nomeAba: worksheet.name || "Planilha 1", linhas };
  }

  async function lerArquivo(arquivo) {
    if (!arquivo) throw new Error("Selecione um arquivo Excel ou CSV.");
    const extensao = String(arquivo.name || "").split(".").pop().toLowerCase();
    let nomeAba = "Arquivo CSV";
    let linhas;
    if (extensao === "csv") {
      linhas = parseCsv(await arquivo.text());
    } else if (extensao === "xlsx") {
      if (!global.ExcelJS?.Workbook) throw new Error("Leitor de Excel indisponível. Atualize a página e tente novamente.");
      const workbook = new global.ExcelJS.Workbook();
      await workbook.xlsx.load(await arquivo.arrayBuffer());
      const extraido = extrairPlanilhaExcel(workbook);
      nomeAba = extraido.nomeAba;
      linhas = extraido.linhas;
    } else {
      throw new Error("Formato não suportado. Utilize um arquivo .xlsx ou .csv.");
    }
    if (!linhas?.length) throw new Error("O arquivo está vazio.");
    const indiceCabecalho = linhas.findIndex(linha => linha.filter(valor => String(valor).trim()).length >= 2);
    if (indiceCabecalho < 0) throw new Error("Não foi possível localizar a linha de cabeçalho.");
    const cabecalhos = linhas[indiceCabecalho].map((valor, indice) => String(texto(valor) || `COLUNA ${indice + 1}`).trim());
    const dados = linhas.slice(indiceCabecalho + 1)
      .filter(linha => linha.some(valor => String(texto(valor)).trim()))
      .slice(0, 500);
    if (!dados.length) throw new Error("Nenhuma linha de cliente foi encontrada após o cabeçalho.");
    return { arquivoNome: arquivo.name, nomeAba, cabecalhos, linhas: dados, totalLimitado: linhas.length - indiceCabecalho - 1 > 500 };
  }

  function sugerirMapeamento(cabecalhos = []) {
    const usados = new Set();
    return Object.fromEntries(CAMPOS.map(campo => {
      let melhor = -1;
      let pontuacao = 0;
      cabecalhos.forEach((cabecalho, indice) => {
        const atual = normalizar(cabecalho);
        const pontos = campo.aliases.reduce((maior, alias) => {
          const alvo = normalizar(alias);
          if (atual === alvo) return Math.max(maior, 100);
          if (atual.includes(alvo) || alvo.includes(atual)) return Math.max(maior, 60);
          return maior;
        }, 0);
        if (pontos > pontuacao && (!usados.has(indice) || campo.id === "vendedor" || campo.id === "equipe")) {
          melhor = indice; pontuacao = pontos;
        }
      });
      if (melhor >= 0 && !["vendedor", "equipe"].includes(campo.id)) usados.add(melhor);
      return [campo.id, melhor >= 0 ? String(melhor) : ""];
    }));
  }

  function buscarCadastro(valor, lista = [], tipo) {
    const bruto = String(texto(valor) || "");
    const termos = bruto.split(/\s*(?:\/|\||;|>)\s*/).map(normalizar).filter(Boolean);
    const candidatos = [...new Set([...termos, normalizar(bruto)].filter(Boolean))];
    return lista.find(item => {
      const campos = tipo === "equipe"
        ? [item.nome, item.nomeEquipe, item.unidade, item.descricao, item.id]
        : [item.nome, item.nomeCompleto, item.email, item.apelido, item.authUid, item.uid, item.id];
      const normalizados = campos.map(normalizar).filter(Boolean);
      return candidatos.some(termo => normalizados.some(campo => campo === termo || (termo.length >= 4 && campo.includes(termo))));
    }) || null;
  }

  function obterValor(linha, mapeamento, campo) {
    const indice = Number(mapeamento[campo]);
    return mapeamento[campo] === "" || !Number.isInteger(indice) ? "" : texto(linha[indice]);
  }

  function separarRegiao(valor) {
    const bruto = String(texto(valor) || "").trim();
    const match = bruto.match(/^(.+?)[\s\/-]+([A-Za-z]{2})$/);
    return { regiao: bruto, cidade: match ? match[1].trim() : bruto, estado: match ? match[2].toUpperCase() : "" };
  }

  function tipoCliente(valor, documento) {
    const tipo = normalizar(valor);
    if (tipo === "pj" || tipo.includes("jurid")) return "PJ";
    if (tipo === "pf" || tipo.includes("fisic")) return "PF";
    return somenteNumeros(documento).length === 14 ? "PJ" : "PF";
  }

  function prepararLinha(linha, numeroLinha, mapeamento, contexto = {}) {
    const importarComoIndicacao = contexto.modo === "indicacoes";
    const nome = String(obterValor(linha, mapeamento, "nome") || "").trim();
    const documento = String(obterValor(linha, mapeamento, "documento") || "").trim();
    const documentoNormalizado = somenteNumeros(documento);
    const telefoneOriginal = obterValor(linha, mapeamento, "telefone");
    const telefoneNormalizado = normalizarTelefone(telefoneOriginal);
    const statusOriginal = normalizar(obterValor(linha, mapeamento, "status"));
    const equipeOriginal = obterValor(linha, mapeamento, "equipe");
    const vendedorOriginal = obterValor(linha, mapeamento, "vendedor");
    const equipe = importarComoIndicacao ? null : buscarCadastro(equipeOriginal, contexto.equipes, "equipe");
    const vendedor = importarComoIndicacao ? null : buscarCadastro(vendedorOriginal, contexto.usuarios, "vendedor");
    const regiao = separarRegiao(obterValor(linha, mapeamento, "regiao"));
    const erros = [];
    if (!nome) erros.push("Nome não informado");
    if (![11, 14].includes(documentoNormalizado.length)) erros.push("CPF/CNPJ inválido");
    if (telefoneNormalizado.length < 10) erros.push("Telefone inválido");
    if (!importarComoIndicacao && equipeOriginal && !equipe) erros.push(`Equipe não encontrada: ${equipeOriginal}`);
    if (!importarComoIndicacao && vendedorOriginal && !vendedor) erros.push(`Vendedor não encontrado: ${vendedorOriginal}`);
    if (vendedor && equipe) {
      const equipesVendedor = [vendedor.equipeId, ...(vendedor.equipesIds || []), ...(vendedor.equipeIds || [])].filter(Boolean).map(String);
      if (equipesVendedor.length && !equipesVendedor.includes(String(equipe.id || equipe.equipeId))) erros.push("Vendedor não pertence à equipe informada");
    }
    const chaveDocumento = documentoNormalizado ? `doc:${documentoNormalizado}` : "";
    const chaveTelefone = telefoneNormalizado ? `tel:${telefoneNormalizado}` : "";
    if (!importarComoIndicacao && chaveDocumento && contexto.chavesExistentes?.has(chaveDocumento)) erros.push("Documento já cadastrado");
    else if (!importarComoIndicacao && chaveTelefone && contexto.chavesExistentes?.has(chaveTelefone)) erros.push("Telefone já cadastrado");
    else if (chaveDocumento && contexto.chavesArquivo?.has(chaveDocumento)) erros.push("Documento duplicado no arquivo");
    else if (chaveTelefone && contexto.chavesArquivo?.has(chaveTelefone)) erros.push("Telefone duplicado no arquivo");
    if (!erros.length) {
      if (chaveDocumento) contexto.chavesArquivo?.add(chaveDocumento);
      if (chaveTelefone) contexto.chavesArquivo?.add(chaveTelefone);
    }
    const statusCliente = STATUS_CLIENTE.get(statusOriginal) || "ATIVO";
    const statusAtendimento = STATUS_ATENDIMENTO.get(statusOriginal) || "AGUARDANDO_ATENDIMENTO";
    const vendedorId = vendedor?.authUid || vendedor?.uid || vendedor?.id || "";
    const equipeId = equipe?.id || equipe?.equipeId || vendedor?.equipeId || vendedor?.equipesIds?.[0] || "";
    return {
      numeroLinha,
      valido: erros.length === 0,
      erros,
      dados: {
        nome,
        nomeCompleto: nome,
        documento,
        tipoCliente: tipoCliente(obterValor(linha, mapeamento, "tipoCliente"), documento),
        telefonePrincipal: formatarTelefone(telefoneOriginal),
        paisTelefone: "55",
        telefones: [{ tipo: "PRINCIPAL", paisCodigo: "55", numero: formatarTelefone(telefoneOriginal), numeroE164: `55${telefoneNormalizado}`, whatsapp: true }],
        whatsappAtivo: true,
        whatsappUrl: `https://wa.me/55${telefoneNormalizado}`,
        status: statusCliente,
        statusCliente,
        statusAtendimento,
        equipeId,
        equipeNome: equipe?.nome || equipe?.nomeEquipe || "",
        vendedorId,
        vendedorAuthUid: vendedorId,
        vendedorNome: vendedor?.nome || vendedor?.nomeCompleto || vendedor?.email || "",
        regiao: regiao.regiao,
        cidade: regiao.cidade,
        estado: regiao.estado,
        uf: regiao.estado,
        endereco: String(obterValor(linha, mapeamento, "endereco") || "").trim(),
        origem: slug(obterValor(linha, mapeamento, "origem"), "IMPORTACAO_PLANILHA"),
        ultimaAtualizacaoOrigem: valorData(obterValor(linha, mapeamento, "ultimaAtualizacao")),
        importadoDeArquivo: true,
        origemImportacao: importarComoIndicacao ? "PLANILHA_INDICACOES" : "PLANILHA_CLIENTES",
        statusOrigemImportacao: String(obterValor(linha, mapeamento, "status") || "").trim(),
        equipeOrigemImportacao: String(equipeOriginal || "").trim(),
        vendedorOrigemImportacao: String(vendedorOriginal || "").trim()
      }
    };
  }

  function prepararImportacao(arquivo, mapeamento, contexto = {}) {
    const obrigatoriosAusentes = CAMPOS.filter(campo => campo.obrigatorio && (mapeamento[campo.id] == null || mapeamento[campo.id] === ""));
    if (obrigatoriosAusentes.length) throw new Error(`Mapeie os campos obrigatórios: ${obrigatoriosAusentes.map(item => item.label).join(", ")}.`);
    const chavesExistentes = new Set();
    (contexto.clientes || []).forEach(cliente => {
      const documento = somenteNumeros(cliente.documento || cliente.documentoNormalizado);
      if (documento) chavesExistentes.add(`doc:${documento}`);
      const telefones = [cliente.telefone, cliente.telefonePrincipal, ...(cliente.telefonesNormalizados || [])];
      telefones.map(normalizarTelefone).filter(Boolean).forEach(numero => chavesExistentes.add(`tel:${numero}`));
    });
    const base = { ...contexto, chavesExistentes, chavesArquivo: new Set() };
    return arquivo.linhas.map((linha, indice) => prepararLinha(linha, indice + 2, mapeamento, base));
  }

  async function importar(preparados, opcoes = {}) {
    if (!global.ClientesService?.criarClienteComLegado) throw new Error("Serviço oficial de Clientes indisponível.");
    const validos = preparados.filter(item => item.valido);
    const resultado = { total: preparados.length, importados: 0, ignorados: preparados.length - validos.length, erros: [] };
    for (let indice = 0; indice < validos.length; indice += 1) {
      const item = validos[indice];
      try {
        await global.ClientesService.criarClienteComLegado({ db: opcoes.db, usuario: opcoes.usuario, dados: item.dados });
        resultado.importados += 1;
      } catch (erro) {
        resultado.erros.push({ numeroLinha: item.numeroLinha, nome: item.dados.nome, mensagem: erro.message || "Falha ao importar" });
      }
      opcoes.onProgress?.({ atual: indice + 1, total: validos.length, resultado });
    }
    return resultado;
  }

  async function importarIndicacoes(preparados, opcoes = {}) {
    if (!global.IntegroIndicacoes?.criarIndicacao) throw new Error("Serviço oficial de Indicações indisponível.");
    const validos = preparados.filter(item => item.valido);
    const resultado = { total: preparados.length, importados: 0, ignorados: preparados.length - validos.length, erros: [] };
    for (let indice = 0; indice < validos.length; indice += 1) {
      const item = validos[indice];
      const dados = item.dados;
      const historico = [
        dados.statusOrigemImportacao ? `Status de origem: ${dados.statusOrigemImportacao}` : "",
        dados.equipeOrigemImportacao ? `Equipe de origem: ${dados.equipeOrigemImportacao}` : "",
        dados.vendedorOrigemImportacao ? `Responsável de origem: ${dados.vendedorOrigemImportacao}` : "",
        dados.regiao ? `Região: ${dados.regiao}` : "",
        dados.endereco ? `Endereço informado: ${dados.endereco}` : "",
        dados.ultimaAtualizacaoOrigem ? `Última atualização na origem: ${dados.ultimaAtualizacaoOrigem}` : ""
      ].filter(Boolean).join(" | ");
      try {
        await global.IntegroIndicacoes.criarIndicacao({
          db: opcoes.db,
          usuario: opcoes.usuario,
          clientePlataformaId: opcoes.clientePlataformaId,
          nome: dados.nome,
          documento: dados.documento,
          telefonePrincipal: dados.telefonePrincipal,
          tipoCliente: dados.tipoCliente,
          paisTelefone: "55",
          whatsappAtivo: true,
          whatsappUrl: dados.whatsappUrl,
          enderecoResumo: dados.endereco || dados.regiao || "",
          origemIndicacao: dados.origem || "IMPORTACAO_PLANILHA",
          observacao: historico,
          ignorarPermissao: false
        });
        resultado.importados += 1;
      } catch (erro) {
        resultado.erros.push({ numeroLinha: item.numeroLinha, nome: dados.nome, mensagem: erro.message || "Falha ao importar indicação" });
      }
      opcoes.onProgress?.({ atual: indice + 1, total: validos.length, resultado });
    }
    return resultado;
  }

  async function exportar(clientes = [], nomeArquivo = "clientes-integro.xlsx") {
    if (!global.ExcelJS?.Workbook) throw new Error("Gerador de Excel indisponível. Atualize a página e tente novamente.");
    const workbook = new global.ExcelJS.Workbook();
    workbook.creator = "INTEGRO";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("Clientes", { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.columns = [
      { header: "NOME DO CLIENTE", key: "nome", width: 34 },
      { header: "STATUS", key: "status", width: 20 },
      { header: "TIPO DE CLIENTE", key: "tipoCliente", width: 18 },
      { header: "EQUIPE", key: "equipe", width: 24 },
      { header: "VENDEDOR", key: "vendedor", width: 26 },
      { header: "TELEFONE", key: "telefone", width: 20 },
      { header: "REGIÃO", key: "regiao", width: 26 },
      { header: "ENDEREÇO COMPLETO", key: "endereco", width: 42 },
      { header: "DOCUMENTO", key: "documento", width: 22 },
      { header: "ÚLTIMA ATUALIZAÇÃO", key: "ultimaAtualizacao", width: 24 },
      { header: "CANAL DE ORIGEM", key: "origem", width: 24 }
    ];
    const formatarDataExportacao = valor => {
      const data = valor?.toDate?.() || (valor?.seconds != null ? new Date(valor.seconds * 1000) : valor instanceof Date ? valor : null);
      if (!data || Number.isNaN(data.getTime())) return texto(valor);
      return new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium"
      }).format(data);
    };
    clientes.forEach(cliente => sheet.addRow({
      nome: cliente.nomeCompleto || cliente.nome || "",
      status: cliente.statusCliente || cliente.status || "",
      tipoCliente: cliente.tipoCliente || "",
      equipe: cliente.equipeNome || cliente.equipeId || "",
      vendedor: cliente.vendedorNome || cliente.vendedorId || "",
      telefone: cliente.telefonePrincipal || cliente.telefone || "",
      regiao: cliente.regiao || [cliente.cidade, cliente.estado || cliente.uf].filter(Boolean).join(" - "),
      endereco: cliente.endereco || [cliente.logradouro, cliente.numero, cliente.complemento, cliente.bairro].filter(Boolean).join(", "),
      documento: cliente.documento || "",
      ultimaAtualizacao: cliente.ultimaAtualizacaoOrigem || cliente.ultimaMovimentacaoTexto || cliente.atualizadoEmTexto || formatarDataExportacao(cliente.atualizadoEm),
      origem: cliente.origem || cliente.origemCliente || ""
    }));
    const header = sheet.getRow(1);
    header.height = 28;
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF092B61" } };
    header.alignment = { vertical: "middle" };
    sheet.autoFilter = { from: "A1", to: "K1" };
    sheet.eachRow((row, numero) => {
      if (numero > 1) {
        row.alignment = { vertical: "top", wrapText: true };
        row.height = 24;
        if (numero % 2 === 0) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      }
    });
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = nomeArquivo;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return nomeArquivo;
  }

  global.ClientesImportacaoService = {
    CAMPOS,
    normalizar,
    normalizarTelefone,
    parseCsv,
    lerArquivo,
    sugerirMapeamento,
    prepararImportacao,
    importar,
    importarIndicacoes,
    exportar
  };
})(window);
