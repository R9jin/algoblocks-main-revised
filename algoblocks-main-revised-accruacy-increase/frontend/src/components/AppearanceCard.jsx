// frontend/src/components/AppearanceCard.jsx
// "Appearance" card for the Profile page: Light / Dark / System.
import { useEffect, useState } from "react";
import { FiMonitor, FiMoon, FiSun } from "react-icons/fi";
import { THEME_CHANGE_EVENT, getThemePreference, resolveTheme, setThemePreference } from "../utils/theme";

const OPTIONS = [
  { id: "light", label: "Light", Icon: FiSun },
  { id: "dark", label: "Dark", Icon: FiMoon },
  { id: "system", label: "System", Icon: FiMonitor },
];

export default function AppearanceCard() {
  const [pref, setPref] = useState(getThemePreference);

  useEffect(() => {
    const sync = () => setPref(getThemePreference());
    window.addEventListener(THEME_CHANGE_EVENT, sync);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, sync);
  }, []);

  const choose = (id) => { setPref(id); setThemePreference(id); };
  const hint =
    pref === "system"
      ? `Following your device (currently ${resolveTheme("system")}).`
      : pref === "dark"
      ? "Easier on the eyes in low light."
      : "The default bright look.";

  return (
    <section className="appearance-card" aria-label="Appearance">
      <h3 className="sidebar-title">Appearance</h3>
      <div className="appearance-box">
        <div className="appearance-seg" role="radiogroup" aria-label="Colour theme">
          {OPTIONS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={pref === id}
              className={`appearance-opt ${pref === id ? "on" : ""}`}
              onClick={() => choose(id)}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
        <p className="appearance-hint">{hint}</p>
      </div>
    </section>
  );
}
