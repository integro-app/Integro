'use strict';
const core = require('./financial-core');
function empresaLiberada(empresa = {}, agora = Date.now()) {
  if (empresa.acessoLiberado === false || empresa.ativo === false || ['BLOQUEADO','INATIVO','SUSPENSO'].includes(core.normalizarStatus(empresa.status || empresa.situacao))) return false;
  const bloqueio = empresa.bloqueioAssinaturaEm;
  if (bloqueio && (bloqueio.toMillis ? bloqueio.toMillis() : Date.parse(bloqueio)) <= agora) return false;
  if (empresa.testeAtivo === true && empresa.dataFimTeste) {
    const fim = empresa.dataFimTeste.toMillis ? empresa.dataFimTeste.toMillis() : Date.parse(empresa.dataFimTeste);
    if (!Number.isFinite(fim) || fim <= agora) return false;
  }
  return true;
}
async function exigirEmpresaOperacional({ db, functions, usuario, tenantId }) {
  if (['MASTER_GLOBAL','USUARIO_INTEGRO'].includes(core.normalizarStatus(usuario.tipoUsuario))) return;
  const deny = () => { throw new functions.https.HttpsError('permission-denied', 'Empresa bloqueada ou período de teste expirado.'); };
  if (usuario.empresaBloqueada === true || usuario.acessoEmpresaLiberado === false || ['BLOQUEADO','INATIVO','SUSPENSO'].includes(core.normalizarStatus(usuario.clientePlataformaStatus || usuario.empresaStatus))) deny();
  const empresaUsuario = String(usuario.clientePlataformaId || usuario.tenantId || usuario.empresaId || '').trim();
  const empresaOperacao = String(tenantId || '').trim();
  if (!empresaUsuario || empresaOperacao !== empresaUsuario || empresaOperacao.includes('/')) {
    throw new functions.https.HttpsError('permission-denied', 'Empresa da operação não corresponde ao usuário.');
  }
  // Os cadastros existentes também usam clientes_plataforma. Uma cópia ativa
  // não pode ocultar um bloqueio registrado na outra coleção.
  const empresas = await Promise.all(['clientes_integro', 'clientes_plataforma']
    .map(colecao => db.collection(colecao).doc(empresaOperacao).get()));
  // Preserva tenants legados sem documento, mas nunca ignora falhas de leitura.
  if (empresas.some(snap => snap.exists && !empresaLiberada(snap.data()))) deny();
}
module.exports = { empresaLiberada, exigirEmpresaOperacional };
