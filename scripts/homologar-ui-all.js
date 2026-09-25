"use strict";

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const perfis = ["master_global", "master_local", "gerente", "supervisor", "financeiro", "vendedor", "captador", "auditor"];
const consolidado = { perfis: [], responsividade: [], ciclos: null, errosConsole: [], falhasRede: [] };

for (let indice = 0; indice < perfis.length; indice++) {
  const perfil = perfis[indice];
  const execucao = spawnSync(process.execPath, [path.join(__dirname, "homologar-ui-cdp.js")], {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, INTEGRO_HOMOLOG_PROFILE: perfil, INTEGRO_CDP_PORT: String(9333 + indice) },
    encoding: "utf8",
    windowsHide: true,
    timeout: 120000
  });
  if (execucao.status !== 0) {
    process.stderr.write(execucao.stderr || execucao.stdout || `Falha ao homologar ${perfil}.\n`);
    process.exit(execucao.status || 1);
  }
  const resultado = JSON.parse(execucao.stdout);
  consolidado.perfis.push(...resultado.perfis);
  consolidado.responsividade.push(...resultado.responsividade);
  consolidado.ciclos ||= resultado.ciclos;
  consolidado.errosConsole.push(...resultado.errosConsole.map(erro => `${perfil}: ${erro}`));
  consolidado.falhasRede.push(...resultado.falhasRede.map(erro => `${perfil}: ${erro}`));
}

if (consolidado.errosConsole.length) {
  throw new Error(`Erros de console na homologação:\n${consolidado.errosConsole.join("\n")}`);
}
if (consolidado.falhasRede.length) {
  throw new Error(`Falhas de rede na homologação:\n${consolidado.falhasRede.join("\n")}`);
}

process.stdout.write(JSON.stringify(consolidado, null, 2) + "\n");
