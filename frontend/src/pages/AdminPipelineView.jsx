// frontend/src/pages/AdminPipelineView.jsx
//
// Admin-only walkthrough of the Complexity Analysis Model, built for
// panelists rather than learners. It is the real workspace (MainApp) in
// "pipeline mode" -- all templates, tabs, Blocks/Python, Console and
// Complexity panels -- with the full-width Pipeline replay underneath and
// every user-centred feature (saving, project storage, snapshots) turned off.
import MainApp from "./MainApp";

export default function AdminPipelineView() {
  return <MainApp pipelineMode />;
}
