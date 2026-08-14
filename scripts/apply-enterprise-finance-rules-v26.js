const fs = require("node:fs");
const path = require("node:path");

const file = path.join(__dirname, "..", "firestore.rules");
const CHECK = process.argv.includes("--check");
const BEGIN_HELPERS = "// BEGIN CONTROLE FINANCEIRO EMPRESARIAL V26 HELPERS";
const END_HELPERS = "// END CONTROLE FINANCEIRO EMPRESARIAL V26 HELPERS";
const BEGIN_MATCHES = "// BEGIN CONTROLE FINANCEIRO EMPRESARIAL V26 MATCHES";
const END_MATCHES = "// END CONTROLE FINANCEIRO EMPRESARIAL V26 MATCHES";

const helperBlock = `
    ${BEGIN_HELPERS}
    function controlFinanceMap() {
      return permMap().get("controleFinanceiro", {});
    }

    function canReadEnterpriseFinance(data) {
      return isActiveUser() &&
        data.get("clientePlataformaId", "") == userTenantId() &&
        (
          isMasterLocal() || isFinanceiro() ||
          controlFinanceMap().get("ver", false) == true
        );
    }

    function canEditEnterpriseFinance(data) {
      return isActiveUser() &&
        data.get("clientePlataformaId", "") == userTenantId() &&
        (
          isMasterLocal() || isFinanceiro() ||
          controlFinanceMap().get("editar", false) == true
        );
    }

    function canPayEnterpriseFinance(data) {
      return isActiveUser() &&
        data.get("clientePlataformaId", "") == userTenantId() &&
        (
          isMasterLocal() || isFinanceiro() ||
          controlFinanceMap().get("baixar", false) == true
        );
    }

    function canAttachEnterpriseFinance(data) {
      return isActiveUser() &&
        data.get("clientePlataformaId", "") == userTenantId() &&
        (
          isMasterLocal() || isFinanceiro() ||
          controlFinanceMap().get("anexar", false) == true ||
          controlFinanceMap().get("editar", false) == true ||
          controlFinanceMap().get("baixar", false) == true
        );
    }

    function canConfigureEnterpriseFinance(data) {
      return isActiveUser() &&
        data.get("clientePlataformaId", "") == userTenantId() &&
        (
          isMasterLocal() || isFinanceiro() ||
          controlFinanceMap().get("configurar", false) == true ||
          controlFinanceMap().get("editar", false) == true
        );
    }

    function validEnterpriseAccountCreate(data) {
      return canEditEnterpriseFinance(data) &&
        data.get("descricao", "") is string && data.get("descricao", "").size() > 0 &&
        data.get("vencimento", "") is string && data.get("vencimento", "").size() == 10 &&
        data.get("valorCentavos", 0) is int && data.get("valorCentavos", 0) > 0 &&
        data.get("valorPagoCentavos", -1) == 0 &&
        data.get("saldoCentavos", 0) == data.get("valorCentavos", 0) &&
        data.get("criadoPorAuthUid", "") == currentUid() &&
        data.get("status", "") == "A_VENCER";
    }

    function validEnterpriseAccountUpdate() {
      let changed = request.resource.data.diff(resource.data).affectedKeys();
      let tenantOk = isTenantImmutable() && isSameTenantRead() && isSameTenantWrite();
      let immutableOk = unchanged([
        "clientePlataformaId", "criadoPorAuthUid", "criadoPorId", "criadoPorNome", "criadoEm", "criadoEmTexto",
        "parcelamentoId", "parcelaNumero", "parcelasTotal", "recorrenciaId", "recorrente"
      ]);
      let editFields = [
        "descricao", "empresaId", "empresaNome", "fornecedorId", "fornecedorNome",
        "categoriaId", "categoriaNome", "centroCustoId", "centroCustoNome",
        "responsavelAuthUid", "responsavelNome", "valorCentavos", "saldoCentavos",
        "vencimento", "competencia", "formaPagamentoPrevista", "bancoContaId",
        "linhaDigitavel", "chavePix", "observacao", "atualizadoEmTexto", "atualizadoEm"
      ];
      let paymentFields = [
        "valorPagoCentavos", "saldoCentavos", "status", "ultimaDataPagamento",
        "atualizadoEmTexto", "atualizadoEm"
      ];
      let attachmentFields = ["anexos", "atualizadoEmTexto", "atualizadoEm"];
      let cancelFields = [
        "status", "motivoCancelamento", "canceladoPorAuthUid", "canceladoEmTexto",
        "atualizadoEmTexto", "atualizadoEm"
      ];
      return tenantOk && immutableOk && (
        (canEditEnterpriseFinance(request.resource.data) && changed.hasOnly(editFields)) ||
        (canPayEnterpriseFinance(request.resource.data) && changed.hasOnly(paymentFields)) ||
        (canAttachEnterpriseFinance(request.resource.data) && changed.hasOnly(attachmentFields)) ||
        (canEditEnterpriseFinance(request.resource.data) && changed.hasOnly(cancelFields) &&
          request.resource.data.get("status", "") == "CANCELADA" &&
          resource.data.get("valorPagoCentavos", 0) == 0)
      );
    }

    function validEnterprisePaymentCreate(data) {
      return canPayEnterpriseFinance(data) &&
        data.get("contaId", "") is string && data.get("contaId", "").size() > 0 &&
        exists(/databases/$(database)/documents/financeiro_contas/$(data.get("contaId", ""))) &&
        get(/databases/$(database)/documents/financeiro_contas/$(data.get("contaId", ""))).data.get("clientePlataformaId", "") == userTenantId() &&
        data.get("valorPagoCentavos", 0) is int && data.get("valorPagoCentavos", 0) > 0 &&
        data.get("jurosCentavos", 0) is int && data.get("multaCentavos", 0) is int &&
        data.get("descontoCentavos", 0) is int && data.get("valorEfetivoCentavos", 0) is int &&
        data.get("pagoPorAuthUid", "") == currentUid();
    }

    function validEnterprisePaymentUpdate() {
      let changed = request.resource.data.diff(resource.data).affectedKeys();
      return isTenantImmutable() && isSameTenantRead() && isSameTenantWrite() &&
        canAttachEnterpriseFinance(request.resource.data) &&
        unchanged([
          "clientePlataformaId", "contaId", "valorPagoCentavos", "jurosCentavos", "multaCentavos",
          "descontoCentavos", "valorEfetivoCentavos", "dataPagamento", "formaPagamento", "bancoContaId",
          "observacao", "pagoPorAuthUid", "pagoPorId", "pagoPorNome", "criadoEm", "criadoEmTexto"
        ]) &&
        changed.hasOnly(["comprovantes", "atualizadoEmTexto", "atualizadoEm"]);
    }

    function validEnterpriseAuditCreate(data) {
      return canReadEnterpriseFinance(data) &&
        (canEditEnterpriseFinance(data) || canPayEnterpriseFinance(data) || canConfigureEnterpriseFinance(data) || canAttachEnterpriseFinance(data)) &&
        data.get("usuarioAuthUid", "") == currentUid() &&
        data.get("acao", "") is string && data.get("acao", "").size() > 2 &&
        data.get("entidadeTipo", "") is string && data.get("entidadeTipo", "").size() > 0 &&
        data.get("entidadeId", "") is string && data.get("entidadeId", "").size() > 0;
    }
    ${END_HELPERS}
`;

const matchBlock = `
    ${BEGIN_MATCHES}
    match /financeiro_contas/{id} {
      allow read: if canReadEnterpriseFinance(resource.data);
      allow create: if validEnterpriseAccountCreate(request.resource.data);
      allow update: if validEnterpriseAccountUpdate();
      allow delete: if false;
    }

    match /financeiro_pagamentos/{id} {
      allow read: if canReadEnterpriseFinance(resource.data);
      allow create: if validEnterprisePaymentCreate(request.resource.data);
      allow update: if validEnterprisePaymentUpdate();
      allow delete: if false;
    }

    match /financeiro_fornecedores/{id} {
      allow read: if canReadEnterpriseFinance(resource.data);
      allow create: if canEditEnterpriseFinance(request.resource.data);
      allow update: if isTenantImmutable() && isSameTenantRead() && isSameTenantWrite() && canEditEnterpriseFinance(request.resource.data);
      allow delete: if false;
    }

    match /financeiro_categorias/{id} {
      allow read: if canReadEnterpriseFinance(resource.data);
      allow create: if canConfigureEnterpriseFinance(request.resource.data);
      allow update: if isTenantImmutable() && isSameTenantRead() && isSameTenantWrite() && canConfigureEnterpriseFinance(request.resource.data);
      allow delete: if false;
    }

    match /financeiro_centros_custo/{id} {
      allow read: if canReadEnterpriseFinance(resource.data);
      allow create: if canConfigureEnterpriseFinance(request.resource.data);
      allow update: if isTenantImmutable() && isSameTenantRead() && isSameTenantWrite() && canConfigureEnterpriseFinance(request.resource.data);
      allow delete: if false;
    }

    match /financeiro_empresas/{id} {
      allow read: if canReadEnterpriseFinance(resource.data);
      allow create: if canConfigureEnterpriseFinance(request.resource.data);
      allow update: if isTenantImmutable() && isSameTenantRead() && isSameTenantWrite() && canConfigureEnterpriseFinance(request.resource.data);
      allow delete: if false;
    }

    match /financeiro_contas_bancarias/{id} {
      allow read: if canReadEnterpriseFinance(resource.data);
      allow create: if canConfigureEnterpriseFinance(request.resource.data);
      allow update: if isTenantImmutable() && isSameTenantRead() && isSameTenantWrite() && canConfigureEnterpriseFinance(request.resource.data);
      allow delete: if false;
    }

    match /financeiro_recorrencias/{id} {
      allow read: if canReadEnterpriseFinance(resource.data);
      allow create: if canEditEnterpriseFinance(request.resource.data);
      allow update: if isTenantImmutable() && isSameTenantRead() && isSameTenantWrite() && canEditEnterpriseFinance(request.resource.data);
      allow delete: if false;
    }

    match /financeiro_lembretes/{id} {
      allow read: if canReadEnterpriseFinance(resource.data);
      allow create: if canEditEnterpriseFinance(request.resource.data);
      allow update: if isTenantImmutable() && isSameTenantRead() && isSameTenantWrite() && canEditEnterpriseFinance(request.resource.data);
      allow delete: if false;
    }

    match /financeiro_auditoria/{id} {
      allow read: if canReadEnterpriseFinance(resource.data);
      allow create: if validEnterpriseAuditCreate(request.resource.data);
      allow update, delete: if false;
    }
    ${END_MATCHES}
`;

function apply(source) {
  let output = source;
  if (!output.includes(BEGIN_HELPERS)) {
    const helperAnchor = "\n\n    // Permissões de Leads podem existir";
    if (!output.includes(helperAnchor)) throw new Error("Âncora dos helpers não encontrada em firestore.rules");
    output = output.replace(helperAnchor, `\n${helperBlock}${helperAnchor}`);
  }
  if (!output.includes(BEGIN_MATCHES)) {
    const matchAnchor = "    match /categoriasMovimentacao/{id} {";
    if (!output.includes(matchAnchor)) throw new Error("Âncora dos matches não encontrada em firestore.rules");
    output = output.replace(matchAnchor, `${matchBlock}\n${matchAnchor}`);
  }
  return output;
}

const source = fs.readFileSync(file, "utf8");
const result = apply(source);
if (CHECK) {
  const ok = result.includes(BEGIN_HELPERS) && result.includes(BEGIN_MATCHES);
  if (!ok) process.exitCode = 1;
  else console.log("Rules v26 do Controle Financeiro Empresarial: patch válido.");
} else if (result !== source) {
  fs.writeFileSync(file, result, "utf8");
  console.log("firestore.rules atualizado com Controle Financeiro Empresarial v26.");
} else {
  console.log("firestore.rules já contém o Controle Financeiro Empresarial v26.");
}

module.exports = { apply };
