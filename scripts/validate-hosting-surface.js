"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { listFiles } = require("firebase-tools/lib/listFiles");

const root = path.resolve(__dirname, "..");
const firebasePath = path.join(root, "firebase.json");
const config = JSON.parse(fs.readFileSync(firebasePath, "utf8"));
const hostingEntries = Array.isArray(config.hosting) ? config.hosting : [config.hosting];

const requiredIgnorePatterns = [
  "firebase.json",
  "**/.*",
  ".git/**",
  ".github/**",
  ".firebase/**",
  "**/node_modules/**",
  "functions/**",
  "tests/**",
  "scripts/**",
  "docs/**",
  "package.json",
  "package-lock.json",
  "firestore.rules",
  "firestore.indexes.json",
  "storage.rules",
  "README.md",
  "**/*.log"
];

const allowedRootFiles = new Set([
  "index.html",
  "master-global.html",
  "master-local.html",
  "supervisor.html",
  "vendedor.html",
  "financeiro.html",
  "auditor.html",
  "captador.html"
]);
const allowedDirectories = ["css/", "js/", "assets/", "images/", "img/"];
const errors = [];
let totalPublicFiles = 0;

if (!hostingEntries.length || hostingEntries.some(entry => !entry || typeof entry !== "object")) {
  errors.push("firebase.json: configuração de Hosting ausente ou inválida.");
} else {
  hostingEntries.forEach((hosting, index) => {
    const label = hostingEntries.length > 1 ? `hosting[${index}]` : "hosting";
    const publicDir = String(hosting.public || "").trim();
    const ignores = Array.isArray(hosting.ignore) ? hosting.ignore.map(String) : [];

    if (!publicDir) {
      errors.push(`${label}: diretório public não definido.`);
      return;
    }

    const absolutePublicDir = path.resolve(root, publicDir);
    if (!fs.existsSync(absolutePublicDir)) {
      errors.push(`${label}: diretório public não existe: ${publicDir}`);
      return;
    }

    if (publicDir === ".") {
      for (const pattern of requiredIgnorePatterns) {
        if (!ignores.includes(pattern)) {
          errors.push(`${label}: padrão obrigatório ausente em ignore: ${pattern}`);
        }
      }
    }

    const publicFiles = listFiles(absolutePublicDir, ignores).map(file => String(file).replaceAll("\\", "/"));
    totalPublicFiles += publicFiles.length;

    for (const file of publicFiles) {
      const allowed = allowedRootFiles.has(file) || allowedDirectories.some(prefix => file.startsWith(prefix));
      if (!allowed) errors.push(`${label}: arquivo interno seria publicado: ${file}`);
    }
  });
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Superfície pública do Firebase Hosting aprovada (${totalPublicFiles} arquivos estáticos).`);
}
