const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const { parse } = require('@babel/parser');

function readModule(name) {
  const source = readFileSync(path.join(__dirname, '../src', name), 'utf8');
  return { source, program: parse(source, { sourceType: 'module', plugins: ['jsx'] }).program };
}
function componentBody(module, name) {
  if (!name) return module.program.body.find((n) => n.type === 'ExportDefaultDeclaration').declaration.body.body;
  return module.program.body.flatMap((n) => n.declarations || []).find((n) => n.id.name === name).init.body.body;
}
function hookCall(module, body, hookName) {
  return body.filter((n) => n.type === 'ExpressionStatement')
    .map((n) => n.expression).find((n) => n.callee?.name === hookName);
}
const shared = readModule('hooks/useAutomaticCodeAnalysis.js');
const hook = shared.program.body.find((n) => n.type === 'ExportDefaultDeclaration').declaration;
const hookSource = shared.source.slice(hook.start, hook.end);
const main = readModule('pages/MainApp.jsx');
const activity = readModule('pages/ActivityApp.jsx');
const mainOptions = hookCall(main, componentBody(main), 'useAutomaticCodeAnalysis').arguments[0];
const activityOptions = hookCall(activity, componentBody(activity, 'ActivityAppInner'), 'useAutomaticCodeAnalysis').arguments[0];

function clock() {
  let now = 0;
  let nextId = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout: (callback, delay) => {
      const id = ++nextId;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    tick: (ms) => {
      const end = now + ms;
      while (true) {
        const due = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!due || due[1].at > end) break;
        now = due[1].at;
        timers.delete(due[0]);
        due[1].callback();
      }
      now = end;
    },
  };
}

// Run the actual shared hook and each page's actual options with React-style
// dependency tracking and a virtual clock, without loading Monaco or Pyodide.
function workspace(kind) {
  const timer = clock();
  const requests = [];
  let index = 0;
  let pending = [];
  const slots = [];
  const state = {
    activeTab: { pythonCode: 'print(1)', isEditingCode: true },
    activeTabId: 'tab-a', generatedPython: 'print(1)', isEditingCode: true,
    isEngineReady: true, isOnline: true, pipelineMode: kind === 'pipeline',
    moduleId: 'module-a', activityId: 'activity-a', workspaceRevision: 1,
    isReadyRef: { current: true }, isUnmountingRef: { current: false },
    isResettingRef: { current: false }, analysisEpochRef: { current: 0 },
    sanitizePythonCode: (code) => code,
    worker: { postMessage: (request) => requests.push({ ...request, at: timer.now() }) },
    useRef: (initial) => {
      const i = index++;
      if (!slots[i]) slots[i] = { current: initial };
      return slots[i];
    },
    useEffect: (effect, deps) => {
      const i = index++;
      if (!slots[i] || deps.some((value, k) => !Object.is(value, slots[i].deps[k]))) {
        pending.push(() => {
          slots[i]?.cleanup?.();
          slots[i] = { deps, cleanup: effect() };
        });
      }
    },
    setTimeout: timer.setTimeout, clearTimeout: timer.clearTimeout,
  };
  state.analyzeCode = (tabId, code) => state.worker.postMessage({ type: 'ANALYZE_CODE', tabId, code });
  state.useAutomaticCodeAnalysis = vm.runInNewContext(`(${hookSource})`, state);
  const module = kind === 'activity' ? activity : main;
  const options = kind === 'activity' ? activityOptions : mainOptions;
  const renderHook = vm.runInNewContext(`() => useAutomaticCodeAnalysis(${module.source.slice(options.start, options.end)})`, state);
  function render(patch = {}) {
    const { code, ...rest } = patch;
    Object.assign(state, rest);
    if (code !== undefined) {
      state.generatedPython = code;
      state.activeTab = { ...state.activeTab, pythonCode: code };
    }
    index = 0;
    pending = [];
    renderHook();
    pending.forEach((effect) => effect());
  }
  return { state, requests, render, tick: timer.tick, unmount: () => slots.forEach((slot) => slot.cleanup?.()) };
}

for (const kind of ['main', 'activity', 'pipeline']) {
  test(`${kind}: block syncing at 500ms preserves the analysis due at 800ms`, () => {
    const app = workspace(kind);
    app.render();
    app.tick(500);
    app.render({ activeTab: { ...app.state.activeTab, isEditingCode: false }, isEditingCode: false });
    app.tick(300);
    assert.equal(app.requests.length, 1);
    assert.equal(app.requests[0].code, 'print(1)');
    assert.equal(app.requests[0].at, 800);
  });
  test(`${kind}: rapid typing analyzes only the latest code`, () => {
    const app = workspace(kind);
    app.render();
    app.tick(400);
    app.render({ code: 'print(2)' });
    app.tick(400);
    app.render({ code: 'print(3)' });
    app.tick(799);
    assert.equal(app.requests.length, 0);
    app.tick(1);
    assert.equal(app.requests.length, 1);
    assert.equal(app.requests[0].code, 'print(3)');
  });
  test(`${kind}: block-generated code is analyzed while offline`, () => {
    const app = workspace(kind);
    app.render({ code: 'for i in range(15):\n    print(i)', isOnline: false, isEditingCode: false });
    app.tick(800);
    assert.equal(app.requests.length, 1);
    app.render({ code: 'print(4)' });
    app.tick(800);
    assert.equal(app.requests[1].code, 'print(4)');
  });
  test(`${kind}: engine readiness triggers analysis of already-loaded code`, () => {
    const app = workspace(kind);
    app.render({ isEngineReady: false, code: 'print(5)' });
    app.tick(1000);
    assert.equal(app.requests.length, 0);
    app.render({ isEngineReady: true });
    app.tick(800);
    assert.equal(app.requests[0].code, 'print(5)');
  });
  test(`${kind}: worker replacement reschedules analysis`, () => {
    const app = workspace(kind);
    app.render();
    app.tick(400);
    const nextRequests = [];
    app.render({ worker: { postMessage: (request) => nextRequests.push(request) } });
    app.tick(800);
    assert.equal(app.requests.length, 0);
    assert.equal(nextRequests.length, 1);
  });
  test(`${kind}: leaving the workspace cancels analysis`, () => {
    const app = workspace(kind);
    app.render();
    app.unmount();
    app.tick(800);
    assert.equal(app.requests.length, 0);
  });
}

test('activity: finishing bootstrap analyzes unchanged source', () => {
  const app = workspace('activity');
  app.render({ workspaceRevision: 0, isReadyRef: { current: false } });
  app.tick(1000);
  assert.equal(app.requests.length, 0);
  app.render({ workspaceRevision: 1, isReadyRef: { current: true } });
  app.tick(800);
  assert.equal(app.requests.length, 1);
});
test('activity: restarting with identical template code schedules a fresh analysis', () => {
  const app = workspace('activity');
  app.render();
  app.tick(800);
  app.render({ workspaceRevision: 2 });
  app.tick(800);
  assert.equal(app.requests.length, 2);
  assert.ok(app.requests[1].requestEpoch > app.requests[0].requestEpoch);
});
test('main: tab switches cancel requests for the previous tab', () => {
  const app = workspace('main');
  app.render();
  app.tick(400);
  app.render({ activeTabId: 'tab-b', code: 'print(6)' });
  app.tick(800);
  assert.equal(app.requests.length, 1);
  assert.equal(app.requests[0].tabId, 'tab-b');
});
test('pipeline view renders MainApp with the shared analysis hook', () => {
  const pipeline = readModule('pages/AdminPipelineView.jsx');
  const component = pipeline.program.body.find((n) => n.type === 'ExportDefaultDeclaration').declaration;
  const render = component.body.body.find((n) => n.type === 'ReturnStatement').argument.openingElement;
  assert.equal(render.name.name, 'MainApp');
  assert.ok(render.attributes.some((n) => n.name.name === 'pipelineMode'));
});

const replay = readModule('components/PipelineReplay.jsx');
const replayEffect = componentBody(replay).filter((n) => n.type === 'ExpressionStatement')
  .map((n) => n.expression).find((n) => n.callee?.name === 'useEffect'
    && replay.source.slice(n.arguments[0].start, n.arguments[0].end).includes('TRACE_PIPELINE'));
test('pipeline replay refreshes after source edits and ignores superseded results', () => {
  const timer = clock();
  const requests = [];
  const listeners = new Set();
  const traces = [];
  const worker = {
    postMessage: (request) => requests.push(request),
    addEventListener: (_, handler) => listeners.add(handler),
    removeEventListener: (_, handler) => listeners.delete(handler),
  };
  const state = {
    worker, ready: true, hasCode: true, code: 'print(1)', epochRef: { current: 0 },
    setTrace: (data) => traces.push(data), setIdx: () => {}, setPlaying: () => {},
    setErrMsg: () => {}, setLoadState: () => {}, REQUEST_TIMEOUT_MS: 10000,
    setTimeout: timer.setTimeout, clearTimeout: timer.clearTimeout,
  };
  const effect = vm.runInNewContext(`(${replay.source.slice(replayEffect.arguments[0].start, replayEffect.arguments[0].end)})`, state);
  const cleanup = effect();
  timer.tick(350);
  cleanup();
  state.code = 'print(2)';
  const cleanupLatest = effect();
  timer.tick(350);
  assert.deepEqual(requests.map((r) => r.code), ['print(1)', 'print(2)']);
  for (const handler of listeners) {
    handler({ data: { type: 'TRACE_PIPELINE_RESULT', requestEpoch: requests[0].requestEpoch, data: { status: 'success', old: true } } });
    handler({ data: { type: 'TRACE_PIPELINE_RESULT', requestEpoch: requests[1].requestEpoch, data: { status: 'success', latest: true } } });
  }
  assert.deepEqual(traces, [{ status: 'success', latest: true }]);
  cleanupLatest();
});
