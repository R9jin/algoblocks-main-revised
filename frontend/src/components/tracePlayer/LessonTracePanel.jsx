// frontend/src/components/tracePlayer/LessonTracePanel.jsx
//
// Entry point used by LessonViewer for the `trace`/`traces` field on a
// lesson section or subsection. Lesson JSON stays declarative -- authors
// describe *what* happens at each step (an array state, a call stack, a
// recursion tree) and this picks the matching interactive visualization
// instead of the section falling back to a wall of numbered sentences.
//
// `trace.codeLines`, when present, is forwarded to StepTracePlayer so the
// pseudocode pane + complexity ledger appear next to the visualization for
// *any* trace kind, not just "code" ones.
import ArrayTraceFrame from "./ArrayTraceFrame";
import CallStackTraceFrame from "./CallStackTraceFrame";
import RecursionTreeTraceFrame from "./RecursionTreeTraceFrame";
import MatrixTraceFrame from "./MatrixTraceFrame";
import CodeTraceFrame from "./CodeTraceFrame";
import StepTracePlayer from "./StepTracePlayer";
import "./StepTracePlayer.css";

function PanelChrome({ trace, children }) {
  return (
    <figure className="lesson-chart-panel trace-panel">
      {(trace.title || trace.description) && (
        <figcaption>
          {trace.title && <strong>{trace.title}</strong>}
          {trace.description && <span>{trace.description}</span>}
        </figcaption>
      )}
      {children}
    </figure>
  );
}

export default function LessonTracePanel({ trace }) {
  if (!trace?.kind) return null;

  if (trace.kind === "code" && trace.steps?.length) {
    return (
      <PanelChrome trace={trace}>
        <StepTracePlayer
          steps={trace.steps}
          codeLines={trace.codeLines}
          caption={(step) => step.caption}
          renderFrame={(step) =>
            Object.keys(step.variables || {}).length ? (
              <CodeTraceFrame variables={step.variables} />
            ) : null
          }
        />
      </PanelChrome>
    );
  }

  if (trace.kind === "matrix" && trace.steps?.length) {
    return (
      <PanelChrome trace={trace}>
        <StepTracePlayer
          steps={trace.steps}
          codeLines={trace.codeLines}
          caption={(step) => step.caption}
          renderFrame={(step) => (
            <MatrixTraceFrame matrix={step.matrix} roles={step.roles} pointers={step.pointers} />
          )}
        />
      </PanelChrome>
    );
  }

  if (trace.kind === "array" && trace.steps?.length) {
    return (
      <PanelChrome trace={trace}>
        <StepTracePlayer
          steps={trace.steps}
          codeLines={trace.codeLines}
          caption={(step) => step.caption}
          renderFrame={(step) => (
            <ArrayTraceFrame array={step.array} roles={step.roles} pointers={step.pointers} />
          )}
        />
      </PanelChrome>
    );
  }

  if (trace.kind === "callstack" && trace.steps?.length) {
    return (
      <PanelChrome trace={trace}>
        <StepTracePlayer
          steps={trace.steps}
          codeLines={trace.codeLines}
          caption={(step) => step.caption}
          renderFrame={(step) => (
            <CallStackTraceFrame
              stack={step.stack}
              cache={step.cache}
              hit={step.hit}
              store={step.store}
            />
          )}
        />
      </PanelChrome>
    );
  }

  if (trace.kind === "recursionTree" && trace.nodes?.length && trace.stepCaptions?.length) {
    const steps = trace.stepCaptions.map((c, i) => ({
      caption: c,
      complexity: trace.stepComplexity?.[i],
      activeLine: trace.stepComplexity?.[i]?.line,
    }));
    return (
      <PanelChrome trace={trace}>
        <StepTracePlayer
          steps={steps}
          codeLines={trace.codeLines}
          caption={(step) => step.caption}
          renderFrame={(step, index) => (
            <RecursionTreeTraceFrame nodes={trace.nodes} currentStep={index + 1} />
          )}
        />
      </PanelChrome>
    );
  }

  return null;
}
