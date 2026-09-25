"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("Functions e Firebase usam runtime Node.js 22", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "functions/package.json"), "utf8"));
  const firebase = JSON.parse(fs.readFileSync(path.join(root, "firebase.json"), "utf8"));
  assert.equal(pkg.engines.node, "22");
  assert.equal(firebase.functions.runtime, "nodejs22");
});

test("regras não mantêm helper de transição sem uso", () => {
  const rules = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
  assert.doesNotMatch(rules, /function hasOnlyStatusTransition/);
});

test("homologação local conecta Auth, Firestore, Functions, Storage e Hosting aos emuladores", () => {
  const firebaseJson = JSON.parse(fs.readFileSync(path.join(root, "firebase.json"), "utf8"));
  const config = fs.readFileSync(path.join(root, "js/firebase-config.js"), "utf8");
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(firebaseJson.emulators.functions.port, 5001);
  assert.match(config, /functions\("southamerica-east1"\)\.useEmulator\("127\.0\.0\.1", 5001\)/);
  assert.match(config, /functions: "127\.0\.0\.1:5001"/);
  assert.match(config, /sessionStorage\.setItem\("integro:instrumentar", "1"\)/);
  assert.match(pkg.scripts["emulators:homologacao"], /auth,firestore,functions,hosting,storage/);
});
