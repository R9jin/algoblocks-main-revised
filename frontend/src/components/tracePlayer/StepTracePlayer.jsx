// frontend/src/components/tracePlayer/StepTracePlayer.jsx
//
// Shared "engine" behind every interactive lesson trace (array scans, call
// stacks, recursion trees, ...). It owns only the step index + play/pause
// state and the transport controls; the actual visualization for a given
// step is supplied by the caller via `renderFrame`, so this file has no
// idea what an array cell or a recursion node looks like.
//
// This replaces the old pattern of a lesson section rendering a numbered
// list ("1. Call fib(5)... 2. Call fib(4)...") as static text -- the same
// step data now drives a scrubbable, playable visualization instead.
import { useEffect, useRef, useState } from "react";
import { FiChevronLeft, FiChevronRight, FiPause, FiPlay, FiRotateCcw } from "react-icons/fi";
import "./StepTracePlayer.css";

export default function StepTracePlayer({
  steps,
  renderFrame,
  caption,
  intervalMs = 1400,
}) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef(null);
  const total = steps?.length || 0;

  useEffect(() => {
    if (!playing || total === 0) return undefined;
    timerRef.current = setInterval(() => {
      setIndex((prev) => {
        if (prev >= total - 1) {
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalMs);
    return () => clearInterval(timerRef.current);
  }, [playing, total, intervalMs]);

  if (total === 0) return null;

  const goTo = (next) => {
    setPlaying(false);
    setIndex(Math.max(0, Math.min(total - 1, next)));
  };

  const handlePlayToggle = () => {
    if (!playing && index >= total - 1) {
      setIndex(0);
    }
    setPlaying((p) => !p);
  };

  const step = steps[index];
  const captionText = typeof caption === "function" ? caption(step, index) : step?.caption;

  return (
    <div className="trace-player">
      <div className="trace-player-stage">{renderFrame(step, index, steps)}</div>

      {captionText && (
        <div className="trace-player-caption" aria-live="polite">
          {captionText}
        </div>
      )}

      <div className="trace-player-controls">
        <button type="button" onClick={() => goTo(0)} title="Restart" aria-label="Restart">
          <FiRotateCcw size={15} />
        </button>
        <button
          type="button"
          onClick={() => goTo(index - 1)}
          disabled={index === 0}
          title="Previous step"
          aria-label="Previous step"
        >
          <FiChevronLeft size={16} />
        </button>
        <button
          type="button"
          className="trace-player-play"
          onClick={handlePlayToggle}
          title={playing ? "Pause" : "Play"}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <FiPause size={15} /> : <FiPlay size={15} />}
        </button>
        <button
          type="button"
          onClick={() => goTo(index + 1)}
          disabled={index >= total - 1}
          title="Next step"
          aria-label="Next step"
        >
          <FiChevronRight size={16} />
        </button>

        <div className="trace-player-progress">
          <span className="trace-player-step-count">
            Step {index + 1} of {total}
          </span>
          <div className="trace-player-dots">
            {steps.map((_, i) => (
              <button
                key={i}
                type="button"
                className={`trace-player-dot${i === index ? " active" : ""}${i < index ? " done" : ""}`}
                onClick={() => goTo(i)}
                aria-label={`Go to step ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
