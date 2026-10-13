#!/usr/bin/env bun
// ob-plugin-prompt-shield-sanitize — enveloppe un texte non fiable dans un bloc
// délimité infalsifiable + rapport de risque, AVANT que l'agent ne le lise.
//
// Usage :
//   ob-plugin-prompt-shield-sanitize --source web:exemple.com --file page.txt
//   curl -s https://exemple.com | ob-plugin-prompt-shield-sanitize --source https://exemple.com
//   ob-plugin-prompt-shield-sanitize --json "texte court"
//
// Options : --source NOM  --file FICHIER  --json  --quiet  --strictness permissive|balanced|strict  --max-chars N
// Entrée  : --file, sinon premier argument, sinon stdin.
// Sortie  : bloc wrappé sur stdout ; rapport JSON sur stderr (--json : {wrapped, report} sur stdout).
// Exit    : 0 clean/low · 3 medium+ · 1 erreur de lecture · 2 usage.

import { readFileSync } from "node:fs";

let core;
try {
  core = await import("/usr/local/bin/ob-plugin-prompt-shield-core.js");
} catch {
  core = await import(new URL("../files/core.js", import.meta.url).href);
}
const { analyze, wrap, loadConfig, STRICTNESS } = core;

const usage = (code) => {
  console.error(`Usage: ob-plugin-prompt-shield-sanitize [--source NOM] [--file FICHIER | "texte"] [--json] [--quiet] [--strictness permissive|balanced|strict] [--max-chars N]
Entrée: --file, sinon premier argument, sinon stdin.
Sortie: bloc wrappé sur stdout, rapport JSON sur stderr (--json: {wrapped, report} sur stdout).
Exit: 0 clean/low, 3 medium+, 1 erreur de lecture, 2 usage.`);
  process.exit(code);
};

const argv = process.argv.slice(2);
if (!argv.length || argv.some((a) => a === "-h" || a === "--help")) usage(argv.length ? 0 : 2);

let source = "inconnue", file = null, json = false, quiet = false, strictOverride = null, maxCharsOverride = null, positional = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--source") source = argv[++i] ?? usage(2);
  else if (a === "--file") file = argv[++i] ?? usage(2);
  else if (a === "--json") json = true;
  else if (a === "--quiet") quiet = true;
  else if (a === "--strictness") strictOverride = argv[++i] ?? usage(2);
  else if (a === "--max-chars") maxCharsOverride = Number(argv[++i] ?? usage(2));
  else if (a.startsWith("--")) usage(2);
  else if (positional === null) positional = a;
  else usage(2);
}
if (strictOverride && !STRICTNESS.includes(strictOverride)) usage(2);
if (maxCharsOverride !== null && (!Number.isFinite(maxCharsOverride) || maxCharsOverride < 1000)) usage(2);

let text;
try {
  if (file) text = readFileSync(file, "utf8");
  else if (positional !== null) text = positional;
  else text = readFileSync(0, "utf8");
} catch (e) {
  console.error(JSON.stringify({ error: `lecture impossible: ${e.message}` }));
  process.exit(1);
}

const cfg = loadConfig();
const report = analyze(text, {
  strictness: strictOverride ?? cfg.strictness,
  max_chars: maxCharsOverride ?? cfg.max_chars,
});
const { wrapped } = wrap(text, source, report);

if (json) console.log(JSON.stringify({ wrapped, report }, null, 2));
else {
  console.log(wrapped);
  if (!quiet) console.error(JSON.stringify(report));
}
process.exit(report.level === "clean" || report.level === "low" ? 0 : 3);
