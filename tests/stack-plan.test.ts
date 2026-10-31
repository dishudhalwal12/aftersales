import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { DEFAULT_PORTS, MIN_BAILEYS_SECRET, isLocalUrl, planStack } from "../scripts/lib/stack-plan.mjs";

const SECRET = "a".repeat(64);
const OTHER = "b".repeat(64);

type PlannedService = { id: string; port: number; url: string; env: Record<string, string> };

type Plan = {
  web: { port: number; env: Record<string, string>; enabled: boolean };
  services: PlannedService[];
  skipped: { id: string; reason: string }[];
  notes: string[];
};

function plan(overrides: Record<string, unknown> = {}): Plan {
  return planStack({
    rootEnv: new Map<string, string>(),
    env: {},
    layaEnv: new Map<string, string>(),
    baileysEnv: new Map<string, string>(),
    ports: { ...DEFAULT_PORTS },
    capabilities: { layaSupported: true, layaPrepared: true, baileysPrepared: true },
    mode: {},
    secretFactory: () => SECRET,
    ...overrides,
  }) as Plan;
}

/** The planned service with this id. Asserts rather than returning `undefined`. */
function service(result: Plan, id: string): PlannedService {
  const found = result.services.find((entry) => entry.id === id);
  assert.ok(found, `expected ${id} to be planned`);
  return found;
}

function skipFor(result: Plan, id: string): { id: string; reason: string } {
  const found = result.skipped.find((entry) => entry.id === id);
  assert.ok(found, `expected a skip reason for ${id}`);
  return found;
}

describe("stack plan — what starts", () => {
  it("starts both services on loopback by default and wires the app to them", () => {
    const result = plan();

    assert.deepEqual(
      result.services.map((entry) => entry.id),
      ["laya", "baileys"],
    );
    assert.equal(result.web.port, DEFAULT_PORTS.web);
    assert.equal(result.web.env.LAYA_SERVICE_URL, `http://127.0.0.1:${DEFAULT_PORTS.laya}`);
    assert.equal(result.web.env.BAILEYS_SERVICE_URL, `http://127.0.0.1:${DEFAULT_PORTS.baileys}`);
    assert.equal(result.skipped.length, 0);
  });

  it("gives both sides of a pair the same secret", () => {
    const result = plan();

    assert.equal(service(result, "laya").env.LAYA_SERVICE_SECRET, SECRET);
    assert.equal(result.web.env.LAYA_SERVICE_SECRET, SECRET);
    assert.equal(service(result, "baileys").env.BAILEYS_SERVICE_SECRET, SECRET);
    assert.equal(result.web.env.BAILEYS_SERVICE_SECRET, SECRET);
  });

  it("reuses an existing secret from the root .env instead of generating one", () => {
    const result = plan({
      rootEnv: new Map([
        ["LAYA_SERVICE_SECRET", "root-laya"],
        ["BAILEYS_SERVICE_SECRET", "root-baileys-secret-value"],
      ]),
      secretFactory: () => "generated",
    });

    assert.equal(result.web.env.LAYA_SERVICE_SECRET, "root-laya");
    assert.equal(result.web.env.BAILEYS_SERVICE_SECRET, "root-baileys-secret-value");
    assert.equal(result.notes.length, 0);
  });

  it("adopts a secret that only the service's own .env has", () => {
    const result = plan({
      layaEnv: new Map([["LAYA_SERVICE_SECRET", "file-only-secret"]]),
      baileysEnv: new Map([["BAILEYS_SERVICE_SECRET", "bridge-file-secret-value"]]),
      secretFactory: () => "generated",
    });

    assert.equal(result.web.env.LAYA_SERVICE_SECRET, "file-only-secret");
    assert.equal(result.web.env.BAILEYS_SERVICE_SECRET, "bridge-file-secret-value");
  });

  it("lets the process environment win over the file", () => {
    const result = plan({
      rootEnv: new Map([["LAYA_SERVICE_SECRET", "from-file"]]),
      env: { LAYA_SERVICE_SECRET: "from-shell" },
    });
    assert.equal(result.web.env.LAYA_SERVICE_SECRET, "from-shell");
  });

  it("replaces a Baileys secret the bridge itself would refuse", () => {
    const short = "short";
    assert.ok(short.length < MIN_BAILEYS_SECRET);
    const result = plan({
      rootEnv: new Map([["BAILEYS_SERVICE_SECRET", short]]),
      secretFactory: () => SECRET,
    });

    assert.equal(result.web.env.BAILEYS_SERVICE_SECRET, SECRET);
    assert.ok(result.notes.some((line: string) => line.includes("BAILEYS_SERVICE_SECRET")));
  });

  it("keeps a pinned checkpoint from the service's .env", () => {
    const result = plan({ layaEnv: new Map([["LAYA_MODEL", "/models/laya-typed"]]) });
    assert.equal(service(result, "laya").env.LAYA_MODEL, "/models/laya-typed");
  });
});

describe("stack plan — deployed endpoints", () => {
  it("does not start Laya when the app is pointed at a remote one", () => {
    const result = plan({
      rootEnv: new Map([
        ["LAYA_SERVICE_URL", "https://laya.example.com"],
        ["LAYA_SERVICE_SECRET", "remote-secret"],
      ]),
    });

    assert.deepEqual(
      result.services.map((entry) => entry.id),
      ["baileys"],
    );
    assert.equal(result.web.env.LAYA_SERVICE_URL, "https://laya.example.com");
    assert.equal(result.web.env.LAYA_SERVICE_SECRET, "remote-secret");
    assert.match(skipFor(result, "laya").reason, /remote/);
  });

  it("does not start Baileys when the app is pointed at a remote bridge", () => {
    const result = plan({
      rootEnv: new Map([
        ["BAILEYS_SERVICE_URL", "https://bridge.example.com"],
        ["BAILEYS_SERVICE_SECRET", "remote-bridge-secret-value"],
      ]),
    });

    assert.deepEqual(
      result.services.map((entry) => entry.id),
      ["laya"],
    );
    assert.equal(result.web.env.BAILEYS_SERVICE_URL, "https://bridge.example.com");
    assert.equal(result.web.env.BAILEYS_SERVICE_SECRET, "remote-bridge-secret-value");
  });

  it("points the bridge at the resolved web port when the backend is local", () => {
    const result = plan({ ports: { web: 3012, baileys: 3001, laya: 8100 } });
    assert.equal(service(result, "baileys").env.VERCEL_BACKEND_URL, "http://127.0.0.1:3012");
  });

  it("leaves a deliberately remote backend URL alone", () => {
    const result = plan({
      baileysEnv: new Map([["VERCEL_BACKEND_URL", "https://aftersales.example.app"]]),
    });
    assert.equal(
      service(result, "baileys").env.VERCEL_BACKEND_URL,
      "https://aftersales.example.app",
    );
  });

  it("treats localhost and 127.0.0.1 as local, and everything else as deployed", () => {
    assert.equal(isLocalUrl("http://localhost:8100"), true);
    assert.equal(isLocalUrl("http://127.0.0.1:8100"), true);
    assert.equal(isLocalUrl("http://[::1]:8100"), true);
    assert.equal(isLocalUrl("https://laya.example.com"), false);
    assert.equal(isLocalUrl("http://192.168.1.20:8100"), false);
    assert.equal(isLocalUrl(""), false);
    assert.equal(isLocalUrl("not a url"), false);
  });
});

describe("stack plan — what is skipped, and why", () => {
  it("skips Laya on a machine MLX cannot run on, and says so", () => {
    const result = plan({ capabilities: { layaSupported: false, layaPrepared: false, baileysPrepared: true } });

    assert.deepEqual(
      result.services.map((entry) => entry.id),
      ["baileys"],
    );
    const skip = skipFor(result, "laya");
    assert.match(skip.reason, /Apple silicon/);
    assert.ok(!("LAYA_SERVICE_URL" in result.web.env));
  });

  it("skips a service that was never installed, with the fix", () => {
    const result = plan({ capabilities: { layaSupported: true, layaPrepared: false, baileysPrepared: false } });

    assert.deepEqual(result.services, []);
    for (const entry of result.skipped) {
      assert.match(entry.reason, /npm run setup/);
    }
  });

  it("honours an explicit opt-out", () => {
    const result = plan({ mode: { noLaya: true, noBaileys: true } });
    assert.deepEqual(result.services, []);
    assert.equal(result.skipped.length, 2);
  });

  it("starts only the services when the app is run elsewhere", () => {
    const result = plan({ mode: { servicesOnly: true } });
    assert.equal(result.web.enabled, false);
    assert.equal(result.services.length, 2);
  });
});
