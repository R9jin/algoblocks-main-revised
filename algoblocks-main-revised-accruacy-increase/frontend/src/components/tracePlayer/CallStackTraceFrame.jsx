// frontend/src/components/tracePlayer/CallStackTraceFrame.jsx
//
// Renders one step of a recursive/memoized call trace as two live panels:
// the active call stack, and the memo cache as it fills up. `hit`/`store`
// flag which cache entry (if any) this step read from or wrote to, so that
// entry can pulse instead of the learner having to re-read a sentence.
export default function CallStackTraceFrame({ stack = [], cache = {}, hit, store }) {
  const cacheEntries = Object.entries(cache).sort((a, b) => Number(a[0]) - Number(b[0]));

  return (
    <div className="callstack-trace-frame">
      <div className="callstack-trace-panel">
        <div className="callstack-trace-heading">Call Stack</div>
        <div className="callstack-trace-stack">
          {stack.length === 0 && (
            <div className="callstack-trace-empty">Empty — every call has resolved</div>
          )}
          {[...stack].reverse().map((call, i) => (
            <div
              key={`${call}-${stack.length - i}`}
              className={`callstack-trace-card${i === 0 ? " top" : ""}`}
            >
              {call}
            </div>
          ))}
        </div>
      </div>

      <div className="callstack-trace-panel">
        <div className="callstack-trace-heading">Memo Cache</div>
        <div className="callstack-trace-cache">
          {cacheEntries.length === 0 && <div className="callstack-trace-empty">Empty</div>}
          {cacheEntries.map(([key, value]) => {
            const isHit = hit && String(hit.key) === key;
            const isStore = store && String(store.key) === key;
            return (
              <div
                key={key}
                className={`callstack-trace-cache-entry${isHit ? " hit" : ""}${isStore ? " store" : ""}`}
              >
                <span className="callstack-trace-cache-key">fib({key})</span>
                <span className="callstack-trace-cache-value">{value}</span>
              </div>
            );
          })}
        </div>

        {hit && (
          <div className="callstack-trace-note hit-note">
            Cache hit — reused fib({hit.key}) = {hit.value}, no recomputation.
          </div>
        )}
        {store && !hit && (
          <div className="callstack-trace-note store-note">
            Stored fib({store.key}) = {store.value}.
          </div>
        )}
        {store && hit && (
          <div className="callstack-trace-note store-note">
            fib({store.key}) computed and stored = {store.value}.
          </div>
        )}
      </div>
    </div>
  );
}
