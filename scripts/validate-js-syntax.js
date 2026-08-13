"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const ignoredDirectories = new Set([".git", ".firebase", "node_modules"]);
const errors = [];
let checked = 0;

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(absolute);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".js") || entry.name.endsWith(".min.js")) continue;

    const relative = path.relative(root, absolute).replace(/\\/g, "/");
    const result = spawnSync(process.execPath, ["--check", absolute], { encoding: "utf8" });
    checked += 1;
    if (result.status !== 0) errors.push(`${relative}:\n${result.stderr || result.stdout}`);
  }
}

walk(root);

if (errors.length) {
  console.error(errors.join("\n\n"));
  process.exit(1);
}

console.log(`Sintaxe aprovada em ${checked} arquivos JavaScript externos.`);
