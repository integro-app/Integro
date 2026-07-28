"use strict";

const { initializeTestEnvironment } = require("@firebase/rules-unit-testing");
const { doc, setDoc, writeBatch, Timestamp } = require("firebase/firestore");

const PROJECT_ID = "integro-novo";
const AUTH_BASE = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
const PASSWORD = "IntegroLocal#2026";

function assertLocalHost(value, nome) {
  const host = String(value).split(":")[0];
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    throw new Error(`${nome} deve apontar exclusivamente para um emulator local.`);
  }
}

async function authRequest(endpoint, payload) {
  const response = await fetch(`http://${AUTH_BASE}/identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=integro-local`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  return { ok: response.ok, data };
}

async function ensureAuthUser(email) {
  const created = await authRequest("signUp", { email, password: PASSWORD, returnSecureToken: true });
  if (created.ok) return created.data.localId;
  if (created.data?.error?.message !== "EMAIL_EXISTS") {
    throw new Error(`Falha ao criar ${email}: ${created.data?.error?.message || "erro desconhecido"}`);
  }
  const signed = await authRequest("signInWithPassword", { email, password: PASSWORD, returnSecureToken: true });
  if (!signed.ok) throw new Error(`Falha ao reutilizar ${email}: ${signed.data?.error?.message || "erro desconhecido"}`);
  return signed.data.localId;
}

function userDoc(user, uid) {
  const tipoUsuario = user.perfil === "master_local" ? "master_local" : "usuario_cliente";
  return {
    authUid: uid,
    uid,
    nome: user.nome,
    nomeCompleto: user.nome,
    email: user.email,
    tipoUsuario,
    perfil: user.perfil,
    perfilLegado: user.perfil,
    cargoChave: user.perfil,
    cargoNome: user.cargo,
    clientePlataformaId: user.tenant,
    clientePlataformaNome: user.tenant === "tenant-a" ? "Empresa Homologacao A" : "Empresa Homologacao B",
    equipeId: user.equipeId || "",
    equipesIds: user.equipesIds || (user.equipeId ? [user.equipeId] : []),
    unidadeId: user.tenant === "tenant-a" ? "unidade-a" : "unidade-b",
    status: "ATIVO",
    ativo: true,
    acessoLiberado: true,
    permissoes: user.permissoes || {},
    origem: "seed_homologacao_local"
  };
}

function clienteBase(id, dados, uids) {
  const vendedorUid = dados.vendedorKey ? uids[dados.vendedorKey] : "";
  const agora = Timestamp.fromDate(new Date("2026-07-27T12:00:00-03:00"));
  return {
    id,
    nome: dados.nome,
    nomeCompleto: dados.nome,
    documento: dados.documento,
    documentoNormalizado: dados.documento.replace(/\D/g, ""),
    telefone: dados.telefone,
    telefonePrincipal: dados.telefone,
    telefoneNormalizado: dados.telefone.replace(/\D/g, ""),
    telefonesNormalizados: [dados.telefone.replace(/\D/g, "")],
    clientePlataformaId: dados.tenant || "tenant-a",
    origem: dados.origem || "HOMOLOGACAO",
    status: "ATIVO",
    statusCliente: "ATIVO",
    statusAtendimento: dados.status,
    vendedorId: vendedorUid,
    vendedorAuthUid: vendedorUid,
    vendedorNome: dados.vendedorKey ? dados.vendedorKey.replaceAll("_", " ") : "",
    equipeId: dados.equipeId || "",
    cicloAtendimentoAtual: dados.ciclo || 1,
    tentativasContato: dados.tentativas || 0,
    retrabalhado: Boolean(dados.ciclo && dados.ciclo > 1),
    convertido: dados.status === "CONVERTIDO",
    convertidoAposRetrabalho: dados.status === "CONVERTIDO" && dados.ciclo > 1,
    indicacaoId: dados.indicacaoId || "",
    vendaId: dados.vendaId || "",
    dataRetorno: dados.dataRetorno || "",
    motivoNaoConversao: dados.motivo || "",
    saldoDevedor: 0,
    saldoDevedorCentavos: 0,
    possuiVendaAtiva: false,
    ativo: true,
    excluido: false,
    clienteLegadoId: `legado-${id}`,
    criadoPor: uids.master_a,
    criadoEm: agora,
    atualizadoPor: uids.master_a,
    atualizadoEm: agora,
    ultimaMovimentacaoTexto: "27/07/2026 12:00"
  };
}

async function main() {
  assertLocalHost(AUTH_BASE, "FIREBASE_AUTH_EMULATOR_HOST");
  assertLocalHost(FIRESTORE_HOST, "FIRESTORE_EMULATOR_HOST");

  const users = {
    master_a: { nome: "Master Local A", email: "master.local.a@homologacao.integro.test", perfil: "master_local", cargo: "Master Local", tenant: "tenant-a", equipesIds: ["equipe-a1", "equipe-a2"], permissoes: { clientes: true } },
    supervisor_a: { nome: "Supervisor A", email: "supervisor.a@homologacao.integro.test", perfil: "supervisor", cargo: "Supervisor", tenant: "tenant-a", equipeId: "equipe-a1", permissoes: { gerenciarClientes: true, redistribuirIndicacao: true } },
    vendedor_a1: { nome: "Vendedor Um", email: "vendedor.1.a@homologacao.integro.test", perfil: "vendedor", cargo: "Vendedor", tenant: "tenant-a", equipeId: "equipe-a1" },
    vendedor_a2: { nome: "Vendedor Dois", email: "vendedor.2.a@homologacao.integro.test", perfil: "vendedor", cargo: "Vendedor", tenant: "tenant-a", equipeId: "equipe-a1" },
    vendedor_a3: { nome: "Vendedor Outra Equipe", email: "vendedor.3.a@homologacao.integro.test", perfil: "vendedor", cargo: "Vendedor", tenant: "tenant-a", equipeId: "equipe-a2" },
    auditor_a: { nome: "Auditor A", email: "auditor.a@homologacao.integro.test", perfil: "auditor", cargo: "Auditor", tenant: "tenant-a", equipesIds: ["equipe-a1", "equipe-a2"] },
    master_b: { nome: "Master Local B", email: "master.local.b@homologacao.integro.test", perfil: "master_local", cargo: "Master Local", tenant: "tenant-b", equipesIds: ["equipe-b1"] },
    vendedor_b1: { nome: "Vendedor B", email: "vendedor.1.b@homologacao.integro.test", perfil: "vendedor", cargo: "Vendedor", tenant: "tenant-b", equipeId: "equipe-b1" }
  };

  const uids = {};
  for (const [key, user] of Object.entries(users)) uids[key] = await ensureAuthUser(user.email);

  const [firestoreHost, firestorePort] = FIRESTORE_HOST.split(":");
  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: firestoreHost, port: Number(firestorePort) }
  });

  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    const batch = writeBatch(db);
    const agora = Timestamp.fromDate(new Date("2026-07-27T12:00:00-03:00"));

    batch.set(doc(db, "clientes_integro", "tenant-a"), { nome: "Empresa Homologacao A", status: "ATIVO", ativo: true, acessoLiberado: true, criadoEm: agora });
    batch.set(doc(db, "clientes_integro", "tenant-b"), { nome: "Empresa Homologacao B", status: "ATIVO", ativo: true, acessoLiberado: true, criadoEm: agora });
    batch.set(doc(db, "equipes", "equipe-a1"), { nome: "Equipe A Principal", clientePlataformaId: "tenant-a", supervisorId: uids.supervisor_a, ativo: true });
    batch.set(doc(db, "equipes", "equipe-a2"), { nome: "Equipe A Secundaria", clientePlataformaId: "tenant-a", ativo: true });
    batch.set(doc(db, "equipes", "equipe-b1"), { nome: "Equipe B", clientePlataformaId: "tenant-b", ativo: true });
    for (const [key, user] of Object.entries(users)) batch.set(doc(db, "usuarios", uids[key]), userDoc(user, uids[key]));
    for (const [sufixo, vendedorKey, equipeId] of [
      ["a1", "vendedor_a1", "equipe-a1"],
      ["a2", "vendedor_a2", "equipe-a1"]
    ]) {
      const vendedorId = uids[vendedorKey];
      batch.set(doc(db, "caixas", `caixa-clientes-${sufixo}`), {
        clientePlataformaId: "tenant-a",
        vendedorId,
        vendedorAuthUid: vendedorId,
        usuarioId: vendedorId,
        abertoPorUid: vendedorId,
        equipeId,
        dataOperacional: "2026-07-27",
        dataCaixa: "2026-07-27",
        status: "ABERTO",
        ativo: true,
        excluido: false,
        caixaInicialCentavos: 0,
        saldoAtualCentavos: 0,
        criadoEm: agora,
        atualizadoEm: agora
      });
    }

    const cenarios = [
      ["cliente-nao-direcionado", { nome: "Cliente Nao Direcionado", documento: "10000000001", telefone: "5511900000001", status: "AGUARDANDO_ATENDIMENTO" }],
      ["cliente-vendedor-1", { nome: "Cliente Vendedor Um", documento: "10000000002", telefone: "5511900000002", status: "AGUARDANDO_ATENDIMENTO", vendedorKey: "vendedor_a1", equipeId: "equipe-a1" }],
      ["cliente-vendedor-2", { nome: "Cliente Vendedor Dois", documento: "10000000003", telefone: "5511900000003", status: "AGUARDANDO_ATENDIMENTO", vendedorKey: "vendedor_a2", equipeId: "equipe-a1" }],
      ["cliente-em-atendimento", { nome: "Cliente Em Atendimento", documento: "10000000004", telefone: "5511900000004", status: "EM_ATENDIMENTO", vendedorKey: "vendedor_a1", equipeId: "equipe-a1" }],
      ["cliente-tentativa", { nome: "Cliente Tentativa", documento: "10000000005", telefone: "5511900000005", status: "TENTATIVA_CONTATO", vendedorKey: "vendedor_a1", equipeId: "equipe-a1", tentativas: 2 }],
      ["cliente-retorno", { nome: "Cliente Retorno", documento: "10000000006", telefone: "5511900000006", status: "RETORNO_AGENDADO", vendedorKey: "vendedor_a1", equipeId: "equipe-a1", tentativas: 1, dataRetorno: "2026-07-29T10:00" }],
      ["cliente-nao-convertido", { nome: "Cliente Nao Convertido", documento: "10000000007", telefone: "5511900000007", status: "NAO_CONVERTIDO", vendedorKey: "vendedor_a1", equipeId: "equipe-a1", motivo: "Sem interesse" }],
      ["cliente-recusado", { nome: "Cliente Recusado", documento: "10000000008", telefone: "5511900000008", status: "RECUSADO", vendedorKey: "vendedor_a2", equipeId: "equipe-a1", motivo: "Recusou atendimento" }],
      ["cliente-retrabalho", { nome: "Cliente Retrabalho", documento: "10000000009", telefone: "5511900000009", status: "EM_RETRABALHO", vendedorKey: "vendedor_a1", equipeId: "equipe-a1", ciclo: 2 }],
      ["cliente-convertido", { nome: "Cliente Convertido", documento: "10000000010", telefone: "5511900000010", status: "CONVERTIDO", vendedorKey: "vendedor_a1", equipeId: "equipe-a1", vendaId: "venda-cliente-convertido" }],
      ["cliente-convertido-retrabalho", { nome: "Cliente Convertido Retrabalho", documento: "10000000011", telefone: "5511900000011", status: "CONVERTIDO", vendedorKey: "vendedor_a2", equipeId: "equipe-a1", ciclo: 2, vendaId: "venda-cliente-convertido-retrabalho" }],
      ["cliente-indicacao", { nome: "Cliente Com Indicacao", documento: "10000000012", telefone: "5511900000012", status: "AGUARDANDO_ATENDIMENTO", vendedorKey: "vendedor_a1", equipeId: "equipe-a1", indicacaoId: "indicacao-cliente" }],
      ["cliente-redirecionado", { nome: "Cliente Redirecionado", documento: "10000000013", telefone: "5511900000013", status: "AGUARDANDO_ATENDIMENTO", vendedorKey: "vendedor_a2", equipeId: "equipe-a1" }],
      ["cliente-outra-equipe", { nome: "Cliente Outra Equipe", documento: "10000000016", telefone: "5511900000016", status: "AGUARDANDO_ATENDIMENTO", vendedorKey: "vendedor_a3", equipeId: "equipe-a2" }],
      ["cliente-parado", { nome: "Cliente Parado", documento: "10000000014", telefone: "5511900000014", status: "AGUARDANDO_ATENDIMENTO", vendedorKey: "vendedor_a1", equipeId: "equipe-a1" }],
      ["cliente-possivel-duplicidade", { nome: "Cliente Possivel Duplicidade", documento: "10000000015", telefone: "5511900000002", status: "AGUARDANDO_ATENDIMENTO" }],
      ["cliente-tenant-b", { nome: "Cliente Tenant B", documento: "20000000001", telefone: "5511900001001", status: "AGUARDANDO_ATENDIMENTO", tenant: "tenant-b", vendedorKey: "vendedor_b1", equipeId: "equipe-b1" }]
    ];

    for (const [id, dados] of cenarios) {
      const cliente = clienteBase(id, dados, uids);
      batch.set(doc(db, "clientes_operacionais", id), cliente);
      batch.set(doc(db, "clientes", cliente.clienteLegadoId), { ...cliente, clienteOperacionalId: id, id: cliente.clienteLegadoId });
    }

    batch.set(doc(db, "vendas", "venda-cliente-convertido"), { clientePlataformaId: "tenant-a", clienteId: "cliente-convertido", vendedorId: uids.vendedor_a1, vendedorAuthUid: uids.vendedor_a1, status: "ATIVA", valorTotalCentavos: 100000, criadoEm: agora });
    batch.set(doc(db, "vendas", "venda-cliente-convertido-retrabalho"), { clientePlataformaId: "tenant-a", clienteId: "cliente-convertido-retrabalho", vendedorId: uids.vendedor_a2, vendedorAuthUid: uids.vendedor_a2, status: "ATIVA", valorTotalCentavos: 150000, criadoEm: agora });
    batch.set(doc(db, "vendas", "venda-integracao-retrabalho"), { clientePlataformaId: "tenant-a", clienteId: "cliente-recusado", vendedorId: uids.vendedor_a2, vendedorAuthUid: uids.vendedor_a2, status: "ATIVA", valorTotalCentavos: 50000, criadoEm: agora });
    batch.set(doc(db, "indicacoes", "indicacao-cliente"), { clientePlataformaId: "tenant-a", clienteOperacionalId: "cliente-indicacao", vendedorId: uids.vendedor_a1, vendedorAuthUid: uids.vendedor_a1, equipeId: "equipe-a1", status: "ATRIBUIDA", criadoEm: agora });
    batch.set(doc(db, "direcionamentos_clientes", "direcionamento-redirecionado"), { clientePlataformaId: "tenant-a", clienteId: "cliente-redirecionado", tipo: "REDIRECIONAMENTO", vendedorOrigemId: uids.vendedor_a1, vendedorDestinoId: uids.vendedor_a2, vendedorId: uids.vendedor_a2, vendedorAuthUid: uids.vendedor_a2, equipeId: "equipe-a1", equipeDestinoId: "equipe-a1", usuarioId: uids.master_a, usuarioAuthUid: uids.master_a, motivo: "Redistribuicao de carteira", criadoEm: agora });
    batch.set(doc(db, "interacoes_clientes", "interacao-tentativa"), { clientePlataformaId: "tenant-a", clienteId: "cliente-tentativa", ciclo: 1, tipo: "TENTATIVA_CONTATO", statusAnterior: "AGUARDANDO_ATENDIMENTO", statusNovo: "TENTATIVA_CONTATO", vendedorId: uids.vendedor_a1, vendedorAuthUid: uids.vendedor_a1, equipeId: "equipe-a1", usuarioId: uids.vendedor_a1, usuarioAuthUid: uids.vendedor_a1, observacao: "Sem resposta", criadoEm: agora });
    batch.set(doc(db, "ciclos_atendimento_clientes", "cliente-retrabalho_2"), { clientePlataformaId: "tenant-a", clienteId: "cliente-retrabalho", ciclo: 2, cicloAnterior: 1, vendedorId: uids.vendedor_a1, vendedorAuthUid: uids.vendedor_a1, equipeId: "equipe-a1", usuarioId: uids.master_a, usuarioAuthUid: uids.master_a, motivo: "Nova oportunidade", criadoEm: agora });
    await batch.commit();
  });

  await testEnv.cleanup();
  console.log("Seed local de Clientes concluido de forma idempotente.");
  console.log(`Senha comum local: ${PASSWORD}`);
  for (const user of Object.values(users)) console.log(`- ${user.perfil}: ${user.email}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
