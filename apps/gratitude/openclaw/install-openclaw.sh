#!/usr/bin/env bash
# Merge the gratitude agent config into ~/.openclaw/openclaw.json and restart openclaw.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENCLAW_CONFIG="$HOME/.openclaw/openclaw.json"

node --input-type=module <<JS
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

const configPath = "$OPENCLAW_CONFIG";
const fragmentPath = "$SCRIPT_DIR/openclaw-config-fragment.json5";
const workspace  = "$SCRIPT_DIR";

function parseJson5(src) {
  return JSON.parse(
    src
      .replace(/\/\/[^\n]*/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/,(\s*[}\]])/g, "\$1")
      .replace(/([{,]\s*)([a-zA-Z_\$][a-zA-Z0-9_\$]*)(\s*:)/g, '\$1"\$2"\$3')
  );
}

function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (key === "list" && Array.isArray(source[key])) {
      // Upsert by id instead of replacing the whole array
      target[key] = target[key] ?? [];
      for (const item of source[key]) {
        const idx = target[key].findIndex(x => x.id === item.id);
        if (idx >= 0) Object.assign(target[key][idx], item);
        else target[key].push(item);
      }
    } else if (Array.isArray(source[key])) {
      target[key] = source[key];
    } else if (source[key] && typeof source[key] === "object") {
      target[key] = target[key] ?? {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

const existing = existsSync(configPath)
  ? parseJson5(readFileSync(configPath, "utf8"))
  : {};

const fragment = parseJson5(readFileSync(fragmentPath, "utf8"));
fragment.agents.list[0].workspace = workspace;

mkdirSync(dirname(configPath), { recursive: true });
writeFileSync(configPath, JSON.stringify(deepMerge(existing, fragment), null, 2));
console.log("✓ Config updated:", configPath);
JS

# Restart openclaw gateway if it's running
if pgrep -x openclaw &>/dev/null; then
  echo "  Restarting openclaw gateway..."
  pkill -x openclaw
  sleep 1
  openclaw gateway &
  echo "✓ openclaw restarted"
else
  echo "  openclaw is not running — start it with: openclaw gateway"
fi
