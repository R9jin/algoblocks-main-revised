// frontend/src/components/UnlockIcon.jsx
//
// Drop-in replacement for the plain "locked ? <FiLock/> : <SomeIcon/>"
// pattern used across LearningPath.jsx and LessonViewer.jsx. When
// `justUnlocked` is true it plays a one-shot lock-breaking animation
// (shake -> pop open -> glow + sparkles -> settle into resolvedIcon)
// entirely in CSS, so no timers are needed inside the icon itself; the
// parent page owns clearing `justUnlocked` after the animation window.
import { FiLock, FiUnlock } from "react-icons/fi";
import "../styles/UnlockIcon.css";

export default function UnlockIcon({
  locked,
  justUnlocked = false,
  size = 16,
  resolvedIcon = null,
  lockedColor = "#bdbdbd",
}) {
  if (locked) {
    return <FiLock size={size} color={lockedColor} />;
  }

  if (justUnlocked) {
    return (
      <span
        className="unlock-icon-stage"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <span className="unlock-icon-glow" />
        <span className="unlock-icon-sparkle s1" />
        <span className="unlock-icon-sparkle s2" />
        <span className="unlock-icon-sparkle s3" />
        <FiLock size={size} className="unlock-icon-lock" color={lockedColor} />
        <FiUnlock size={size} className="unlock-icon-open" />
        {resolvedIcon && <span className="unlock-icon-resolved">{resolvedIcon}</span>}
      </span>
    );
  }

  return resolvedIcon;
}
