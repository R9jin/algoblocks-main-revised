import { useEffect, useMemo, useRef, useState } from "react";
import { FiChevronLeft, FiChevronRight, FiX } from "react-icons/fi";
import { useOnboarding } from "../context/OnboardingContext";
import "../styles/OnboardingTour.css";

const resolveTarget = (selector) => {
  if (!selector || typeof document === "undefined") return null;
  return document.querySelector(selector);
};

export default function OnboardingTour() {
  const { tour, closeTour, markSystemSeen, markPageSeen, markPageReplay } = useOnboarding();
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const lastActionRef = useRef({ tourId: null, stepIndex: -1 });

  const steps = tour?.steps || [];
  const activeStep = steps[stepIndex] || null;
  const isLastStep = stepIndex === steps.length - 1;
  const isFirstStep = stepIndex === 0;

  const currentTarget = useMemo(() => resolveTarget(activeStep?.target), [activeStep?.target, stepIndex]);

  useEffect(() => {
    setStepIndex(0);
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

  if (!tour || !activeStep) return null;

  const finishTour = (completed = true) => {
    if (tour.pageId) {
      markPageReplay(tour.pageId, completed);
      if (completed) markPageSeen(tour.pageId);
    } else if (completed) {
      markSystemSeen();
    }
    closeTour();
  };

  const nextStep = () => {
    if (isLastStep) {
      finishTour(true);
      return;
    }
    setStepIndex((value) => Math.min(value + 1, steps.length - 1));
  };

  const prevStep = () => setStepIndex((value) => Math.max(value - 1, 0));

  const overlayStyle = targetRect
    ? {
        clipPath: `polygon(0 0, 0 100%, ${Math.max(0, targetRect.left - 10)}px 100%, ${Math.max(0, targetRect.left - 10)}px ${Math.max(0, targetRect.top - 10)}px, ${Math.max(0, targetRect.left + targetRect.width + 10)}px ${Math.max(0, targetRect.top - 10)}px, ${Math.max(0, targetRect.left + targetRect.width + 10)}px ${Math.max(0, targetRect.top + targetRect.height + 10)}px, ${Math.max(0, targetRect.left - 10)}px ${Math.max(0, targetRect.top + targetRect.height + 10)}px, ${Math.max(0, targetRect.left - 10)}px 100%, 100% 100%, 100% 0)`
      }
    : {};

  const bubbleStyle = targetRect
    ? {
        top: `${Math.max(16, Math.min(window.innerHeight - 220, targetRect.top + targetRect.height + 16))}px`,
        left: `${Math.max(16, Math.min(window.innerWidth - 360, targetRect.left))}px`,
      }
    : { top: "64px", left: "64px" };

  return (
    <>
      <div className="onboarding-overlay" style={overlayStyle} />
      <div className="onboarding-highlight" style={targetRect ? { top: `${Math.max(0, targetRect.top - 10)}px`, left: `${Math.max(0, targetRect.left - 10)}px`, width: `${targetRect.width + 20}px`, height: `${targetRect.height + 20}px` } : undefined} />
      <div className="onboarding-bubble" style={bubbleStyle} role="dialog" aria-modal="true" aria-live="polite">
        <div className="onboarding-bubble-top">
          <div>
            <span className="onboarding-step-count">{stepIndex + 1} / {steps.length}</span>
            <h3>{activeStep.title}</h3>
          </div>
          <button type="button" className="onboarding-close-btn" onClick={() => finishTour(false)} aria-label="Skip tour">
            <FiX />
          </button>
        </div>
        <p>{activeStep.description}</p>
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
