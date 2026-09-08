import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { initializePreviewWorkers } from "../src/components/Preview/initializeWorkers.ts";

class Worker extends EventTarget {
  messages = [];

  constructor(state) {
    super();
    this.state = state;
  }

  postMessage(message) {
    this.messages.push(message);
  }

  transition(state) {
    this.state = state;
    this.dispatchEvent(new Event("statechange"));
  }
}

class Registration extends EventTarget {
  active = null;
  installing = null;
  waiting = null;

  constructor(workers) {
    super();
    Object.assign(this, workers);
  }
}

const files = [{ filename: "/dist/index.html", text: "<h1>Preview</h1>" }];
const initMessage = { type: "init", files, scope: "/preview/" };

test("the first preview waits for activation before receiving its files", async (t) => {
  const worker = new Worker("installing");
  const registration = new Registration({ installing: worker });
  const controller = new AbortController();
  t.after(() => controller.abort());
  let ready = false;
  const startup = initializePreviewWorkers(registration, files, controller.signal).then(() => {
    ready = true;
  });

  worker.transition("installed");
  worker.transition("activating");
  await Promise.resolve();
  assert.equal(ready, false);
  assert.deepEqual(worker.messages, []);

  worker.transition("activated");
  await startup;
  assert.deepEqual(worker.messages, [initMessage]);
  assert.equal(getEventListeners(worker, "statechange").length, 0);
});

for (const slot of ["installing", "waiting"]) {
  test(`an active worker does not hide an existing ${slot} replacement`, async (t) => {
    const active = new Worker("activated");
    const replacement = new Worker(slot === "installing" ? "installing" : "installed");
    const registration = new Registration({ active, [slot]: replacement });
    const controller = new AbortController();
    t.after(() => controller.abort());

    await initializePreviewWorkers(registration, files, controller.signal);
    assert.deepEqual(active.messages, [initMessage]);
    assert.deepEqual(replacement.messages, []);

    replacement.transition("activated");
    assert.deepEqual(replacement.messages, [initMessage]);
  });
}

test("later updates are initialized once even when updatefound repeats", async (t) => {
  const active = new Worker("activated");
  const registration = new Registration({ active });
  const controller = new AbortController();
  t.after(() => controller.abort());
  await initializePreviewWorkers(registration, files, controller.signal);

  for (let update = 0; update < 2; update++) {
    const replacement = new Worker("installing");
    registration.installing = replacement;
    registration.dispatchEvent(new Event("updatefound"));
    registration.dispatchEvent(new Event("updatefound"));
    assert.equal(getEventListeners(replacement, "statechange").length, 1);

    replacement.transition("activated");
    registration.active = replacement;
    registration.installing = null;
    registration.dispatchEvent(new Event("updatefound"));
    assert.deepEqual(replacement.messages, [initMessage]);
  }
  assert.deepEqual(active.messages, [initMessage]);
});

test("closing a ready preview removes observers and prevents stale initialization", async () => {
  const active = new Worker("activated");
  const replacement = new Worker("installing");
  const registration = new Registration({ active, installing: replacement });
  const controller = new AbortController();
  await initializePreviewWorkers(registration, files, controller.signal);

  controller.abort();
  assert.equal(getEventListeners(registration, "updatefound").length, 0);
  assert.equal(getEventListeners(replacement, "statechange").length, 0);
  replacement.transition("activated");
  assert.deepEqual(replacement.messages, []);

  const later = new Worker("activated");
  registration.installing = later;
  registration.dispatchEvent(new Event("updatefound"));
  assert.deepEqual(later.messages, []);
});

test("closing during the first installation cancels readiness and removes listeners", async () => {
  const worker = new Worker("installing");
  const registration = new Registration({ installing: worker });
  const controller = new AbortController();
  const startup = initializePreviewWorkers(registration, files, controller.signal);

  controller.abort();
  await assert.rejects(startup, { name: "AbortError" });
  assert.equal(getEventListeners(worker, "statechange").length, 0);
  assert.equal(getEventListeners(registration, "updatefound").length, 0);
  worker.transition("activated");
  assert.deepEqual(worker.messages, []);
});

test("a failed first installation rejects readiness", async (t) => {
  const worker = new Worker("installing");
  const registration = new Registration({ installing: worker });
  const controller = new AbortController();
  t.after(() => controller.abort());
  const startup = initializePreviewWorkers(registration, files, controller.signal);

  worker.transition("redundant");
  await assert.rejects(startup, /could not be activated/);
  assert.equal(getEventListeners(worker, "statechange").length, 0);
  assert.deepEqual(worker.messages, []);
});

test("a failed replacement leaves the active preview initialized", async (t) => {
  const active = new Worker("activated");
  const replacement = new Worker("installing");
  const registration = new Registration({ active, installing: replacement });
  const controller = new AbortController();
  t.after(() => controller.abort());

  await initializePreviewWorkers(registration, files, controller.signal);
  replacement.transition("redundant");
  await setImmediate();
  assert.deepEqual(active.messages, [initMessage]);
  assert.deepEqual(replacement.messages, []);
  assert.equal(getEventListeners(replacement, "statechange").length, 0);
});
