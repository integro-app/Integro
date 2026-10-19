"use strict";
// Somente leitura de snapshots locais. Não importa Firebase, não conecta e não aplica planos.
const fs = require("node:fs");
const crypto = require("node:crypto");
const text = value => typeof value === "string" ? value.trim() : "";
const tenant = data => text(data.clientePlataformaId || data.empresaId || data.tenantId);
const aliases = row => [...new Set([row.id, row.data.id, row.data.usuarioId, row.data.vendedorId].map(text).filter(Boolean))];
const hash = data => crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
const collections = new Set(["caixas", "clientes_operacionais", "vendas", "parcelas", "pagamentos", "historicoCobrancas", "solicitacoes", "lancamentos_financeiros"]);

function inventariar(usuarios) {
  const problemas = [];
  for (const row of usuarios) {
    const uid = text(row.data.authUid);
    const registrar = codigo => problemas.push({ documento: `usuarios/${row.id}`, tenant: tenant(row.data), codigo });
    if (!uid) registrar("SEM_AUTH_UID");
    else {
      if (uid !== row.id) registrar("DOCUMENTO_NAO_CANONICO");
      if (usuarios.some(other => other !== row && text(other.data.authUid) === uid)) registrar("AUTH_UID_DUPLICADO");
    }
    if (text(row.data.uid) && text(row.data.uid) !== uid) registrar("AUTH_ALIAS_CONFLITANTE");
    const tenants = [row.data.clientePlataformaId, row.data.empresaId, row.data.tenantId].map(text).filter(Boolean);
    if (new Set(tenants).size > 1) registrar("TENANT_CONFLITANTE");
    if (usuarios.some(other => other !== row && tenant(other.data) === tenant(row.data) && aliases(other).some(id => aliases(row).includes(id)))) registrar("ALIAS_AMBIGUO");
  }
  return problemas;
}

function planejar(snapshot, pedido) {
  const usuarios = snapshot.usuarios || [];
  const blocked = codigo => ({ ok: false, codigo, operacoes: [] });
  if (snapshot.completo !== true) return blocked("SNAPSHOT_COMPLETO_NECESSARIO");
  const matches = usuarios.filter(row => row.id === pedido.usuarioId);
  if (matches.length !== 1) return blocked("CADASTRO_AUSENTE_OU_DUPLICADO");
  const source = matches[0], uid = text(pedido.authUid), scope = tenant(source.data);
  if (!uid || pedido.authUid !== uid || uid.includes("/") || !source.id || source.id.includes("/")) return blocked("IDENTIFICADOR_INVALIDO");
  const auth = (snapshot.authUsers || []).filter(user => user.uid === uid);
  if (auth.length !== 1 || auth[0].disabled !== false) return blocked("AUTH_NAO_COMPROVADO_OU_DESABILITADO");
  // A prova é o vínculo persistido exato ou o próprio ID do documento; nunca e-mail/nome.
  if ((source.data.authUid || source.id) !== uid) return blocked("VINCULO_NAO_COMPROVADO");
  if (inventariar(usuarios).some(p => p.documento === `usuarios/${source.id}` && ["TENANT_CONFLITANTE", "ALIAS_AMBIGUO", "AUTH_UID_DUPLICADO", "AUTH_ALIAS_CONFLITANTE"].includes(p.codigo))) return blocked("IDENTIDADE_AMBIGUA");
  if (text(pedido.clientePlataformaId) !== scope) return blocked("TENANT_DIVERGENTE");
  const platform = ["master_global", "usuario_integro"].includes(source.data.tipoUsuario);
  if (!scope && !platform) return blocked("TENANT_AUSENTE");
  if (source.id !== uid && usuarios.some(row => row.id === uid)) return blocked("DESTINO_EXISTENTE_NAO_MESCLAR");
  const operacoes = [];
  if (source.id !== uid || source.data.authUid !== uid) operacoes.push({
    documento: `usuarios/${uid}`, tipo: source.id === uid ? "COMPLETAR_AUTH_UID" : "COPIAR_SE_DESTINO_AUSENTE",
    origem: `usuarios/${source.id}`, hashOrigem: hash(source.data),
    dados: { ...source.data, authUid: uid }
  });
  const ownedAliases = new Set([...aliases(source), uid]);
  // UID de outra conta Auth não pode ser interpretado como alias, mesmo sem perfil operacional.
  if ((snapshot.authUsers || []).some(user => user.uid !== uid && ownedAliases.has(user.uid))) return blocked("ALIAS_PERTENCE_A_OUTRO_AUTH");
  for (const [name, rows] of Object.entries(snapshot.colecoes || {})) {
    if (!collections.has(name)) continue;
    for (const row of rows) {
      const data = row.data;
      if (!scope || tenant(data) !== scope) continue;
      const references = [data.vendedorId, data.vendedorUid, data.usuarioId, data.responsavelId].map(text).filter(Boolean);
      const canonical = text(data.vendedorAuthUid);
      if (!references.some(id => ownedAliases.has(id)) && canonical !== uid) continue;
      if (canonical && canonical !== uid) return blocked("PROPRIETARIO_CANONICO_CONFLITANTE");
      if (references.some(id => !ownedAliases.has(id))) return blocked("REFERENCIAS_CONFLITANTES");
      const tenants = [data.clientePlataformaId, data.empresaId, data.tenantId].map(text).filter(Boolean);
      if (new Set(tenants).size > 1) return blocked("TENANT_DO_RECURSO_CONFLITANTE");
      if (!canonical) operacoes.push({ documento: `${name}/${row.id}`, tipo: "COMPLETAR_PROPRIETARIO", hashOrigem: hash(data), patch: { vendedorAuthUid: uid } });
    }
  }
  return { ok: true, somentePlanejamento: true, authUid: uid, clientePlataformaId: scope, operacoes };
}

module.exports = { inventariar, planejar };
if (require.main === module) {
  const [arquivo, pedido] = process.argv.slice(2);
  if (!arquivo) throw new Error("Uso: node scripts/planejar-regularizacao-auth.cjs snapshot.json [pedido.json]. Sem modo de aplicação.");
  const snapshot = JSON.parse(fs.readFileSync(arquivo, "utf8").replace(/^\uFEFF/, ""));
  console.log(JSON.stringify(pedido ? planejar(snapshot, JSON.parse(fs.readFileSync(pedido, "utf8"))) : inventariar(snapshot.usuarios || []), null, 2));
}
