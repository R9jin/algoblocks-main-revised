import { FiHelpCircle } from "react-icons/fi";
import { useOnboarding } from "../context/OnboardingContext";

export default function TourHelpButton({ pageId, label = "Help tour", tour }) {
  const { startTour, markPageReplay } = useOnboarding();

  if (!tour) return null;

  const handleClick = () => {
    if (pageId) {
      markPageReplay(pageId, false);
    }
    startTour(tour);
  };

  return (
    <button
      type="button"
      className="tour-help-btn"
      onClick={handleClick}
      aria-label={label}
      title={label}
    >
      <FiHelpCircle />
    </button>
  );
}
