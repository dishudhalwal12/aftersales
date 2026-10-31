import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  commentOutKeys,
  ensureEnvValues,
  parseEnvText,
  readEnvValues,
} from "../scripts/lib/env-file.mjs";

function tempFile(content: string | null): string {
  const directory = mkdtempSync(path.join(tmpdir(), "aftersales-env-"));
  const file = path.join(directory, ".env");
  if (content !== null) writeFileSync(file, content, "utf8");
  return file;
}

describe("env file parsing", () => {
  it("reads values the way the app will, quotes and comments included", () => {
    const values = parseEnvText(
      [
        "# a comment",
        "",
        'DATABASE_URL="postgresql://localhost/aftersales"',
        "AUTH_SECRET='single-quoted'",
        "PLAIN=value",
        "  SPACED  =  padded  ",
        "not a key line",
      ].join("\n"),
    );

    assert.equal(values.get("DATABASE_URL"), "postgresql://localhost/aftersales");
    assert.equal(values.get("AUTH_SECRET"), "single-quoted");
    assert.equal(values.get("PLAIN"), "value");
    assert.equal(values.get("SPACED"), "padded");
    assert.equal(values.size, 4);
  });

  it("treats a missing file as empty rather than an error", () => {
    assert.equal(readEnvValues("/nonexistent/.env").size, 0);
  });
});

describe("env file filling", () => {
  it("creates the file and appends every key", () => {
    const file = tempFile(null);
    const result = ensureEnvValues(file, { A: "1", B: "2" }, { header: "written" });

    assert.equal(result.created, true);
    assert.deepEqual(result.appended, ["A", "B"]);
    const values = readEnvValues(file);
    assert.equal(values.get("A"), "1");
    assert.equal(values.get("B"), "2");
    assert.match(readFileSync(file, "utf8"), /^# written$/m);
  });

  it("fills a key that exists with an empty value, in place", () => {
    const file = tempFile('A=""\nB="keep-me"\n');
    const result = ensureEnvValues(file, { A: "filled", B: "ignored" });

    assert.deepEqual(result.filled, ["A"]);
    assert.deepEqual(result.kept, ["B"]);
    const values = readEnvValues(file);
    assert.equal(values.get("A"), "filled");
    assert.equal(values.get("B"), "keep-me");
  });

  it("never overwrites a value a human set", () => {
    const file = tempFile('A="mine"\n');
    ensureEnvValues(file, { A: "theirs" });
    assert.equal(readEnvValues(file).get("A"), "mine");
  });

  it("leaves comments and unrelated lines exactly where they were", () => {
    const original = '# top\nA=""\n\n# about B\nB=""\n';
    const file = tempFile(original);
    ensureEnvValues(file, { A: "1", B: "2" });

    const text = readFileSync(file, "utf8");
    assert.match(text, /^# top$/m);
    assert.match(text, /^# about B$/m);
    assert.match(text, /^A="1"$/m);
    assert.match(text, /^B="2"$/m);
  });

  it("is idempotent: a second run changes nothing", () => {
    const file = tempFile('A=""\n');
    ensureEnvValues(file, { A: "1", B: "2" });
    const first = readFileSync(file, "utf8");
    const again = ensureEnvValues(file, { A: "1", B: "2" });

    assert.deepEqual(again.appended, []);
    assert.deepEqual(again.filled, []);
    assert.deepEqual(again.kept, ["A", "B"]);
    assert.equal(readFileSync(file, "utf8"), first);
  });

  it("skips empty incoming values instead of writing a blank key", () => {
    const file = tempFile('A=""\n');
    const result = ensureEnvValues(file, { A: "" });
    assert.deepEqual(result.appended, []);
    assert.deepEqual(result.filled, []);
    assert.equal(readEnvValues(file).get("A"), "");
  });

  it("quotes a value that contains a quote", () => {
    const file = tempFile(null);
    ensureEnvValues(file, { ODD: 'say "hi"' });
    assert.equal(readEnvValues(file).get("ODD"), 'say "hi"');
  });
});

describe("commentOutKeys", () => {
  it("comments only the named keys, leaving everything else alone", () => {
    const text = commentOutKeys(
      ['DATABASE_URL="postgresql://placeholder"', 'AUTH_SECRET=""', "DIRECT_URL=x"].join("\n"),
      ["DATABASE_URL", "DIRECT_URL"],
    );

    assert.equal(
      text,
      ['# DATABASE_URL="postgresql://placeholder"', 'AUTH_SECRET=""', "# DIRECT_URL=x"].join("\n"),
    );
    assert.equal(readEnvValues(tempFile(text)).has("DATABASE_URL"), false);
  });
});
