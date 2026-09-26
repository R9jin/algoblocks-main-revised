// frontend/src/components/tracePlayer/ComplexityLedger.jsx
//
// Replaces the old "Complexity" tab. This is NOT a separate view you
// switch to -- it sits beside the trace stage at all times and builds
// itself top-to-bottom as the person clicks Next, one row per source
// line: [ line | ops so far on that line | Big-O for that line ]. A
// summary row at the bottom carries the algorithm's overall (global,
// worst-case) Big-O, which is a different thing from each line's own
// (local) class -- e.g. a single comparison line is O(1) on its own,
// even inside an O(n) loop.
//
// Works two ways:
//   - When the trace supplies `codeLines`, every row is a fixed source
//     line (skeleton shown from the start, greyed out until reached).
//   - When it doesn't (older array/matrix/callstack traces that have
//     `complexity` but no pseudocode yet), it falls back to one row per
//     step so nothing regresses -- it just won't show real code text.
//
// STRUCTURAL BACKFILL (this is the actual bug fix)
// --------------------------------------------------
// Authored steps only ever attach a `line`/`activeLine` to the ONE line
// that's "doing the work" on that step (a comparison, an assignment...).
// Lines that control a block -- `function foo(...):`, `for ... :`,
// `while ... :` -- run just as many times as their body does, but nobody
// writes a dedicated step for "the loop header re-checked its condition"
// or "the function was entered". Left alone, those rows sit at "--"
// forever, even after the very last step -- which is exactly the bug:
// the table never looks "finished" because a couple of rows can never be
// reached no matter how far you step, even though they plainly did run.
//
// We recover this from the code's own indentation instead of asking every
// lesson author to hand-annotate every header line: a line's nearest
// enclosing block header is the closest preceding line with a smaller
// indent. Once any line inside a block has run, its header must have run
// too -- a function header runs once per call, a loop header runs once
// per pass through the body (approximated as "as many times as the
// most-hit line directly inside it ran"). A block whose body never ran
// this trace (a branch that wasn't taken) correctly stays at "--",
// because it has no reached children to infer anything from.
//
// SPACE COLUMN
// ------------
// Space is NOT "how many times did this line run" -- a line that runs a
// thousand times but only ever touches the same scalar (`mid = ...`) costs
// O(1) auxiliary space, while a line that runs once but allocates an
// n-length array costs O(n). So the space column reads its own fields --
// `complexity.spaceOps` (how much *new, persistent* space this exact
// execution added -- 0 for a reused variable, +1 for one append, etc.) and
// `complexity.localSpaceBigO` -- instead of reusing the time fields, and
// unlike time, an unauthored line defaults to 0 growth rather than "1 op":
// silently assuming every touched line grows memory would overclaim space
// nobody claimed. That default is correct for the overwhelming majority of
// lines (comparisons, index math, reused temporaries), which is exactly
// why it's safe as a default and not a guess.
//
// Backfilled header/straight-line rows (both passes below) get the same
// zero-growth default for space, with one deliberate gap: a `def` header
// for a RECURSIVE function also costs a stack frame per still-open call,
// and that depends on which calls have returned by a given step -- data
// this component doesn't have. Recursive traces that want an honest
// per-line stack cost need to author `spaceOps` on the def line's steps
// directly; this component won't guess a call-stack depth from indentation
// alone. The overall summary's space row is entirely author-supplied
// (`latest.spaceBigO` / `latest.spaceFormula`) for the same reason the
// time summary already is -- it's the one number that has to account for
// the whole trace at once, not just one line.
export default function ComplexityLedger({ codeLines = [], steps = [], index = 0 }) {
  const hasCode = codeLines.length > 0;

  const rows = hasCode
    ? codeLines.map((text, i) => ({ key: i, label: String(i + 1), text }))
    : steps
        .map((s, i) =>
          s?.complexity
            ? { key: i, label: String(i + 1), text: s.complexity.label || s.caption || `Step ${i + 1}` }
            : null
        )
        .filter(Boolean);

  // Which code line(s) a step belongs to can live in two places depending
  // on how the lesson data was authored: `step.complexity.line` (traces
  // enriched specifically for the ledger) or plain `step.activeLine`
  // (traces that already drove the old code-highlight feature). Fall back
  // through both so neither shape is silently ignored.
  //
  // `line` is usually a single number (one line "did the work" this step),
  // but some steps genuinely execute more than one source line at once from
  // the trace's point of view -- e.g. a "check middle, then narrow the
  // range" array-pointer step covers both the comparison AND the bound
  // reassignment. Authors can set `line: [4, 7]` for those; everything else
  // keeps working with a plain number.
  const linesOf = (step) => {
    const raw = step?.complexity?.line ?? step?.activeLine;
    if (raw === null || raw === undefined) return [];
    return Array.isArray(raw) ? raw : [raw];
  };

  // Walk every step up to the current one, accumulating an operation
  // count per row key (a code line, or a step index in the fallback).
  const statsByKey = {};
  let latest = null;
  for (let i = 0; i <= index && i < steps.length; i++) {
    const step = steps[i];
    const c = step?.complexity;
    if (!c) continue;
    const keys = hasCode ? linesOf(step) : [i];
    for (const key of keys) {
      if (key === null || key === undefined) continue;
      const prev = statsByKey[key] || { ops: 0, spaceOps: 0 };
      // Default a touched line to O(1): most single statements cost
      // constant time on their own -- the O(n)-and-up classes come from
      // how many times a line gets revisited, which the Ops column
      // already shows. Authors can override with an explicit
      // `localBigO` (e.g. a line that itself contains a nested loop).
      //
      // Space is accumulated the same way (so a line that appends once
      // per visit correctly shows its running total) but defaults each
      // visit's contribution to 0, not 1 -- see the SPACE COLUMN note
      // above for why an unauthored line means "no new persistent space",
      // not "assume growth".
      statsByKey[key] = {
        ops: prev.ops + (c.lineOps ?? 1),
        localBigO: c.localBigO ?? prev.localBigO ?? "O(1)",
        spaceOps: prev.spaceOps + (c.spaceOps ?? 0),
        localSpaceBigO: c.localSpaceBigO ?? prev.localSpaceBigO ?? "O(1)",
      };
    }
    latest = c;
  }

  // Nearest enclosing block header per line, via a simple indent stack: pop
  // anything at the same depth or deeper, whatever's left on top is the
  // parent. Shared by both backfill passes below.
  const parentOf = new Array(rows.length).fill(null);

  // ---- Structural backfill: give control-flow header lines a real value
  // once we can prove they ran, instead of leaving them dashed forever. ----
  if (hasCode && rows.length) {
    const indentOf = (text) => (text.match(/^[ \t]*/)?.[0].length) ?? 0;
    const indents = rows.map((r) => indentOf(r.text));

    const stack = [];
    for (let i = 0; i < rows.length; i++) {
      while (stack.length && stack[stack.length - 1].indent >= indents[i]) stack.pop();
      parentOf[i] = stack.length ? stack[stack.length - 1].index : null;
      stack.push({ index: i, indent: indents[i] });
    }

    // A loop's own repetition count does not default to a single class --
    // "for"/"while" covers everything from a single O(n) linear scan to an
    // O(log n) narrowing search to a fixed-width O(1) inner loop, and
    // guessing "O(n)" for all of them is wrong exactly when it's not a
    // linear scan (e.g. binary search's `while lo <= hi`, which halves the
    // remaining range every pass -- verified empirically: running the real
    // code via a line-count trace at n = 16/64/256/1024/4096 shows the loop
    // body executing ~log2(n) times, not ~n times).
    //
    // We can't re-run the code from here, but we CAN recognize the idiom
    // that makes a loop logarithmic instead of linear: somewhere in its
    // body, two bounds are narrowed toward a midpoint every pass --
    // `mid = (lo + hi) // 2` (or low/high, left/right, start/end) paired
    // with a reassignment of one bound to that midpoint. Any loop matching
    // that shape halves its own remaining work every iteration by
    // construction, regardless of variable names, so this generalizes
    // beyond binary search specifically (e.g. exponent-by-squaring, a
    // narrowing bisection search) without touching ordinary `for i in
    // range(n)` / `while` scans, which keep the O(n) default.
    const descendantsOf = (root) => {
      const out = [];
      const walk = (idx) => {
        for (let j = 0; j < rows.length; j++) {
          if (parentOf[j] === idx) { out.push(j); walk(j); }
        }
      };
      walk(root);
      return out;
    };
    const isNarrowingSearchLoop = (headerIdx) => {
      const body = descendantsOf(headerIdx).map((j) => rows[j].text).join("\n");
      const hasMidpoint = /\bmid\s*=\s*\(?\s*\w+\s*\+\s*\w+\s*\)?\s*(\/\/|\/)\s*2\b/i.test(body);
      const narrowsBothWays =
        /\b(lo|low|left|start)\w*\s*=\s*mid\b/i.test(body) &&
        /\b(hi|high|right|end)\w*\s*=\s*mid\b/i.test(body);
      return hasMidpoint && narrowsBothWays;
    };
    // A "for x in [literal, list, here]:" (or a tuple literal) iterates a
    // fixed number of items written directly into the source -- e.g. the
    // 4 compass directions in a grid search -- not something that grows
    // with input size, so it's O(1) per call, not O(n).
    const isFixedIterationLoop = (text) => /^[ \t]*for\b.+\bin\s*[\[\(]/i.test(text);

    // Bottom-up so a header's own inferred value is ready by the time its
    // own parent (an outer loop, say) looks for children.
    for (let i = rows.length - 1; i >= 0; i--) {
      if (statsByKey[i]) continue; // already has a real, authored value

      const childOps = [];
      let childLocalBigO = null;
      for (let j = 0; j < rows.length; j++) {
        if (parentOf[j] === i && statsByKey[j]) {
          childOps.push(statsByKey[j].ops);
          childLocalBigO = childLocalBigO ?? statsByKey[j].localBigO;
        }
      }
      // No reached children -- this block genuinely never ran this trace
      // (a branch not taken). Leave it at "--"; that's the correct answer.
      if (!childOps.length) continue;

      const text = rows[i].text;
      const isDef = /^[ \t]*(def|function)\b/i.test(text);
      const isLoop = /^[ \t]*(for|while)\b/i.test(text);

      // Space deliberately does NOT follow "max of children" the way time
      // does -- a loop or function header doesn't itself hold the memory
      // its body allocates (that's attributed to the actual allocating
      // line), so a backfilled header always gets 0/O(1) space. The one
      // real exception -- stack frames for a RECURSIVE def -- needs
      // authored per-step data (see the SPACE COLUMN note up top), so it's
      // intentionally not modeled here rather than guessed.
      statsByKey[i] = isDef
        ? { ops: 1, localBigO: "O(1)", spaceOps: 0, localSpaceBigO: "O(1)", inferred: true } // entered once per call
        : {
            ops: Math.max(...childOps),
            localBigO: isLoop
              ? (isNarrowingSearchLoop(i) ? "O(log n)" : isFixedIterationLoop(text) ? "O(1)" : "O(n)")
              : childLocalBigO || "O(1)",
            spaceOps: 0,
            localSpaceBigO: "O(1)",
            inferred: true,
          };
    }
  }

  // ---- Pass 2: straight-line statement inheritance ----
  // A plain statement isn't a block header and has no children of its own,
  // so pass 1 never touches it -- but if it sits directly inside a loop or
  // function body, *before* any nested if/elif/else/for/while at that same
  // level, it is guaranteed to run every single time its parent does: there
  // is no branch yet that could have skipped it. `mid = (lo + hi) // 2`
  // before the `if` that checks it is exactly this case, and so is an init
  // line like `lo, hi = 0, len(arr) - 1` that sits before the main loop.
  //
  // Anything AFTER the first nested control structure in that block is
  // deliberately left alone here, even if it looks similarly "plain" --
  // once a for/while/if has run, we no longer know whether it returned,
  // broke, or fell through, so a trailing sibling's reachability is no
  // longer implied by the parent alone. That needs a real per-step line
  // (or an explicit branch marker), which only the lesson content can
  // provide -- this pass never guesses across a branch point.
  if (hasCode && rows.length) {
    const isHeader = (text) => /^[ \t]*(def|function|for|while|if|elif|else|try|except|finally)\b/i.test(text);
    const isUnconditionalHeader = (text) => /^[ \t]*(def|function|for|while)\b/i.test(text);

    const childrenByParent = {};
    for (let i = 0; i < rows.length; i++) {
      const p = parentOf[i];
      if (p === null) continue;
      (childrenByParent[p] = childrenByParent[p] || []).push(i);
    }

    for (const parentKey in childrenByParent) {
      const p = Number(parentKey);
      const parentStat = statsByKey[p];
      if (!parentStat || !isUnconditionalHeader(rows[p].text)) continue;

      let pastFirstBranch = false;
      for (const i of childrenByParent[p]) {
        if (isHeader(rows[i].text)) {
          pastFirstBranch = true; // a nested loop/conditional starts here
          continue; // headers are pass 1's job, not this pass's
        }
        if (pastFirstBranch || statsByKey[i]) continue;
        // Time inherits the parent's op count (it runs exactly as often as
        // the parent does). Space is NOT inherited the same way -- running
        // unconditionally alongside a busy parent doesn't imply the line
        // itself allocates anything -- so it gets the same conservative
        // 0/O(1) default as everywhere else backfill touches space.
        statsByKey[i] = { ops: parentStat.ops, localBigO: "O(1)", spaceOps: 0, localSpaceBigO: "O(1)", inferred: true };
      }
    }
  }

  // Reconciliation check: the whole point of this table is that the reached
  // rows should "add up" to the overall badge -- at least one row (usually
  // the driving loop or recursive call) ought to carry the same class as
  // `latest.bigO`. When nothing does, that's not necessarily a bug in THIS
  // trace's data, but it does mean a person reading the table has no way to
  // see how the two numbers relate, so we say so plainly instead of
  // pretending they reconcile.
  // Authored badges carry a lot of surface variation that has nothing to do
  // with growth class: unicode superscripts ("2ⁿ" vs "2^n"), a "×" instead
  // of "*", a capital N for a problem-specific size (N-Queens), and free
  // text tacked on for context ("O(n) after sorting", "O(2ⁿ) pruned",
  // "O(log n) depth", or prose like "Exponential (pruned)"). An exact-string
  // lookup treats every one of those as "unrecognized", which silently
  // forces `reconciles = true` (see below) and hides the clarifying note on
  // almost every decorated badge in the curriculum -- not just the ones
  // that genuinely don't reconcile. `canon` strips that decoration down to
  // a comparable core before ranking.
  const canon = (s) =>
    s
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/×/g, "*")
      .replace(/ⁿ/g, "^n")
      .replace(/²/g, "^2")
      .replace(/³/g, "^3")
      .replace(/⁴/g, "^4");
  const BIGO_RANK = Object.fromEntries(
    Object.entries({
      "O(1)": 0, "O(log n)": 1, "O(log min(a, b))": 1, "O(sqrt n)": 1.5,
      "O(n)": 2, "O(n log n)": 3,
      "O(n^2)": 4, "O(n*m)": 4, "O(n^3)": 5, "O(n^4)": 6,
      "O(2^n)": 7, "O(3^n)": 7.5, "O(n!)": 8,
    }).map(([k, v]) => [canon(k), v])
  );
  const rankOf = (label) => {
    if (!label) return null;
    if (/exponential/i.test(label)) return BIGO_RANK[canon("O(2^n)")];
    // Some badges compare two classes in one string, e.g. "O(n) this pass
    // (O(n²) overall)" or "O(1) vs O(n)" -- the leading O(...) is always the
    // one this trace is actually making a claim about; anything after it is
    // supplementary context, not a second thing to reconcile against.
    const match = label.match(/O\([^)]*\)/i);
    const core = match ? match[0] : label;
    return BIGO_RANK[canon(core)] ?? null;
  };
  const reachedLocalClasses = Object.values(statsByKey)
    .map((s) => s.localBigO)
    .filter(Boolean);
  const maxReachedRank = reachedLocalClasses.reduce((max, label) => {
    const r = rankOf(label);
    return r !== null && (max === null || r > max) ? r : max;
  }, null);
  const overallRank = rankOf(latest?.bigO);
  const reconciles =
    maxReachedRank === null || overallRank === null || maxReachedRank === overallRank;

  if (!rows.length || !latest) {
    return (
      <div className="complexity-ledger complexity-ledger-empty">
        Step through the trace to build the complexity table.
      </div>
    );
  }

  const activeKeys = hasCode ? linesOf(steps[index]) : [index];

  return (
    <div className="complexity-ledger">
      <div className="complexity-ledger-title">Complexity, line by line</div>

      <div className="complexity-ledger-header" role="row">
        <span>Line</span>
        <span>Time</span>
        <span>Space</span>
      </div>

      <div className="complexity-ledger-body" role="table">
        {rows.map((row) => {
          const stat = statsByKey[row.key];
          const reached = !!stat;
          const isActive = reached && activeKeys.includes(row.key);
          return (
            <div
              key={row.key}
              role="row"
              className={`complexity-ledger-row${reached ? " reached" : " pending"}${isActive ? " active" : ""}${
                stat?.inferred ? " inferred" : ""
              }`}
            >
              <span className="complexity-ledger-line">
                <span className="complexity-ledger-line-no">{row.label}</span>
                <code>{row.text}</code>
              </span>
              <span
                className="complexity-ledger-metric"
                title={stat?.inferred ? "Inferred: this line runs whenever the lines nested under it do" : undefined}
              >
                {reached ? (
                  <>
                    <span className="complexity-ledger-metric-ops">
                      {stat.inferred && <span className="complexity-ledger-inferred-mark">~</span>}
                      {stat.ops}
                    </span>
                    {stat.localBigO && <span className="complexity-ledger-badge local">{stat.localBigO}</span>}
                  </>
                ) : (
                  "\u2013"
                )}
              </span>
              <span
                className="complexity-ledger-metric complexity-ledger-metric-space"
                title={
                  reached && !stat.spaceOps
                    ? "No new persistent space recorded for this line (reused/constant)"
                    : undefined
                }
              >
                {reached ? (
                  <>
                    <span className="complexity-ledger-metric-ops">{stat.spaceOps}</span>
                    {stat.localSpaceBigO && (
                      <span className="complexity-ledger-badge space">{stat.localSpaceBigO}</span>
                    )}
                  </>
                ) : (
                  "\u2013"
                )}
              </span>
            </div>
          );
        })}
      </div>

      <div className="complexity-ledger-summary">
        <span className="complexity-ledger-summary-label">Time {"\u2014"} {latest.caseLabel || "Overall (worst case)"}</span>
        <span className="complexity-ledger-badge global">{latest.bigO || "\u2014"}</span>
        {latest.formula && <span className="complexity-ledger-summary-formula">{latest.formula}</span>}
      </div>
      {latest.note && <div className="complexity-ledger-note">{latest.note}</div>}
      {!reconciles && (
        <div className="complexity-ledger-note complexity-ledger-note-mismatch">
          Note: no single line above reaches {latest.bigO} on its own -- the overall class comes
          from how these lines combine (or repeat) across the full trace, not from any one row.
        </div>
      )}

      <div className="complexity-ledger-summary complexity-ledger-summary-space">
        <span className="complexity-ledger-summary-label">Space {"\u2014"} Overall (auxiliary)</span>
        {latest.spaceBigO ? (
          <>
            <span className="complexity-ledger-badge global space">{latest.spaceBigO}</span>
            {latest.spaceFormula && <span className="complexity-ledger-summary-formula">{latest.spaceFormula}</span>}
          </>
        ) : (
          <span className="complexity-ledger-summary-missing">not authored for this trace yet</span>
        )}
      </div>
      {latest.spaceNote && <div className="complexity-ledger-note">{latest.spaceNote}</div>}
    </div>
  );
}
