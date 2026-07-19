import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { useOnboarding } from "../context/OnboardingContext";
import "../styles/OnboardingTour.css";

const resolveTarget = (selector) => {
  if (!selector || typeof document === "undefined") return null;
  return document.querySelector(selector);
};

const VIEWPORT_MARGIN = 16;
const GAP = 14;

export default function OnboardingTour() {
  const { tour, closeTour, markPageOpened, markPageCompleted, markPageDismissed, flushOnboardingSync } = useOnboarding();
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const lastActionRef = useRef({ tourId: null, stepIndex: -1 });
  const bubbleRef = useRef(null);
  const [bubbleBox, setBubbleBox] = useState({ top: VIEWPORT_MARGIN, left: VIEWPORT_MARGIN, maxHeight: null, placement: "free" });

  const steps = tour?.steps || [];
  const activeStep = steps[stepIndex] || null;
  const isLastStep = stepIndex === steps.length - 1;
  const isFirstStep = stepIndex === 0;

  const currentTarget = useMemo(() => resolveTarget(activeStep?.target), [activeStep?.target, stepIndex]);

  useEffect(() => {
    setStepIndex(0);
  }, [tour?.id]);

  // Record that this tour was opened (bookkeeping only — replayCount /
  // lastOpenedAt). This fires once per genuine open, since `tour` always
  // passes through `null` (via closeTour) before a new one starts, making
  // `tour?.id` a real dependency change each time. It must NOT mark the
  // tour "seen"/completed — only reaching the final step does that below.
  useEffect(() => {
    if (tour?.pageId) {
      markPageOpened(tour.pageId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour?.id]);

  useEffect(() => {
    if (!tour || !activeStep) return;
    const alreadyRan = lastActionRef.current.tourId === tour.id && lastActionRef.current.stepIndex === stepIndex;
    if (alreadyRan) return;
    lastActionRef.current = { tourId: tour.id, stepIndex };

    if (typeof activeStep.onEnter === "function") {
      const result = activeStep.onEnter();
      if (result && typeof result.then === "function") {
        result.catch(() => {});
      }
    }
  }, [tour, activeStep, stepIndex]);

  useEffect(() => {
    if (!tour || !currentTarget) {
      setTargetRect(null);
      return;
    }

    const updateRect = () => {
      const rect = currentTarget.getBoundingClientRect();
      setTargetRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
    };

    updateRect();
    const raf = window.requestAnimationFrame(updateRect);
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);

    const timer = window.setInterval(updateRect, 250);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearInterval(timer);
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [tour, currentTarget, stepIndex]);

  // Smart positioning: measures the bubble's *actual* rendered size (never
  // assumes a fixed height/width) and picks whichever side of the
  // highlighted element — bottom, top, right, or left — actually has room
  // for it, falling back to whichever side has the most space if none is a
  // perfect fit. The result is always clamped fully inside the viewport,
  // and if the bubble is simply taller than the viewport itself, it's
  // capped to a max-height so its own body scrolls while the Skip/Next/
  // Finish action row (a flex-shrink:0 footer, see the CSS) stays pinned
  // and reachable. Re-runs on every content change (step, screen size,
  // zoom) so this stays correct across resolutions and zoom levels.
  useLayoutEffect(() => {
    const bubble = bubbleRef.current;
    if (!bubble) return;

    const compute = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const availableH = vh - VIEWPORT_MARGIN * 2;
      // Let the bubble take its natural height up to what the viewport can
      // hold; only cap it (forcing internal scroll) when it genuinely
      // doesn't fit.
      bubble.style.maxHeight = `${availableH}px`;
      const bw = bubble.offsetWidth || 360;
      const bh = Math.min(bubble.offsetHeight || 220, availableH);

      if (!targetRect) {
        setBubbleBox({ top: VIEWPORT_MARGIN, left: VIEWPORT_MARGIN, maxHeight: availableH, placement: "free" });
        return;
      }

      const spaceBelow = vh - (targetRect.top + targetRect.height) - VIEWPORT_MARGIN;
      const spaceAbove = targetRect.top - VIEWPORT_MARGIN;
      const spaceRight = vw - (targetRect.left + targetRect.width) - VIEWPORT_MARGIN;
      const spaceLeft = targetRect.left - VIEWPORT_MARGIN;

      const fits = { bottom: spaceBelow >= bh, top: spaceAbove >= bh, right: spaceRight >= bw, left: spaceLeft >= bw };
      let placement = fits.bottom ? "bottom" : fits.top ? "top" : fits.right ? "right" : fits.left ? "left" : null;

      if (!placement) {
        // Nothing fits perfectly — use whichever side has the most room
        // and let the bubble's own max-height/scroll handle the rest.
        const ranked = Object.entries({ bottom: spaceBelow, top: spaceAbove, right: spaceRight, left: spaceLeft })
          .sort((a, b) => b[1] - a[1]);
        placement = ranked[0][0];
      }

      let top;
      let left;
      if (placement === "bottom") {
        top = targetRect.top + targetRect.height + GAP;
        left = targetRect.left;
      } else if (placement === "top") {
        top = targetRect.top - bh - GAP;
        left = targetRect.left;
      } else if (placement === "right") {
        top = targetRect.top;
        left = targetRect.left + targetRect.width + GAP;
      } else {
        top = targetRect.top;
        left = targetRect.left - bw - GAP;
      }

      // Always clamp fully inside the viewport regardless of the chosen
      // side — this is what guarantees the action buttons never end up
      // off-screen, even for targets tucked into a corner.
      top = Math.max(VIEWPORT_MARGIN, Math.min(vh - bh - VIEWPORT_MARGIN, top));
      left = Math.max(VIEWPORT_MARGIN, Math.min(vw - bw - VIEWPORT_MARGIN, left));

      setBubbleBox({ top, left, maxHeight: availableH, placement });
    };

    compute();
    const raf = window.requestAnimationFrame(compute);
    window.addEventListener("resize", compute);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", compute);
    };
  }, [targetRect, stepIndex, tour?.id, activeStep?.title, activeStep?.description]);

  if (!tour || !activeStep) return null;

  // Some steps' onEnter opens page-level UI (e.g. the Big-O reference modal)
  // to make their target visible. Without a matching cleanup, that UI used
  // to stay stuck open forever — including after clicking "Previous", which
  // made it look like the tour wasn't reverting to the earlier explanation
  // at all (the leftover dialog just sat on top of it). Steps can define an
  // onExit that undoes whatever onEnter did; we run it for the step we're
  // currently leaving, whichever direction we're headed.
  const runOnExit = () => {
    if (typeof activeStep.onExit === "function") {
      try {
        activeStep.onExit();
      } catch {
        // Best-effort cleanup only.
      }
    }
  };

  // A tour stops auto-showing once the user has made an explicit decision
  // about it — either finishing it (reached the final step and clicked
  // Finish) or skipping it. Both permanently record that decision; only
  // the timestamp field differs (lastCompletedAt vs lastSkippedAt) so it's
  // still possible to tell them apart later without affecting the
  // auto-show gate, which checks `seen` either way. Either way, flush the
  // result to Postgres immediately rather than waiting for the general
  // debounced sync, so a fast click-through-and-navigate-away right after
  // can't race the save.
  const finishTour = (completed = true) => {
    runOnExit();
    if (tour.pageId) {
      if (completed) {
        markPageCompleted(tour.pageId);
      } else {
        markPageDismissed(tour.pageId);
      }
    }
    closeTour();
    flushOnboardingSync();
  };

  const nextStep = () => {
    if (isLastStep) {
      finishTour(true);
      return;
    }
    runOnExit();
    setStepIndex((value) => Math.min(value + 1, steps.length - 1));
  };

  const prevStep = () => {
    runOnExit();
    setStepIndex((value) => Math.max(value - 1, 0));
  };

  const overlayStyle = targetRect
    ? {
        clipPath: `polygon(0 0, 0 100%, ${Math.max(0, targetRect.left - 10)}px 100%, ${Math.max(0, targetRect.left - 10)}px ${Math.max(0, targetRect.top - 10)}px, ${Math.max(0, targetRect.left + targetRect.width + 10)}px ${Math.max(0, targetRect.top - 10)}px, ${Math.max(0, targetRect.left + targetRect.width + 10)}px ${Math.max(0, targetRect.top + targetRect.height + 10)}px, ${Math.max(0, targetRect.left - 10)}px ${Math.max(0, targetRect.top + targetRect.height + 10)}px, ${Math.max(0, targetRect.left - 10)}px 100%, 100% 100%, 100% 0)`
      }
    : {};

  return (
    <>
      <div className="onboarding-overlay" style={overlayStyle} />
      <div className="onboarding-highlight" style={targetRect ? { top: `${Math.max(0, targetRect.top - 10)}px`, left: `${Math.max(0, targetRect.left - 10)}px`, width: `${targetRect.width + 20}px`, height: `${targetRect.height + 20}px` } : undefined} />
      <div
        ref={bubbleRef}
        className="onboarding-bubble"
        style={{ top: `${bubbleBox.top}px`, left: `${bubbleBox.left}px`, maxHeight: bubbleBox.maxHeight ? `${bubbleBox.maxHeight}px` : undefined }}
        role="dialog"
        aria-modal="true"
        aria-live="polite"
      >
        <div className="onboarding-bubble-scroll">
          <div className="onboarding-bubble-top">
            <div>
              <span className="onboarding-step-count">{stepIndex + 1} / {steps.length}</span>
              <h3>{activeStep.title}</h3>
            </div>
          </div>
          <p>{activeStep.description}</p>
        </div>
        <div className="onboarding-actions">
          <button type="button" className="onboarding-skip-btn" onClick={() => finishTour(false)}>Skip Tour</button>
          <div className="onboarding-nav-btns">
            <button type="button" onClick={prevStep} disabled={isFirstStep} className="onboarding-nav-btn">
              <FiChevronLeft /> Previous
            </button>
            <button type="button" onClick={nextStep} className="onboarding-nav-btn primary">
              {isLastStep ? "Finish" : "Next"} <FiChevronRight />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
