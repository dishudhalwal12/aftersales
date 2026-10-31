import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import {
  blockExtensionAttributeWrites,
  installHydrationGuard,
  type GuardElementPrototype,
  type GuardMutationRecord,
} from "../../src/shared/hydration/guard-install.ts";

/**
 * The bug this file pins: a browser extension wrote `bis_skin_checked`, `bis_register` and
 * `__processed_<uuid>__` onto our elements before React hydrated, so `/auth` reported every
 * touched element as a hydration mismatch. Our own markup was identical on both sides.
 *
 * Cleaning up after the extension is not enough on its own — a MutationObserver strip is a
 * microtask and React hydrates synchronously — so the guard also refuses the writes.
 */
describe("blockExtensionAttributeWrites — the extension can no longer write markers", () => {
  it("silently drops a marker write", () => {
    const prototype = stubPrototype();
    blockExtensionAttributeWrites(prototype);

    const element = new StubElement(prototype);
    element.setAttribute("bis_skin_checked", "1");

    assert.deepEqual(element.getAttributeNames(), []);
  });

  it("lets every other attribute through, unchanged", () => {
    const prototype = stubPrototype();
    blockExtensionAttributeWrites(prototype);

    const element = new StubElement(prototype);
    element.setAttribute("class", "auth-card");
    element.setAttribute("aria-selected", "true");

    assert.deepEqual(element.getAttributeNames(), ["class", "aria-selected"]);
    assert.equal(element.getAttribute("class"), "auth-card");
  });

  it("covers the namespaced setter too", () => {
    const prototype = stubPrototype();
    blockExtensionAttributeWrites(prototype);

    const element = new StubElement(prototype);
    element.setAttributeNS?.(null, "data-lt-installed", "true");
    element.setAttributeNS?.(null, "data-testid", "ok");

    assert.deepEqual(element.getAttributeNames(), ["data-testid"]);
  });

  it("covers setAttributeNode, which bypasses the string setters", () => {
    const prototype = stubPrototype();
    blockExtensionAttributeWrites(prototype);

    const element = new StubElement(prototype);
    element.setAttributeNode?.({ name: "bis_register" });
    element.setAttributeNode?.({ name: "id" });

    assert.deepEqual(element.getAttributeNames(), ["id"]);
  });

  it("wraps each prototype only once, so repeat installs cannot stack", () => {
    const prototype = stubPrototype();
    blockExtensionAttributeWrites(prototype);
    const afterFirst = prototype.setAttribute;
    blockExtensionAttributeWrites(prototype);

    assert.equal(prototype.setAttribute, afterFirst);
  });
});

describe("installHydrationGuard — sweeps what the extension already wrote", () => {
  it("strips markers present when the guard is armed", () => {
    const page = new StubPage();
    page.documentElement.setAttribute("bis_skin_checked", "1");
    const card = page.documentElement.append();
    card.setAttribute("bis_skin_checked", "1");
    card.setAttribute("class", "auth-card");

    page.install();

    assert.deepEqual(page.documentElement.getAttributeNames(), []);
    assert.deepEqual(card.getAttributeNames(), ["class"]);
  });

  it("blocks new writes and keeps watching for the paths the block does not cover", () => {
    const page = new StubPage();
    page.install();
    const card = page.documentElement.append();

    card.setAttribute("bis_skin_checked", "1");
    assert.deepEqual(card.getAttributeNames(), []);

    // An attribute written around the patched setter is still swept by the observer.
    stubWrite(card, "data-lt-installed", "true");
    page.observer.mutate({ type: "attributes", target: card, attributeName: "data-lt-installed" });
    assert.deepEqual(card.getAttributeNames(), []);
  });

  it("sweeps a subtree the app inserts later, at every depth", () => {
    const page = new StubPage();
    page.install();
    const section = page.documentElement.append();
    const deep = section.append();
    stubWrite(deep, "bis_skin_checked", "1");

    page.observer.mutate({ type: "childList", addedNodes: [section] });

    assert.deepEqual(deep.getAttributeNames(), []);
  });

  it("re-sweeps once the document has parsed, catching late writes", () => {
    const page = new StubPage();
    page.install();
    const late = page.documentElement.append();
    stubWrite(late, "__processed_7f2c__", "true");

    page.fireDomContentLoaded();

    assert.deepEqual(late.getAttributeNames(), []);
  });

  it("observes the whole document subtree for attributes and inserted nodes", () => {
    const page = new StubPage();
    page.install();

    assert.equal(page.observationCount, 1);
    assert.equal(page.observerTarget, page.documentElement);
    assert.equal(page.observerOptions?.subtree, true);
    assert.equal(page.observerOptions?.childList, true);
    assert.equal(page.observerOptions?.attributes, true);
  });

  it("installs once: a second install is a no-op and adds no observer", () => {
    const page = new StubPage();
    page.install();
    page.install();

    assert.equal(page.observationCount, 1);
  });

  it("tears down by disconnecting and unsubscribing", () => {
    const page = new StubPage();
    const teardown = page.install();
    teardown();

    assert.equal(page.observerDisconnected, true);
    assert.equal(page.domContentLoadedListeners.length, 0);
  });

  it("is safe without MutationObserver or a documentElement, as during server rendering", () => {
    const page = new StubPage({ withMutationObserver: false });
    page.documentElement.setAttribute("bis_skin_checked", "1");
    page.install();

    assert.deepEqual(page.documentElement.getAttributeNames(), []);
  });
});

describe("guard wiring — the placement that survives hydration is the one wired in", () => {
  const instrumentation = readFileSync("src/instrumentation-client.ts", "utf8");
  const layout = readFileSync("src/app/layout.tsx", "utf8");

  it("arms the guard from the client entry that runs before hydration", () => {
    assert.match(instrumentation, /installHydrationGuard/);
    assert.match(instrumentation, /elementPrototype: Element\.prototype/);
  });

  it("renders no inline script and no next/script in the layout", () => {
    assert.doesNotMatch(layout, /<script/);
    assert.doesNotMatch(layout, /from "next\/script"/);
    assert.doesNotMatch(layout, /beforeInteractive/);
  });

  it("suppresses the root-level markers it cannot sweep", () => {
    assert.match(layout, /<html[^>]*suppressHydrationWarning/);
    assert.match(layout, /<body[^>]*suppressHydrationWarning/);
  });
});

function stubWrite(element: StubElement, name: string, value: string): void {
  const unguarded = stubPrototype();
  unguarded.setAttribute.call(element, name, value);
}

type StubPrototype = GuardElementPrototype & {
  setAttribute(this: unknown, name: string, value: string): void;
  setAttributeNS(this: unknown, namespace: string | null, name: string, value: string): void;
  setAttributeNode(this: unknown, node: { name?: string | null }): unknown;
};

function stubPrototype(): StubPrototype {
  return {
    setAttribute(this: unknown, name: string, value: string): void {
      const element = this as StubElement;
      element.writeAttribute(name, value);
    },
    setAttributeNS(this: unknown, _namespace: string | null, name: string, value: string): void {
      const element = this as StubElement;
      element.writeAttribute(name, value);
    },
    setAttributeNode(this: unknown, node: { name?: string | null }): unknown {
      const element = this as StubElement;
      if (typeof node.name === "string") element.writeAttribute(node.name, "");
      return node;
    },
  };
}

class StubElement {
  readonly nodeType = 1;
  private readonly attributes = new Map<string, string>();
  private readonly children: StubElement[] = [];
  private readonly prototype: StubPrototype;

  constructor(prototype: StubPrototype = stubPrototype()) {
    this.prototype = prototype;
    // Route the instance calls through the prototype, the way the DOM does.
    this.setAttribute = prototype.setAttribute.bind(this);
    if (prototype.setAttributeNS) this.setAttributeNS = prototype.setAttributeNS.bind(this);
    if (prototype.setAttributeNode) this.setAttributeNode = prototype.setAttributeNode.bind(this);
  }

  setAttribute: (name: string, value: string) => void;
  setAttributeNS?: (namespace: string | null, name: string, value: string) => void;
  setAttributeNode?: (node: { name?: string | null }) => unknown;

  /** The unpatched write path, used to simulate an extension that bypasses the setter. */
  writeAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | undefined {
    return this.attributes.get(name);
  }

  getAttributeNames(): string[] {
    return [...this.attributes.keys()];
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  append(): StubElement {
    const child = new StubElement(this.prototype);
    this.children.push(child);
    return child;
  }

  querySelectorAll(): StubElement[] {
    return this.children.flatMap((child) => [child, ...child.querySelectorAll()]);
  }
}

class StubObserver {
  private readonly callback: (records: GuardMutationRecord[]) => void;
  readonly observations: { target: unknown; options: Record<string, boolean> }[] = [];
  disconnected = false;

  constructor(callback: (records: GuardMutationRecord[]) => void) {
    this.callback = callback;
  }

  observe(target: unknown, options: Record<string, boolean>): void {
    this.observations.push({ target, options });
  }

  disconnect(): void {
    this.disconnected = true;
  }

  mutate(record: GuardMutationRecord): void {
    this.callback([record]);
  }
}

class StubPage {
  private readonly prototype = stubPrototype();
  readonly documentElement = new StubElement(this.prototype);
  readonly domContentLoadedListeners: (() => void)[] = [];
  observationCount = 0;
  private readonly observers: StubObserver[] = [];
  private readonly withMutationObserver: boolean;
  private readonly document: {
    documentElement: StubElement;
    addEventListener?: (type: string, listener: () => void) => void;
    removeEventListener?: (type: string, listener: () => void) => void;
  };

  constructor(options: { withMutationObserver?: boolean } = {}) {
    this.withMutationObserver = options.withMutationObserver ?? true;
    const page = this;
    this.document = {
      documentElement: this.documentElement,
      addEventListener: (type: string, listener: () => void) => {
        if (type === "DOMContentLoaded") page.domContentLoadedListeners.push(listener);
      },
      removeEventListener: (type: string, listener: () => void) => {
        if (type !== "DOMContentLoaded") return;
        const index = page.domContentLoadedListeners.indexOf(listener);
        if (index >= 0) page.domContentLoadedListeners.splice(index, 1);
      },
    };
  }

  get observer(): StubObserver {
    const first = this.observers[0];
    assert.ok(first !== undefined, "guard never installed a MutationObserver");
    return first;
  }

  get observerTarget(): unknown {
    return this.observer.observations[0]?.target;
  }

  get observerOptions(): Record<string, boolean> | undefined {
    return this.observer.observations[0]?.options;
  }

  get observerDisconnected(): boolean {
    return this.observers.length > 0 && this.observers.every((observer) => observer.disconnected);
  }

  fireDomContentLoaded(): void {
    for (const listener of this.domContentLoadedListeners) listener();
  }

  install(): () => void {
    const page = this;
    return installHydrationGuard({
      document: this.document,
      createObserver: this.withMutationObserver
        ? (callback) => {
            const observer = new StubObserver(callback);
            page.observers.push(observer);
            page.observationCount += 1;
            return observer;
          }
        : undefined,
      elementPrototype: this.prototype,
    });
  }
}
