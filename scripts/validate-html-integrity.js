const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const pages = [
  "index.html",
  "master-global.html",
  "master-local.html",
  "supervisor.html",
  "vendedor.html",
  "financeiro.html",
  "auditor.html",
  "captador.html"
];

const errors = [];
const warnings = [];

function localPath(page, value) {
  const clean = String(value || "").split(/[?#]/)[0];
  if (!clean || /^(?:https?:|data:|mailto:|tel:|#|javascript:)/i.test(clean)) return null;
  return path.resolve(root, path.dirname(page), clean);
}

function executableInlineScripts(html) {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(match => !/\bsrc\s*=/.test(match[1]))
    .filter(match => !/\btype\s*=\s*["'](?:application\/json|importmap)["']/i.test(match[1]));
}

for (const page of pages) {
  const absolute = path.join(root, page);
  const html = fs.readFileSync(absolute, "utf8");

  executableInlineScripts(html).forEach((match, index) => {
    try {
      new vm.Script(match[2], { filename: `${page}#inline-${index + 1}` });
    } catch (error) {
      errors.push(`${page}: script inline ${index + 1}: ${error.message}`);
    }
  });

  const markup = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");

  const ids = [...markup.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map(match => match[1]);
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  duplicates.forEach(id => errors.push(`${page}: ID duplicado no HTML: ${id}`));

  for (const match of markup.matchAll(/<(?:script|link|img)\b[^>]*\b(?:src|href)\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    const target = localPath(page, match[1]);
    if (target && !fs.existsSync(target)) errors.push(`${page}: recurso local ausente: ${match[1]}`);
  }

  const handlers = [...markup.matchAll(/\bonclick\s*=\s*["']\s*([A-Za-z_$][\w$]*)\s*\(/gi)]
    .map(match => match[1]);
  const sources = [html];
  for (const match of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    const target = localPath(page, match[1]);
    if (target && fs.existsSync(target)) sources.push(fs.readFileSync(target, "utf8"));
  }
  const source = sources.join("\n");
  for (const handler of new Set(handlers)) {
    const escaped = handler.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const declared = new RegExp(`(?:function\\s+${escaped}\\s*\\(|(?:window\\.)?${escaped}\\s*=|(?:const|let|var)\\s+${escaped}\\s*=)`).test(source);
    if (!declared) warnings.push(`${page}: onclick sem declaração estática localizada: ${handler}`);
  }
}

if (warnings.length) {
  console.warn(warnings.join("\n"));
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Integridade HTML aprovada em ${pages.length} telas (${warnings.length} aviso(s)).`);
}
