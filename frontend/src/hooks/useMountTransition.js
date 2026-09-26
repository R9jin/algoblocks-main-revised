import { useEffect, useRef, useState } from "react";

// Every modal in this app used to do `if (!isOpen) return null;` -- which
// gave a nice eased entrance (fade + scale/slide in) but an instant, jarring
// exit, since React unmounts the element the same frame isOpen goes false
// and no CSS animation ever gets a chance to run.
//
// This hook keeps the element mounted for `exitDurationMs` after isOpen
// flips to false so a matching exit animation can play first. Usage:
//
//   const shouldRender = useMountTransition(isOpen, 220);
//   if (!shouldRender) return null;
//   return (
//     <div className={`modal-overlay ${isOpen ? "" : "is-closing"}`}>
//       <div className={`modal-content ${isOpen ? "" : "is-closing"}`}>...
//
// The CSS then defines a reverse (fade-out/scale-down) animation on the
// `.is-closing` class with a duration that matches exitDurationMs.
export default function useMountTransition(isOpen, exitDurationMs = 220) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setShouldRender(true);
    } else if (shouldRender) {
      timeoutRef.current = setTimeout(() => {
        setShouldRender(false);
        timeoutRef.current = null;
      }, exitDurationMs);
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, exitDurationMs]);

  return shouldRender;
}
