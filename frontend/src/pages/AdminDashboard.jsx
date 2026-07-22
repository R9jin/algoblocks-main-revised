// frontend/src/pages/AdminDashboard.jsx
//
// Admin accounts get a dedicated dashboard instead of the student one.
// Admins do not have Learning Path / Workspace / Project progress, so
// none of that surfaces here. Instead the dashboard is scoped to the two
// things an admin account is actually for:
//   1. A compact "at a glance" User Management overview (with a link out
//      to the full management page, which still lives at /admin/users
//      and is reachable from the profile icon menu).
//   2. The full Dataset Testing tool (EvaluationSuite), embedded in full.
import { useEffect, useMemo, useState } from "react";
import { LuRefreshCw, LuShield, LuTriangleAlert, LuUserCheck, LuUserPlus, LuUsers } from "react-icons/lu";
import { useNavigate } from "react-router-dom";
import DashboardHeader from "../components/DashboardHeader";
import EvaluationSuite from "./EvaluationSuite";
import "../styles/Dashboard.css";
import "../styles/AdminUserManagement.css";

const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

const getAuthToken = () =>
  localStorage.getItem("token") ||
  sessionStorage.getItem("token") ||
  localStorage.getItem("authToken") ||
  sessionStorage.getItem("authToken");

const isSuspendedStatus = (status) => (status || "").trim().toLowerCase() === "suspended";

const adminDashboardTour = {
  id: "admin-dashboard-tour",
  pageId: "admin-dashboard",
  title: "Admin Dashboard Tour",
  steps: [
    { target: ".admin-dash-overview-card", title: "User Management at a glance", description: "Quick counts across every account. Open the full manager to search, suspend, or delete accounts." },
    { target: ".admin-dash-eval-section", title: "Dataset Testing", description: "Run the full complexity analyzer benchmark directly from the dashboard." },
  ],
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE}/api/admin/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to fetch users");

      if (data && Array.isArray(data.users)) setUsers(data.users);
      else if (Array.isArray(data)) setUsers(data);
      else setUsers([]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const stats = useMemo(() => {
    const list = Array.isArray(users) ? users : [];
    const admins = list.filter(u => u.isAdmin === true || u.role === "admin");
    const standard = list.filter(u => !(u.isAdmin === true || u.role === "admin"));
    const suspended = list.filter(u => isSuspendedStatus(u.status));
    return {
      total: list.length,
      standard: standard.length,
      admins: admins.length,
      suspended: suspended.length,
      active: list.length - suspended.length,
    };
  }, [users]);

  return (
    <div className="dashboard-page">
      <DashboardHeader backTo="/dashboard" backText="Back to Home" tour={adminDashboardTour} tourPageId="admin-dashboard" />

      <main className="dashboard-main" style={{ maxWidth: "1400px", margin: "0 auto", padding: "24px" }}>
        <section style={{ marginBottom: "28px" }}>
          <div className="section-header">
            <h2><LuShield size={22} style={{ verticalAlign: "-3px", marginRight: "6px" }} />Admin Dashboard</h2>
            <p>User Management overview and the full Dataset Testing suite. Learning Path and Workspace progress are student-only features and are not part of the admin account.</p>
          </div>

          <div className="admin-dash-overview-card" style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "16px",
            padding: "20px",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
              <h3 style={{ display: "flex", alignItems: "center", gap: "8px", margin: 0 }}>
                <LuUsers size={20} /> User Management
              </h3>
              <div style={{ display: "flex", gap: "10px" }}>
                <button onClick={fetchUsers} className="admin-refresh-btn small outline" type="button">
                  <LuRefreshCw size={16} /> Refresh
                </button>
                <button onClick={() => navigate("/admin/users")} className="admin-refresh-btn small" type="button">
                  <LuUserCheck size={16} /> Open Full User Management
                </button>
              </div>
            </div>

            {loading ? (
              <div className="admin-loading-state compact">
                <LuRefreshCw size={24} className="spinner-icon" style={{ animation: "spin 2s linear infinite" }} />
                <span>Loading account directory...</span>
              </div>
            ) : error ? (
              <div className="admin-message-box error">
                <LuTriangleAlert size={22} />
                <span>{error}</span>
              </div>
            ) : (
              <div className="analytics-card-grid">
                <div className="analytics-card">
                  <div className="analytics-card-icon count"><LuUsers size={20} /></div>
                  <div className="analytics-card-body">
                    <span className="analytics-card-value">{stats.total}</span>
                    <span className="analytics-card-label">Total Accounts</span>
                  </div>
                </div>
                <div className="analytics-card">
                  <div className="analytics-card-icon tsr"><LuUserPlus size={20} /></div>
                  <div className="analytics-card-body">
                    <span className="analytics-card-value">{stats.standard}</span>
                    <span className="analytics-card-label">Standard Users</span>
                  </div>
                </div>
                <div className="analytics-card">
                  <div className="analytics-card-icon aes"><LuShield size={20} /></div>
                  <div className="analytics-card-body">
                    <span className="analytics-card-value">{stats.admins}</span>
                    <span className="analytics-card-label">Admin Accounts</span>
                  </div>
                </div>
                <div className="analytics-card">
                  <div className="analytics-card-icon rog"><LuUserCheck size={20} /></div>
                  <div className="analytics-card-body">
                    <span className="analytics-card-value">{stats.active}</span>
                    <span className="analytics-card-label">Active</span>
                  </div>
                </div>
                <div className="analytics-card">
                  <div className="analytics-card-icon mean"><LuTriangleAlert size={20} /></div>
                  <div className="analytics-card-body">
                    <span className="analytics-card-value">{stats.suspended}</span>
                    <span className="analytics-card-label">Suspended</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="admin-dash-eval-section">
          <div className="section-header">
            <h2>Dataset Testing</h2>
            <p>Full complexity analyzer benchmark, run directly from the dashboard.</p>
          </div>
          <EvaluationSuite embedded />
        </section>
      </main>
    </div>
  );
}
