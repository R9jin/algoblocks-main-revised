import { FiHelpCircle } from "react-icons/fi";
import { useOnboarding } from "../context/OnboardingContext";

export default function TourHelpButton({ label = "Help tour", tour }) {
  const { startTour } = useOnboarding();

  if (!tour) return null;

  const handleClick = () => {
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
