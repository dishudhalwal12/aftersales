// Reading and editing `.env` files without a dependency.
//
// Two jobs: read values the way the app will read them, and fill in a key the file
// already has but left empty. A key that is present with a real value is never
// overwritten — that is the operator's decision, not this script's.

import { existsSync, readFileSync, writeFileSync } from "node:fs";

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** One layer of surrounding quotes, matching what Next and dotenv strip. */
function unquote(value) {
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    // Double quotes carry escapes: `\"`, `\\` and `\n`, the same three dotenv understands.
    return value
      .slice(1, -1)
      .replace(/\\(["\\n])/g, (_, char) => (char === "n" ? "\n" : char));
  }
  if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
    // Single quotes are literal, so a backslash stays a backslash.
    return value.slice(1, -1);
  }
  return value;
}

/** `KEY=value` pairs from the text of a `.env` file. Blank lines and comments are skipped. */
export function parseEnvText(text) {
  const values = new Map();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const equals = line.indexOf("=");
    if (equals <= 0) continue;
    const key = line.slice(0, equals).trim();
    if (!KEY_PATTERN.test(key)) continue;
    values.set(key, unquote(line.slice(equals + 1).trim()));
  }
  return values;
}

export function readEnvValues(path) {
  if (!existsSync(path)) return new Map();
  return parseEnvText(readFileSync(path, "utf8"));
}

function lineFor(key, value) {
  return `${key}="${String(value).replace(/"/g, '\\"')}"`;
}

/**
 * Make sure every `entries` pair has a non-empty value in `path`.
 *
 * - a key that is absent is appended under `header`;
 * - a key present with an empty value (`KEY=""`) is filled in place;
 * - a key present with a value is left exactly as it is.
 *
 * Returns which keys were appended, which were filled, and which were left alone.
 */
export function ensureEnvValues(path, entries, { header } = {}) {
  const existed = existsSync(path);
  const lines = existed ? readFileSync(path, "utf8").split(/\r?\n/) : [];
  const filled = [];
  const appended = [];
  const kept = [];

  for (const [key, value] of Object.entries(entries)) {
    if (value === undefined || value === null || String(value).length === 0) continue;

    let found = false;
    let alreadySet = false;
    for (let index = 0; index < lines.length; index += 1) {
      const match = /^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(lines[index]);
      if (!match || match[2] !== key) continue;
      found = true;
      if (unquote(match[3].trim()).length > 0) {
        alreadySet = true;
        continue;
      }
      lines[index] = `${match[1]}${lineFor(key, value)}`;
      filled.push(key);
    }

    if (alreadySet) kept.push(key);
    else if (!found) appended.push(key);
  }

  if (appended.length > 0) {
    const block = [
      "",
      ...(header ? [`# ${header}`] : []),
      ...appended.map((key) => lineFor(key, entries[key])),
    ];
    // Keep exactly one trailing newline at the end of the file.
    while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
    lines.push(...block, "");
  }

  if (appended.length > 0 || filled.length > 0 || !existed) {
    writeFileSync(path, `${lines.join("\n")}`, "utf8");
  }

  return { created: !existed, appended, filled, kept };
}

/** Wrap `#`-comments around a key's line, so an example placeholder cannot be used by accident. */
export function commentOutKeys(text, keys) {
  const wanted = new Set(keys);
  return text
    .split(/\r?\n/)
    .map((line) => {
      const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
      return match && wanted.has(match[1]) ? `# ${line}` : line;
    })
    .join("\n");
}
