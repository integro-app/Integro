#!/usr/bin/env node
"use strict";

/**
 * Reset operacional de homologação por tenant.
 *
 * Segurança:
 * - nunca exclui usuários, equipes, cargos, permissões ou configurações;
 * - só atua em coleções operacionais explicitamente listadas;
 * - filtra exclusivamente por clientePlataformaId/tenantId/empresaId;
 * - execução exige confirmação literal RESET:<tenant>;
 * - execução cria backup NDJSON antes de excluir;
 * - restauração exige confirmação literal RESTORE:<tenant>.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const readline = require("node:readline");
const admin = require("firebase-admin");

const DEFAULT_PROJECT = "integro-novo";
const TENANT_FIELDS = ["clientePlataformaId", "tenantId", "empresaId"];

const OPERATIONAL_COLLECTIONS = Object.freeze([
  "leads",
  "indicacoes",
  "clientes",
  "clientes_operacionais",
  "vendas",
  "parcelas",
  "pagamentos",
  "lancamentos_financeiros",
  "solicitacoes",
  "caixas",
  "fechamentos_caixa",
  "reaberturas_caixa",
  "tratamentos_divergencia_caixa",
  "historico_estados_caixa",
  "historicoCobrancas",
  "movCaixa",
  "movcaixa",
  "notificacoes",
  "conversas",
  "contatosCliente",
  "fornecedores",
  "contasPagar",
  "pagamentosContas",
  "logs"
]);

const PRESERVED_COLLECTIONS = Object.freeze([
  "usuarios",
  "equipes",
  "cargos",
  "permissoes_cargo",
  "clientes_plataforma",
  "clientes_integro",
  "configsEmpresa",
  "configsFinanceiras",
  "configuracoes_globais",
  "categoriasFinanceiras",
  "categoriasMovimentacao",
  "catsFinanceiras",
  "formasPagamento",
  "contasFinanceiras",
  "planos",
  "modulos_sistema",
  "departamentos_integro"
]);

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function text(value) {
  return String(value ?? "").trim();
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function ensureSafeTenant(tenant) {
  if (!tenant || tenant.length < 8 || tenant.includes("/") || /\s/.test(tenant)) {
    throw new Error("Tenant inválido. Informe o valor exato de clientePlataformaId.");
  }
}

function ensureCollectionListsSafe() {
  const preserved = new Set(PRESERVED_COLLECTIONS);
  const overlap = OPERATIONAL_COLLECTIONS.filter((name) => preserved.has(name));
  if (overlap.length) {
    throw new Error(`Configuração insegura: coleções preservadas também marcadas para exclusão: ${overlap.join(", ")}`);
  }
}

function encodeValue(value) {
  if (value === null || value === undefined) return value ?? null;
  if (admin.firestore.Timestamp && value instanceof admin.firestore.Timestamp) {
    return { __firestoreType: "Timestamp", seconds: value.seconds, nanoseconds: value.nanoseconds };
  }
  if (admin.firestore.GeoPoint && value instanceof admin.firestore.GeoPoint) {
    return { __firestoreType: "GeoPoint", latitude: value.latitude, longitude: value.longitude };
  }
  if (admin.firestore.DocumentReference && value instanceof admin.firestore.DocumentReference) {
    return { __firestoreType: "DocumentReference", path: value.path };
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return { __firestoreType: "Bytes", base64: Buffer.from(value).toString("base64") };
  }
  if (Array.isArray(value)) return value.map(encodeValue);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeValue(item)]));
  }
  return value;
}

function decodeValue(value, db) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => decodeValue(item, db));
  if (typeof value !== "object") return value;
  if (value.__firestoreType === "Timestamp") {
    return new admin.firestore.Timestamp(Number(value.seconds), Number(value.nanoseconds));
  }
  if (value.__firestoreType === "GeoPoint") {
    return new admin.firestore.GeoPoint(Number(value.latitude), Number(value.longitude));
  }
  if (value.__firestoreType === "DocumentReference") {
    return db.doc(String(value.path));
  }
  if (value.__firestoreType === "Bytes") {
    return Buffer.from(String(value.base64), "base64");
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeValue(item, db)]));
}

async function tenantExists(db, tenant) {
  const directRefs = [
    db.collection("clientes_plataforma").doc(tenant),
    db.collection("clientes_integro").doc(tenant)
  ];
  const direct = await db.getAll(...directRefs);
  if (direct.some((snap) => snap.exists)) return true;

  for (const collection of ["clientes_plataforma", "clientes_integro"]) {
    for (const field of TENANT_FIELDS) {
      const snap = await db.collection(collection).where(field, "==", tenant).limit(1).get();
      if (!snap.empty) return true;
    }
  }
  return false;
}

async function collectRootDocuments(db, tenant) {
  const docs = new Map();
  const errors = [];

  for (const collectionName of OPERATIONAL_COLLECTIONS) {
    const collection = db.collection(collectionName);
    for (const field of TENANT_FIELDS) {
      try {
        const snapshot = await collection.where(field, "==", tenant).get();
        snapshot.docs.forEach((doc) => docs.set(doc.ref.path, doc));
      } catch (error) {
        errors.push({ collection: collectionName, field, message: error?.message || String(error) });
      }
    }
  }

  return { docs, errors };
}

async function collectDocumentTree(docSnap, output) {
  if (!output.has(docSnap.ref.path)) output.set(docSnap.ref.path, docSnap);
  const subcollections = await docSnap.ref.listCollections();
  for (const subcollection of subcollections) {
    const subSnapshot = await subcollection.get();
    for (const child of subSnapshot.docs) {
      await collectDocumentTree(child, output);
    }
  }
}

async function expandWithSubcollections(rootDocs) {
  const all = new Map();
  for (const doc of rootDocs.values()) {
    await collectDocumentTree(doc, all);
  }
  return all;
}

function summarize(docs) {
  const counts = {};
  for (const doc of docs.values()) {
    const rootCollection = doc.ref.path.split("/")[0];
    counts[rootCollection] = (counts[rootCollection] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function printSummary({ tenant, projectId, docs, errors }) {
  const counts = summarize(docs);
  const total = docs.size;
  console.log("\n=== SIMULAÇÃO DO RESET DE HOMOLOGAÇÃO ===");
  console.log(`Projeto: ${projectId}`);
  console.log(`Tenant:  ${tenant}`);
  console.log(`Documentos operacionais encontrados: ${total}`);
  console.log("\nPor coleção raiz:");
  if (!Object.keys(counts).length) console.log("  (nenhum documento encontrado)");
  for (const [collection, count] of Object.entries(counts)) {
    console.log(`  - ${collection}: ${count}`);
  }
  if (errors.length) {
    console.log("\nConsultas com erro (a execução será bloqueada):");
    for (const error of errors) console.log(`  - ${error.collection}.${error.field}: ${error.message}`);
  }
  console.log("\nColeções preservadas:");
  console.log(`  ${PRESERVED_COLLECTIONS.join(", ")}`);
  return { counts, total };
}

function backupPath(tenant, customPath) {
  if (customPath) return path.resolve(customPath);
  return path.resolve(__dirname, "..", "backups", `reset-${tenant}-${nowStamp()}.ndjson`);
}

async function writeBackup({ docs, tenant, projectId, destination }) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const stream = fs.createWriteStream(destination, { encoding: "utf8", flags: "wx" });
  const manifest = {
    recordType: "manifest",
    formatVersion: 1,
    tenant,
    projectId,
    createdAt: new Date().toISOString(),
    documentCount: docs.size,
    operationalCollections: OPERATIONAL_COLLECTIONS,
    preservedCollections: PRESERVED_COLLECTIONS
  };
  stream.write(`${JSON.stringify(manifest)}\n`);
  const sorted = [...docs.values()].sort((a, b) => a.ref.path.localeCompare(b.ref.path));
  for (const doc of sorted) {
    stream.write(`${JSON.stringify({
      recordType: "document",
      path: doc.ref.path,
      data: encodeValue(doc.data())
    })}\n`);
  }
  await new Promise((resolve, reject) => {
    stream.on("error", reject);
    stream.end(resolve);
  });
  return destination;
}

async function deleteDocuments(db, docs) {
  const writer = db.bulkWriter();
  writer.onWriteError((error) => {
    console.error(`Falha ao excluir ${error.documentRef.path}: ${error.message}`);
    return error.failedAttempts < 3;
  });
  const ordered = [...docs.values()].sort((a, b) => {
    const depthDiff = b.ref.path.split("/").length - a.ref.path.split("/").length;
    return depthDiff || b.ref.path.localeCompare(a.ref.path);
  });
  for (const doc of ordered) writer.delete(doc.ref);
  await writer.close();
}

async function createResetAuditLog(db, { tenant, projectId, backupFile, counts, total, operator }) {
  const resetId = crypto.randomUUID();
  const ref = db.collection("logs").doc(`reset_homologacao_${resetId}`);
  await ref.set({
    tipo: "RESET_HOMOLOGACAO",
    tipoAcao: "RESET_HOMOLOGACAO",
    modulo: "ADMINISTRACAO",
    clientePlataformaId: tenant,
    projetoId: projectId,
    colecoesLimpas: counts,
    documentosExcluidos: total,
    backupLocal: backupFile,
    operadorInformado: operator || "não informado",
    resetId,
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    criadoEmTexto: new Date().toISOString()
  });
  return ref.path;
}

async function restoreBackup(db, backupFile, tenant, confirmation) {
  if (confirmation !== `RESTORE:${tenant}`) {
    throw new Error(`Confirmação inválida. Use --confirm "RESTORE:${tenant}".`);
  }
  const input = fs.createReadStream(path.resolve(backupFile), "utf8");
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let manifest = null;
  const documents = [];
  for await (const line of lines) {
    if (!line.trim()) continue;
    const record = JSON.parse(line);
    if (record.recordType === "manifest") manifest = record;
    if (record.recordType === "document") documents.push(record);
  }
  if (!manifest || manifest.tenant !== tenant) {
    throw new Error("Backup inválido ou pertencente a outro tenant.");
  }
  documents.sort((a, b) => a.path.split("/").length - b.path.split("/").length || a.path.localeCompare(b.path));
  const writer = db.bulkWriter();
  writer.onWriteError((error) => error.failedAttempts < 3);
  for (const record of documents) {
    writer.set(db.doc(record.path), decodeValue(record.data, db), { merge: false });
  }
  await writer.close();
  console.log(`Restauração concluída: ${documents.length} documento(s).`);
}

async function main() {
  ensureCollectionListsSafe();
  const args = parseArgs(process.argv);
  const tenant = text(args.tenant);
  const projectId = text(args.project || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || DEFAULT_PROJECT);
  ensureSafeTenant(tenant);

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId
    });
  }
  const db = admin.firestore();
  db.settings({ ignoreUndefinedProperties: true });

  if (args.restore) {
    await restoreBackup(db, args.restore, tenant, text(args.confirm));
    return;
  }

  const exists = await tenantExists(db, tenant);
  if (!exists) {
    throw new Error(`O tenant ${tenant} não foi confirmado em clientes_plataforma/clientes_integro. Execução cancelada.`);
  }

  console.log("Consultando documentos operacionais do tenant...");
  const { docs: roots, errors } = await collectRootDocuments(db, tenant);
  const docs = await expandWithSubcollections(roots);
  const { counts, total } = printSummary({ tenant, projectId, docs, errors });

  if (args["backup-only"]) {
    if (errors.length) throw new Error("Há consultas com erro; o backup pode estar incompleto.");
    const destination = backupPath(tenant, args.backup);
    const file = await writeBackup({ docs, tenant, projectId, destination });
    console.log(`\nBackup criado em: ${file}`);
    return;
  }

  if (!args.execute) {
    console.log("\nModo simulação: nenhum documento foi alterado.");
    console.log(`Para executar: --execute --confirm "RESET:${tenant}"`);
    return;
  }

  if (errors.length) {
    throw new Error("Existem consultas com erro. A exclusão foi bloqueada para evitar reset incompleto.");
  }
  if (text(args.confirm) !== `RESET:${tenant}`) {
    throw new Error(`Confirmação inválida. Use --confirm "RESET:${tenant}".`);
  }
  if (!args["usuarios-offline"]) {
    throw new Error("A execução exige --usuarios-offline para confirmar que todos saíram do sistema.");
  }

  const destination = backupPath(tenant, args.backup);
  const file = await writeBackup({ docs, tenant, projectId, destination });
  console.log(`\nBackup concluído: ${file}`);

  if (total > 0) {
    console.log(`Excluindo ${total} documento(s) operacionais...`);
    await deleteDocuments(db, docs);
  }

  const logPath = await createResetAuditLog(db, {
    tenant,
    projectId,
    backupFile: file,
    counts,
    total,
    operator: text(args.operator || process.env.USERNAME || process.env.USER)
  });

  console.log("\n=== RESET CONCLUÍDO ===");
  console.log(`Tenant: ${tenant}`);
  console.log(`Documentos excluídos: ${total}`);
  console.log(`Backup: ${file}`);
  console.log(`Log de auditoria: ${logPath}`);
  console.log("Saia e entre novamente em todos os perfis; limpe o localStorage do domínio se algum caixa antigo continuar visível.");
}

main().catch((error) => {
  console.error("\nRESET NÃO EXECUTADO:", error?.stack || error?.message || error);
  process.exitCode = 1;
});
