const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('master-local.html', 'utf8');
const start = html.indexOf('  async function buscarColecao(nome, forcar = false){', html.indexOf('function limiteColecaoCaixas'));
const source = html.slice(start, html.indexOf('\n  async function carregarDados(', start));
for (const runtime of [true, false]) {
  for (const teams of [['e1', 'e1', 'e2'], []]) {
    test(`caixas Supervisor aplica tenant/equipe; runtime=${runtime}; equipes=${teams.length}`, async () => {
      const calls = [];
      const query = filters => ({
        where(...f) { return query([...filters, f]); },
        limit() { return this; },
        async get() { calls.push(filters); return { docs: [] }; }
      });
      const sandbox = {
        console, db: () => ({ collection: () => query([]) }), tenantPrincipal: () => 'tenant-a',
        col: v => v.toLowerCase(), limiteColecaoCaixas: () => 400, pertenceTenant: () => true,
        window: { State: { getUsuario: () => ({}) }, IntegroAcesso: { acessoUsuario: () => ({ perfil: 'supervisor', equipeIds: teams }) } }
      };
      if (runtime) sandbox.window.IntegroDataRuntime = { consultarTenant: async o => { calls.push([['clientePlataformaId', '==', o.tenantId], ...o.filtros]); return []; } };
      vm.runInNewContext(source + '\nthis.read = buscarColecao;', sandbox);
      for (const collection of ['CAIXAS', 'VENDAS', 'PAGAMENTOS', 'SOLICITACOES']) await sandbox.read(collection, true);
      assert.equal(calls.length, teams.length ? 8 : 0);
      for (const filters of calls) {
        assert.ok(filters.some(f => f[0] === 'clientePlataformaId' && f[2] === 'tenant-a'));
        assert.ok(filters.some(f => f[0] === 'equipeId' && ['e1', 'e2'].includes(f[2])));
      }
    });
  }
}
