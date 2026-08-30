/*frontend\src\components\RewardModal.jsx*/
import { useEffect, useMemo, useState } from "react";
import {
  FiArrowRight,
  FiCheckCircle,
  FiTarget,
  FiUnlock,
  FiXCircle,
} from "react-icons/fi";
import {
  GiPodiumWinner,
  GiRocket,
  GiStarMedal,
  GiTargetShot,
  GiTrophyCup,
  GiUpgrade,
} from "react-icons/gi";
import "../styles/RewardModal.css";

// Tier presets driving the badge icon, accent color, and how much
// confetti/glow the moment deserves. "score" tiers describe how well the
// activity itself went; "retry" is the non-celebratory failure state.
const TIER_PRESETS = {
  perfect: { Icon: GiTrophyCup, accent: "#f7b733", accentSoft: "rgba(247, 183, 51, 0.18)", label: "Perfect Execution!", confetti: "high" },
  great: { Icon: GiStarMedal, accent: "#a78bfa", accentSoft: "rgba(167, 139, 250, 0.18)", label: "Great Job!", confetti: "medium" },
  good: { Icon: GiRocket, accent: "#60a5fa", accentSoft: "rgba(96, 165, 250, 0.18)", label: "Good Effort!", confetti: "low" },
  retry: { Icon: GiTargetShot, accent: "#f59e0b", accentSoft: "rgba(245, 158, 11, 0.16)", label: "Keep Trying!", confetti: "none" },
};

// Milestone banner shown under the main result when the learner cleared the
// lesson requirement or finished the last activity in the section.
const MILESTONE_PRESETS = {
  lessonUnlocked: { Icon: FiUnlock, label: "Lesson Unlocked!", accent: "#34d399" },
  sectionCompleted: { Icon: GiPodiumWinner, label: "Section Completed!", accent: "#f7b733" },
};

const CONFETTI_COLORS = ["#f7b733", "#a78bfa", "#60a5fa", "#34d399", "#f472b6", "#fb923c"];

function ConfettiBurst({ intensity }) {
  const pieceCount = intensity === "high" ? 42 : intensity === "medium" ? 26 : 14;

  const pieces = useMemo(() => {
    return Array.from({ length: pieceCount }, (_, i) => {
      const left = Math.random() * 100;
      const delay = Math.random() * 0.5;
      const duration = 2.6 + Math.random() * 1.6;
      const drift = (Math.random() - 0.5) * 140;
      const rotate = Math.random() * 360;
      const size = 6 + Math.random() * 7;
      const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      const round = Math.random() > 0.5;
      return { id: i, left, delay, duration, drift, rotate, size, color, round };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieceCount]);

  return (
    <div className="reward-confetti-layer" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="reward-confetti-piece"
          style={{
            left: `${p.left}%`,
            width: `${p.size}px`,
            height: `${p.size * 0.4}px`,
            background: p.color,
            borderRadius: p.round ? "50%" : "2px",
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            "--drift": `${p.drift}px`,
            "--rotate": `${p.rotate}deg`,
          }}
        />
      ))}
    </div>
  );
}

function useCountUp(target, isOpen, duration = 900) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!isOpen || typeof target !== "number") return;
    let raf;
    const start = performance.now();
    const from = 0;

    const tick = (now) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / duration);
      // Ease-out cubic for a satisfying deceleration into the final number.
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, isOpen, duration]);

  return value;
}

/**
 * Celebratory result modal shown after an activity is evaluated. Replaces
 * the old plain-text ConfirmModal wall-of-text with icons, an animated
 * score, progress bar, and (for good outcomes) a confetti burst.
 *
 * Expected `result` shape:
 * {
 *   tier: 'perfect' | 'great' | 'good' | 'retry',
 *   aesScore: number | null,
 *   funcPassed: number,
 *   funcTotal: number,
 *   rogGain: number,
 *   passedCount: number,
 *   threshold: number,
 *   milestone: 'lessonUnlocked' | 'sectionCompleted' | null,
 *   description: string,
 * }
 */
const RewardModal = ({
  isOpen,
  result,
  onConfirm,
  onCancel,
  onSecondary,
  secondaryText,
  confirmText = "Continue",
  cancelText = "Stay Here",
}) => {
  const animatedScore = useCountUp(result?.aesScore, isOpen);

  if (!isOpen || !result) return null;

  const tier = TIER_PRESETS[result.tier] || TIER_PRESETS.good;
  const TierIcon = tier.Icon;
  const milestone = result.milestone ? MILESTONE_PRESETS[result.milestone] : null;
  const MilestoneIcon = milestone?.Icon;

  const showConfetti = tier.confetti !== "none" || !!milestone;
  const confettiIntensity = milestone ? "high" : tier.confetti;

  const funcAllPassed = result.funcTotal > 0 && result.funcPassed === result.funcTotal;
  const progressPct = result.threshold > 0
    ? Math.min(100, Math.round((result.passedCount / result.threshold) * 100))
    : 0;

  return (
    <div className="modal-overlay reward-modal-overlay">
      <div className="reward-modal-content" style={{ "--tier-accent": tier.accent, "--tier-accent-soft": tier.accentSoft }}>
        {showConfetti && <ConfettiBurst intensity={confettiIntensity} />}

        <div className="reward-badge-wrap">
          <div className="reward-badge-glow" />
          <div className="reward-badge-ring">
            <TierIcon className="reward-badge-icon" />
          </div>
        </div>

        <h2 className="reward-title">{tier.label}</h2>

        {typeof result.aesScore === "number" && (
          <div className="reward-score">
            <span className="reward-score-value">{animatedScore}%</span>
            <span className="reward-score-caption">Algorithmic Efficiency Score</span>
          </div>
        )}

        {result.description && <p className="reward-description">{result.description}</p>}

        <div className="reward-chip-row">
          {result.funcTotal > 0 && (
            <div className={`reward-chip ${funcAllPassed ? "is-positive" : "is-negative"}`}>
              {funcAllPassed ? <FiCheckCircle /> : <FiXCircle />}
              <span>{result.funcPassed}/{result.funcTotal} functional tests</span>
            </div>
          )}
          {result.rogGain > 0 && (
            <div className="reward-chip is-rog">
              <GiUpgrade />
              <span>+{result.rogGain} ROG points</span>
            </div>
          )}
        </div>

        {result.threshold > 0 && (
          <div className="reward-progress">
            <div className="reward-progress-label">
              <span><FiTarget /> Lesson Progress</span>
              <span>{result.passedCount}/{result.threshold}</span>
            </div>
            <div className="reward-progress-track">
              <div className="reward-progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        )}

        {milestone && (
          <div className="reward-milestone-wrap">
            <div className="reward-milestone" style={{ "--milestone-accent": milestone.accent }}>
              <MilestoneIcon className="reward-milestone-icon" />
              <span>{milestone.label}</span>
            </div>
            {result.milestoneNote && <p className="reward-milestone-note">{result.milestoneNote}</p>}
          </div>
        )}

        <div className="reward-modal-footer">
          <button className="reward-btn reward-btn-ghost" onClick={onCancel}>
            {cancelText}
          </button>
          {onSecondary && (
            <button className="reward-btn reward-btn-secondary" onClick={onSecondary}>
              {secondaryText}
            </button>
          )}
          <button className="reward-btn reward-btn-primary" onClick={onConfirm}>
            {confirmText} <FiArrowRight />
          </button>
        </div>
      </div>
    </div>
  );
};

export default RewardModal;
