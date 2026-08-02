"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const htmlFiles = fs.readdirSync(root).filter((name) => name.endsWith(".html"));
const errors = [];
let checked = 0;

for (const file of htmlFiles) {
  const html = fs.readFileSync(path.join(root, file), "utf8");
  const regex = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  let index = 0;

  while ((match = regex.exec(html))) {
    const attrs = match[1] || "";
    const code = match[2] || "";
    const type = (attrs.match(/\btype=["']([^"']+)["']/i)?.[1] || "text/javascript").toLowerCase();
    index += 1;

    if (/\bsrc=/.test(attrs) || !/(javascript|ecmascript|module)$/.test(type) || !code.trim()) continue;

    const temp = path.join(os.tmpdir(), `integro-${path.basename(file, ".html")}-${index}.js`);
    fs.writeFileSync(temp, code, "utf8");
    const result = spawnSync(process.execPath, ["--check", temp], { encoding: "utf8" });
    fs.rmSync(temp, { force: true });
    checked += 1;

    if (result.status !== 0) {
      errors.push(`${file} / script ${index}:\n${result.stderr || result.stdout}`);
    }
  }
}

if (errors.length) {
  console.error(errors.join("\n\n"));
  process.exit(1);
}

console.log(`Sintaxe aprovada em ${checked} scripts inline de ${htmlFiles.length} telas.`);
