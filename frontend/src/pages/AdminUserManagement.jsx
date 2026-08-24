// frontend/src/pages/AdminUserManagement.jsx
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  LuActivity,
  LuAward,
  LuBan,
  LuChartBar,
  LuCheck,
  LuChevronDown,
  LuChevronUp,
  LuFilter,
  LuFlaskConical,
  LuInfo,
  LuListChecks,
  LuMailWarning,
  LuRefreshCw,
  LuSearch,
  LuShield,
  LuTarget,
  LuTrash2,
  LuTrendingUp,
  LuTriangleAlert,
  LuUser,
  LuUserCheck,
  LuUsers,
  LuX
} from "react-icons/lu";
import DashboardHeader from "../components/DashboardHeader";
import { getErrorMessage } from "../utils/apiError";
import "../styles/AdminUserManagement.css";

const MetricTooltip = ({ title, meanFormula, baseFormula, formula, desc, children }) => (
  <span className="metric-tooltip-wrapper">
    <span className="metric-tooltip-text">{children}</span>
    <span className="metric-info-badge" tabIndex={0} role="button" aria-label={`Information for ${title || "metric"}`}>
      <LuInfo size={13} className="metric-info-icon" />
      <span className="metric-tooltip-popup">
        {title && <strong className="tooltip-title">{title}</strong>}
        {meanFormula && (
          <div className="tooltip-formula-group">
            <span className="tooltip-formula-label">Overall Mean Formula:</span>
            <code className="tooltip-formula mean-formula">{meanFormula}</code>
          </div>
        )}
        {(baseFormula || formula) && (
          <div className="tooltip-formula-group">
            {meanFormula && <span className="tooltip-formula-label">Activity Base Formula:</span>}
            <code className="tooltip-formula base-formula">{baseFormula || formula}</code>
          </div>
        )}
        {desc && <span className="tooltip-desc">{desc}</span>}
      </span>
    </span>
  </span>
);

const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

// Every fetch below used to check ONLY localStorage for the auth token
// (localStorage.getItem("token") || localStorage.getItem("authToken")).
// SignIn.jsx stores the session in sessionStorage whenever "Remember Me"
// is unchecked, so on any device/browser using a session-only login, that
// lookup silently returned null, every request here sent
// "Authorization: Bearer null", and the backend correctly rejected it with
// a 401 — which is exactly what showed up as "fails to fetch" on other
// devices. This helper checks both storages, matching how currentUser is
// already read a few lines below.
const getAuthToken = () =>
  localStorage.getItem("token") ||
  sessionStorage.getItem("token") ||
  localStorage.getItem("authToken") ||
  sessionStorage.getItem("authToken");

// Status is stored/sent as "active"/"suspended" going forward, but rows
// touched before that normalization may still hold the old "Active"/
// "Suspended" casing. Compare case-insensitively everywhere so both forms
// work correctly.
const isSuspendedStatus = (status) => (status || "").trim().toLowerCase() === "suspended";

const AdminUserManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Search and Filter States
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all"); 
  const [statusFilter, setStatusFilter] = useState("all"); 
  // Narrows the row list to just standard users who have a recorded
  // post-test score -- lets an admin scoping a live evaluation round
  // (e.g. reviewing "who's actually finished the study") skip past
  // accounts still mid-curriculum or that never started. Independent of
  // the "Post-test only" toggle further down, which scopes the cohort
  // analytics dashboard rather than this table.
  const [postTestRowFilter, setPostTestRowFilter] = useState("all"); // all | completed | not_completed

  // Custom Modal State
  const [modalConfig, setModalConfig] = useState({
    isOpen: false,
    type: "alert", // 'alert' | 'confirm' | 'prompt'
    title: "",
    message: "",
    isPassword: true,
    isDanger: false,
    onConfirm: null
  });
  const [modalInputValue, setModalInputValue] = useState("");

  // Per-user metrics dropdown state. Any number of rows can be expanded at
  // once (a Set of emails), rather than only ever one at a time.
  const [expandedEmails, setExpandedEmails] = useState(() => new Set());
  const [userMetricsCache, setUserMetricsCache] = useState({});
  const [loadingMetricsEmails, setLoadingMetricsEmails] = useState(() => new Set());
  const [metricsError, setMetricsError] = useState({});

  // Per-user activity history collapsible dropdowns & module filter states
  const [expandedActivitySections, setExpandedActivitySections] = useState(() => new Set());
  const [userActivityModuleFilters, setUserActivityModuleFilters] = useState({});

  const toggleActivitySection = (email) => {
    setExpandedActivitySections((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  const setModuleFilterForUser = (email, moduleId) => {
    setUserActivityModuleFilters((prev) => ({ ...prev, [email]: moduleId }));
  };

  // Cohort-wide analytics dashboard state
  const [overview, setOverview] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState(null);

  // Respondent selection state (for scoping "Overall Learning Impact" to
  // specific accounts during a live data-gathering session)
  const [isSelectingRespondents, setIsSelectingRespondents] = useState(false);
  const [selectedRespondents, setSelectedRespondents] = useState([]); // emails currently applied to the dashboard
  const [pendingRespondents, setPendingRespondents] = useState([]); // emails checked in the picker, not yet applied

  // When on, the dashboard only processes standard-user accounts that have
  // an actual recorded post-test score -- i.e. accounts that finished the
  // course post-test -- rather than mixing in respondents who are still
  // mid-curriculum or never took it. Combines (AND) with respondent selection.
  const [postTestOnly, setPostTestOnly] = useState(false);

  // Pending forgot-password requests, for the Admin > User Management
  // review panel. Legacy manual-override path: normal forgot-password
  // requests now email the user directly (see auth_service.forgot_password),
  // so this list stays empty in the common case.
  const [resetRequests, setResetRequests] = useState([]);
  const [resetRequestsLoading, setResetRequestsLoading] = useState(true);
  const [resetRequestsError, setResetRequestsError] = useState(null);
  const [processingResetEmails, setProcessingResetEmails] = useState(() => new Set());

  const standardUsers = useMemo(
    () => (Array.isArray(users) ? users.filter(u => !(u.isAdmin || u.role === "admin")) : []),
    [users]
  );

  // When "Post-test completers only" is on, the picker should only list (and
  // let you toggle) accounts that actually have a recorded post-test score --
  // otherwise you're hunting for the handful of real completers inside a
  // list of 18 mixed accounts. Falls back to every standard user when the
  // toggle is off, so the picker still works for scoping the wider dashboard.
  const respondentPickerUsers = useMemo(
    () => (postTestOnly ? standardUsers.filter(u => u.hasCompletedPostTest === true) : standardUsers),
    [standardUsers, postTestOnly]
  );

  const openRespondentPicker = () => {
    // Pre-check the intersection of whatever's currently applied with the
    // list actually shown, so switching the post-test-only toggle on doesn't
    // leave stale, no-longer-visible emails silently checked in the picker.
    const eligibleEmails = respondentPickerUsers.map(u => u.email);
    const startingSelection = selectedRespondents.length > 0
      ? selectedRespondents.filter(e => eligibleEmails.includes(e))
      : eligibleEmails;
    setPendingRespondents(startingSelection);
    setIsSelectingRespondents(true);
  };

  const toggleRespondent = (email) => {
    setPendingRespondents((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]
    );
  };

  const applyRespondentSelection = () => {
    setSelectedRespondents(pendingRespondents);
    setIsSelectingRespondents(false);
    fetchOverview(pendingRespondents);
  };

  const resetToAllRespondents = () => {
    setSelectedRespondents([]);
    setIsSelectingRespondents(false);
    fetchOverview();
  };

  const adminTour = {
    id: "admin-users-tour",
    pageId: "admin-users",
    title: "Admin Tour",
    steps: [
      { target: ".dashboard-header, .page-header", title: "Admin overview", description: "Use the top controls to search, filter, and refresh the user list." },
      { target: ".admin-table, .users-table, .user-card-list", title: "Manage accounts", description: "Review user records and apply status or deletion actions carefully." },
      { target: ".custom-modal, .modal-overlay", title: "Confirm changes", description: "Sensitive actions always route through a confirmation dialog." },
    ],
  };

  const currentUser = useMemo(() => {
    try {
      const stored = localStorage.getItem("user") || sessionStorage.getItem("user");
      if (!stored || stored === "undefined") return {};
      return JSON.parse(stored);
    } catch (e) {
      return {};
    }
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE}/api/admin/users`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(data, "Failed to fetch users"));
      
      if (data && Array.isArray(data.users)) {
        setUsers(data.users);
      } else if (Array.isArray(data)) {
        setUsers(data);
      } else {
        setUsers([]);
      }
    } catch (err) {
      const isOffline = !navigator.onLine || err.message?.includes("Failed to fetch") || err.name === "TypeError";
      setError(isOffline ? "Live user management is unavailable while offline. Connect to the internet to load database records." : err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchResetRequests = async () => {
    setResetRequestsLoading(true);
    setResetRequestsError(null);
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE}/api/admin/password-reset-requests`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(data, "Failed to fetch password reset requests"));
      setResetRequests(Array.isArray(data.requests) ? data.requests : []);
    } catch (err) {
      const isOffline = !navigator.onLine || err.message?.includes("Failed to fetch") || err.name === "TypeError";
      setResetRequestsError(isOffline ? "Password reset queue unavailable offline." : err.message);
    } finally {
      setResetRequestsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchOverview();
    fetchResetRequests();
  }, []);

  // `postTestOnlyOverride` lets callers pass the intended value explicitly
  // (e.g. the checkbox's onChange handler, where the new value hasn't hit
  // state yet) instead of relying on a possibly-stale `postTestOnly` closure.
  const fetchOverview = async (emailsOverride, postTestOnlyOverride) => {
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      const token = getAuthToken();
      const params = new URLSearchParams();
      if (Array.isArray(emailsOverride) && emailsOverride.length > 0) {
        params.set("emails", emailsOverride.join(","));
      }
      const wantsPostTestOnly = postTestOnlyOverride !== undefined ? postTestOnlyOverride : postTestOnly;
      if (wantsPostTestOnly) {
        params.set("post_test_only", "true");
      }
      const query = params.toString();
      const response = await fetch(`${API_BASE}/api/admin/analytics/overview${query ? `?${query}` : ""}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(data, "Failed to fetch analytics overview"));
      setOverview(data);
    } catch (err) {
      const isOffline = !navigator.onLine || err.message?.includes("Failed to fetch") || err.name === "TypeError";
      setOverviewError(isOffline ? "Learning analytics requires a live backend connection." : err.message);
    } finally {
      setOverviewLoading(false);
    }
  };

  const togglePostTestOnly = () => {
    const next = !postTestOnly;
    setPostTestOnly(next);
    fetchOverview(selectedRespondents.length > 0 ? selectedRespondents : undefined, next);
  };

  const toggleUserMetrics = async (email) => {
    // Toggle just this row's membership in the expanded set -- expanding
    // one user's metrics no longer collapses any other user's already-open
    // panel, so admins can compare several side by side.
    setExpandedEmails((prev) => {
      const next = new Set(prev);
      if (next.has(email)) {
        next.delete(email);
      } else {
        next.add(email);
      }
      return next;
    });

    if (expandedEmails.has(email)) return; // was open, now collapsing -- nothing to fetch
    if (userMetricsCache[email]) return; // already fetched, just showing cached data

    setLoadingMetricsEmails((prev) => new Set(prev).add(email));
    setMetricsError((prev) => ({ ...prev, [email]: null }));
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE}/api/admin/users/${encodeURIComponent(email)}/metrics`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(data, "Failed to fetch user metrics"));
      setUserMetricsCache((prev) => ({ ...prev, [email]: data }));
    } catch (err) {
      setMetricsError((prev) => ({ ...prev, [email]: err.message }));
    } finally {
      setLoadingMetricsEmails((prev) => {
        const next = new Set(prev);
        next.delete(email);
        return next;
      });
    }
  };

  const filteredUsers = useMemo(() => {
    if (!Array.isArray(users)) return []; 
    
    return users.filter(user => {
      const matchesSearch = 
        (user.name || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
        (user.email || "").toLowerCase().includes(searchTerm.toLowerCase());
      
      const isUserAdmin = user.isAdmin === true || user.role === "admin";
      const matchesRole = 
        roleFilter === "all" ? true : 
        roleFilter === "admin" ? isUserAdmin : !isUserAdmin;
      
      const matchesStatus = 
        statusFilter === "all" ? true : 
        statusFilter === "active" ? !isSuspendedStatus(user.status) : isSuspendedStatus(user.status);

      const matchesPostTest =
        postTestRowFilter === "all" ? true :
        postTestRowFilter === "completed" ? user.hasCompletedPostTest === true :
        user.hasCompletedPostTest !== true;
        
      return matchesSearch && matchesRole && matchesStatus && matchesPostTest;
    });
  }, [users, searchTerm, roleFilter, statusFilter, postTestRowFilter]);

  // Modal Handlers
  const showModal = (config) => {
    setModalInputValue("");
    setModalConfig({ ...modalConfig, isOpen: true, ...config });
  };

  const closeModal = () => {
    setModalConfig((prev) => ({ ...prev, isOpen: false }));
    setModalInputValue("");
  };

  const handleModalConfirm = () => {
    if (modalConfig.onConfirm) {
      modalConfig.onConfirm(modalConfig.type === 'prompt' ? modalInputValue : null);
    }
    closeModal();
  };

  // Action Handlers
  const handleStatusToggle = (email, currentStatus) => {
    if (currentUser.email && email === currentUser.email) {
      showModal({
        type: "alert",
        title: "Security Restriction",
        message: "You cannot modify your own administrative account status."
      });
      return;
    }

    // BUGFIX: this used to check `currentStatus === "Active"` (capital A),
    // but every real account's status comes from Postgres as lowercase
    // "active" (see database.py's column default and signup's insert). That
    // mismatch meant this always fell into the "else" branch and recomputed
    // "Active" instead of "Suspended" -- so clicking "suspend" on a normal
    // account silently did nothing. Keying off "is currently Suspended"
    // (which the status badge below already does correctly) fixes it
    // regardless of whatever casing "active" happens to be stored as.
    const isCurrentlySuspended = isSuspendedStatus(currentStatus);
    const newStatus = isCurrentlySuspended ? "active" : "suspended";
    
    showModal({
      type: "confirm",
      title: "Confirm Status Change",
      message: `Are you sure you want to change this account's status to ${newStatus === "suspended" ? "Suspended" : "Active"}?`,
      isDanger: newStatus === "suspended",
      onConfirm: async () => {
        try {
          const token = getAuthToken();
          const response = await fetch(`${API_BASE}/api/admin/users/${encodeURIComponent(email)}/status`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ status: newStatus })
          });

          const data = await response.json();
          if (!response.ok) throw new Error(getErrorMessage(data, "Failed to update status"));

          setUsers(users.map(u => 
            u.email === email ? { ...u, status: newStatus } : u
          ));

          setTimeout(() => {
            showModal({
              type: "alert",
              title: newStatus === "suspended" ? "Account Suspended" : "Suspension Reverted",
              message: newStatus === "suspended"
                ? `${email}'s account has been suspended. They will no longer be able to sign in.`
                : `${email}'s account access has been restored. They can sign in normally again.`
            });
          }, 300);
        } catch (err) {
          setTimeout(() => {
            showModal({
              type: "alert",
              title: "Error",
              message: err.message
            });
          }, 300);
        }
      }
    });
  };

  const handleManualVerify = (email) => {
    // Manually marks an account verified, bypassing the email-link flow.
    // A manual override for accounts whose verification email never
    // arrived (spam filtering, typo'd address, etc).
    showModal({
      type: "confirm",
      title: "Manually Verify Account",
      message: `Mark ${email} as verified without them clicking an email link? Use this if their verification email never arrived.`,
      isDanger: false,
      onConfirm: async () => {
        try {
          const token = getAuthToken();
          const response = await fetch(`${API_BASE}/api/admin/users/${encodeURIComponent(email)}/verify`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            }
          });

          const data = await response.json();
          if (!response.ok) throw new Error(getErrorMessage(data, "Failed to verify user"));

          setUsers(users.map(u =>
            u.email === email ? { ...u, isVerified: true } : u
          ));

          setTimeout(() => {
            showModal({
              type: "alert",
              title: "Account Verified",
              message: `${email} can now sign in normally.`
            });
          }, 300);
        } catch (err) {
          setTimeout(() => {
            showModal({
              type: "alert",
              title: "Error",
              message: err.message
            });
          }, 300);
        }
      }
    });
  };

  const handleApproveReset = (email) => {
    showModal({
      type: "confirm",
      title: "Grant Password Reset",
      message: `Approve ${email}'s request to reset their password? You'll get a one-time link to send them directly (chat, phone, in person) -- it expires in 30 minutes.`,
      isDanger: false,
      onConfirm: async () => {
        setProcessingResetEmails((prev) => new Set(prev).add(email));
        try {
          const token = getAuthToken();
          const response = await fetch(`${API_BASE}/api/admin/password-reset-requests/${encodeURIComponent(email)}/approve`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${token}` }
          });
          const data = await response.json();
          if (!response.ok) throw new Error(getErrorMessage(data, "Failed to approve reset request"));

          setResetRequests((prev) => prev.filter((r) => r.email !== email));

          try {
            await navigator.clipboard.writeText(data.reset_link);
          } catch (e) { /* clipboard may be unavailable; link is still shown below */ }

          setTimeout(() => {
            showModal({
              type: "alert",
              title: "Reset Link Ready (copied to clipboard)",
              message: `Send this link to ${email} -- it expires in 30 minutes:\n\n${data.reset_link}`
            });
          }, 300);
        } catch (err) {
          setTimeout(() => {
            showModal({ type: "alert", title: "Error", message: err.message });
          }, 300);
        } finally {
          setProcessingResetEmails((prev) => {
            const next = new Set(prev);
            next.delete(email);
            return next;
          });
        }
      }
    });
  };

  const handleDenyReset = (email) => {
    showModal({
      type: "confirm",
      title: "Dismiss Reset Request",
      message: `Dismiss ${email}'s password reset request without granting access? They can submit a new request later if needed.`,
      isDanger: true,
      onConfirm: async () => {
        setProcessingResetEmails((prev) => new Set(prev).add(email));
        try {
          const token = getAuthToken();
          const response = await fetch(`${API_BASE}/api/admin/password-reset-requests/${encodeURIComponent(email)}/deny`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${token}` }
          });
          const data = await response.json();
          if (!response.ok) throw new Error(getErrorMessage(data, "Failed to dismiss reset request"));
          setResetRequests((prev) => prev.filter((r) => r.email !== email));
        } catch (err) {
          setTimeout(() => {
            showModal({ type: "alert", title: "Error", message: err.message });
          }, 300);
        } finally {
          setProcessingResetEmails((prev) => {
            const next = new Set(prev);
            next.delete(email);
            return next;
          });
        }
      }
    });
  };

  const handleDelete = (email) => {
    if (currentUser.email && email === currentUser.email) {
      showModal({
        type: "alert",
        title: "Critical Security Boundary",
        message: "You cannot delete your own active administrator profile."
      });
      return;
    }

    showModal({
      type: "prompt",
      title: "Security Verification Required",
      message: `To permanently delete account (${email}), please re-enter your current Admin password:`,
      isPassword: true,
      isDanger: true,
      onConfirm: async (passwordPrompt) => {
        if (!passwordPrompt || !passwordPrompt.trim()) {
          setTimeout(() => {
            showModal({
              type: "alert",
              title: "Deletion Aborted",
              message: "Password cannot be blank."
            });
          }, 300); // slight delay to allow first modal to close cleanly
          return;
        }

        try {
          const token = getAuthToken();
          
          const verifyRes = await fetch(`${API_BASE}/api/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: currentUser.email, password: passwordPrompt })
          });
          
          const verifyData = await verifyRes.json();
          if (!verifyRes.ok || verifyData.status !== "success") {
            throw new Error("Incorrect administrator password. Deletion cancelled.");
          }

          const response = await fetch(`${API_BASE}/api/admin/users/${encodeURIComponent(email)}`, {
            method: "DELETE",
            headers: {
              "Authorization": `Bearer ${token}`
            }
          });

          const data = await response.json();
          if (!response.ok) throw new Error(getErrorMessage(data, "Failed to delete user"));

          setUsers(users.filter(u => u.email !== email));
          setTimeout(() => {
            showModal({
              type: "alert",
              title: "Success",
              message: "User account successfully purged from the system."
            });
          }, 300);
          
        } catch (err) {
          setTimeout(() => {
            showModal({
              type: "alert",
              title: "Authorization Error",
              message: err.message
            });
          }, 300);
        }
      }
    });
  };

  return (
    <div className="admin-page-wrapper">
      <DashboardHeader backTo="/dashboard" backText="Back to Dashboard" tour={adminTour} tourPageId="admin-users" />
      
      <div className="admin-page-container">
        
        <div className="admin-header">
          <div className="admin-header-left">
            <h1><LuUsers size={38} color="#5A1398" /> System User Management</h1>
            <p>Monitor, filter, and securely manage all registered student and administrator accounts across the AlgoBlocks platform.</p>
          </div>
          <button onClick={fetchUsers} className="admin-refresh-btn">
            <LuRefreshCw size={20} /> Sync Directory
          </button>
        </div>

        <div className="admin-analytics-dashboard">
          <div className="analytics-dashboard-header">
            <div>
              <h2><LuMailWarning size={22} /> Pending Password Reset Requests</h2>
              <div className="analytics-scope-indicator">
                <LuUsers size={14} />
                {resetRequestsLoading
                  ? "Checking..."
                  : `${resetRequests.length} pending request${resetRequests.length === 1 ? "" : "s"} -- normal forgot-password requests now email the user directly; this is a manual override for stuck accounts`}
              </div>
            </div>
            <div className="analytics-dashboard-actions">
              <button onClick={fetchResetRequests} className="admin-refresh-btn small">
                <LuRefreshCw size={16} /> Refresh
              </button>
            </div>
          </div>

          {resetRequestsLoading ? (
            <div className="admin-loading-state compact">
              <LuRefreshCw size={28} className="spinner-icon" style={{ animation: 'spin 2s linear infinite' }} />
              <span>Loading pending requests...</span>
            </div>
          ) : resetRequestsError ? (
            <div className="admin-message-box error">
              <LuBan size={24} />
              <span>{resetRequestsError}</span>
            </div>
          ) : resetRequests.length === 0 ? (
            <div className="analytics-empty-note">No pending password reset requests right now.</div>
          ) : (
            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Requested</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {resetRequests.map((r, rIdx) => {
                    const isProcessing = processingResetEmails.has(r.email);
                    return (
                      <tr key={r.email || r._id || `reset-${rIdx}`}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{r.name || r.email}</div>
                          <div style={{ fontSize: "0.85rem", color: "#94a3b8" }}>{r.email}</div>
                        </td>
                        <td>{r.reset_requested_at ? new Date(r.reset_requested_at).toLocaleString() : "--"}</td>
                        <td>
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button
                              className="admin-refresh-btn small"
                              disabled={isProcessing}
                              onClick={() => handleApproveReset(r.email)}
                            >
                              <LuCheck size={16} /> Approve
                            </button>
                            <button
                              className="admin-refresh-btn small outline"
                              disabled={isProcessing}
                              onClick={() => handleDenyReset(r.email)}
                            >
                              <LuX size={16} /> Deny
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="admin-analytics-dashboard">
          <div className="analytics-dashboard-header">
            <div>
              <h2><LuChartBar size={22} /> Overall Learning Impact</h2>
              <div className="analytics-scope-indicator">
                {selectedRespondents.length > 0 ? (
                  <>
                    <LuUserCheck size={14} />
                    Scoped to {selectedRespondents.length} selected respondent{selectedRespondents.length === 1 ? "" : "s"}
                    <button className="analytics-scope-reset" onClick={resetToAllRespondents}>Reset to all</button>
                  </>
                ) : (
                  <>
                    <LuUsers size={14} />
                    All standard users{overview ? ` (n=${overview.total_standard_users})` : ""} &middot; admin accounts excluded
                  </>
                )}
                {postTestOnly && (
                  <>
                    <span className="analytics-scope-divider">&middot;</span>
                    <LuFlaskConical size={14} />
                    Post-test completers only{overview?.post_test_completers != null ? ` (${overview.post_test_completers})` : ""}
                  </>
                )}
              </div>
            </div>
            <div className="analytics-dashboard-actions">
              <label className="admin-checkbox-toggle" title="Only process accounts that have finished (recorded a score for) the post-test">
                <input
                  type="checkbox"
                  checked={postTestOnly}
                  onChange={togglePostTestOnly}
                />
                <LuFilter size={14} /> Post-test completers only
              </label>
              <button onClick={openRespondentPicker} className="admin-refresh-btn small outline">
                <LuListChecks size={16} /> Select Respondents
              </button>
              <button onClick={() => fetchOverview(selectedRespondents.length > 0 ? selectedRespondents : undefined)} className="admin-refresh-btn small">
                <LuRefreshCw size={16} /> Refresh
              </button>
            </div>
          </div>

          {overviewLoading ? (
            <div className="admin-loading-state compact">
              <LuRefreshCw size={28} className="spinner-icon" style={{ animation: 'spin 2s linear infinite' }} />
              <span>Computing learning analytics...</span>
            </div>
          ) : overviewError ? (
            <div className="admin-message-box error">
              <LuBan size={24} />
              <span>{overviewError}</span>
            </div>
          ) : overview ? (
            <>
              <div className="analytics-section-label">System-Generated Learning Performance (standard users only, all activities)</div>
              <div className="analytics-card-grid">
                <div className="analytics-card">
                  <div className="analytics-card-icon tsr"><LuActivity size={20} /></div>
                  <div className="analytics-card-body">
                    <span className="analytics-card-value">{overview.system_generated.tsr !== null ? `${overview.system_generated.tsr}%` : "--"}</span>
                    <span className="analytics-card-label">
                      <MetricTooltip
                        title="Average Task Success Rate (Mean TSR)"
                        meanFormula="Mean TSR = (1 / M) × Σ [ TSR_k ] × 100%"
                        baseFormula="where TSR_k = (Passed Test Cases / Total Test Cases) for activity k"
                        desc="Calculated by computing the test pass rate for every individual activity submission, summing them across all M submissions completed by standard students, and dividing by total submissions M."
                      >
                        Avg Task Success Rate (TSR)
                      </MetricTooltip>
                    </span>
                  </div>
                </div>
                <div className="analytics-card">
                  <div className="analytics-card-icon aes"><LuTarget size={20} /></div>
                  <div className="analytics-card-body">
                    <span className="analytics-card-value">{overview.system_generated.aes !== null ? `${overview.system_generated.aes}%` : "--"}</span>
                    <span className="analytics-card-label">
                      <MetricTooltip
                        title="Average Algorithmic Efficiency Score (Mean AES)"
                        meanFormula="Mean AES = (1 / M) × Σ [ AES_k ]"
                        baseFormula="where AES_k = ⌊(TSR_k × Efficiency_k) × 100⌋"
                        desc="Calculated by averaging all activity AES scores across all M submissions. Efficiency = [min(W_target/W_actual, 1.0) for Time & Space] / 2 using 1-9 Asymptotic Weights."
                      >
                        Avg Algorithmic Efficiency Score (AES)
                      </MetricTooltip>
                    </span>
                  </div>
                </div>
                <div className="analytics-card">
                  <div className="analytics-card-icon rog"><LuTrendingUp size={20} /></div>
                  <div className="analytics-card-body">
                    <span className="analytics-card-value">{overview.system_generated.rog !== null ? `+${overview.system_generated.rog}` : "--"}</span>
                    <span className="analytics-card-label">
                      <MetricTooltip
                        title="Average Refactoring Optimization Gain (Mean ROG)"
                        meanFormula="Mean ROG = (1 / M) × Σ [ AES_final,k - AES_baseline,k ]"
                        baseFormula="where ROG_k = AES_final,k - AES_baseline,k for activity k"
                        desc="Calculated by computing the score improvement from initial baseline attempt to final refactored solution for each activity, summed across all M submissions and divided by total submissions M."
                      >
                        Avg Refactoring Optimization Gain (ROG)
                      </MetricTooltip>
                    </span>
                  </div>
                </div>
                <div className="analytics-card">
                  <div className="analytics-card-icon count"><LuUsers size={20} /></div>
                  <div className="analytics-card-body">
                    <span className="analytics-card-value">{overview.user_count}</span>
                    <span className="analytics-card-label">
                      <MetricTooltip
                        title="Total Respondents (Standard Users)"
                        meanFormula="N = Count(Unique Standard Student Users)"
                        baseFormula="Filter criteria: non-admin student accounts"
                        desc="Total number of registered standard student accounts whose submission histories are aggregated into this learning impact overview."
                      >
                        Respondents Included{overview.is_filtered ? " (Selected)" : ""}
                      </MetricTooltip>
                    </span>
                  </div>
                </div>
              </div>

              <div className="analytics-section-label">Assessment-Based Learning Measures (paired pre-test / post-test, n = {overview.paired_test_takers})</div>
              {overview.paired_test_takers === 0 ? (
                <div className="analytics-empty-note">No users have completed both the pre-test and post-test yet, so no paired statistics are available.</div>
              ) : (
                <div className="analytics-card-grid">
                  <div className="analytics-card">
                    <div className="analytics-card-icon mean"><LuAward size={20} /></div>
                    <div className="analytics-card-body">
                      <span className="analytics-card-value">{overview.assessment_based.mean_pretest}% &rarr; {overview.assessment_based.mean_posttest}%</span>
                      <span className="analytics-card-label">
                        <MetricTooltip
                          title="Mean Pre-test → Post-test Diagnostic Scores"
                          meanFormula="Mean Score (x̄) = (1 / n) × Σ [ Score_i ]"
                          baseFormula="where Score_i = (Correct Answers / Total Questions) × 100%"
                          desc="Calculated as the arithmetic mean score on the initial diagnostic pre-test compared against the comprehensive post-test for all n paired completers."
                        >
                          Mean Pre-test &rarr; Post-test
                        </MetricTooltip>
                      </span>
                    </div>
                  </div>
                  <div className="analytics-card">
                    <div className="analytics-card-icon sd"><LuChartBar size={20} /></div>
                    <div className="analytics-card-body">
                      <span className="analytics-card-value">SD {overview.assessment_based.sd_pretest} / {overview.assessment_based.sd_posttest}</span>
                      <span className="analytics-card-label">
                        <MetricTooltip
                          title="Standard Deviation (Pre / Post SD)"
                          meanFormula="SD = √ [ (1 / (n - 1)) × Σ (X_i - x̄)² ]"
                          baseFormula="where X_i = student test score, x̄ = group mean score"
                          desc="Calculated separately for pre-test and post-test to quantify the variance and dispersion of individual student scores around the group mean."
                        >
                          Standard Deviation (Pre / Post)
                        </MetricTooltip>
                      </span>
                    </div>
                  </div>
                  <div className="analytics-card">
                    <div className="analytics-card-icon ttest"><LuFlaskConical size={20} /></div>
                    <div className="analytics-card-body">
                      <span className="analytics-card-value">
                        t = {overview.assessment_based.t_value ?? "--"} (df = {overview.assessment_based.degrees_of_freedom ?? "--"})
                      </span>
                      <span className="analytics-card-label">
                        <MetricTooltip
                          title="Paired Samples t-Test"
                          meanFormula="t = d̄ / ( S_d / √n )"
                          baseFormula="where d̄ = (1/n) Σ (Post_i - Pre_i), S_d = SD of differences"
                          desc="Tests whether the mean difference between students' paired pre-test and post-test scores is statistically significant at α = 0.05 (df = n - 1)."
                        >
                          Paired Samples t-Test
                          {overview.assessment_based.p_value !== null && (
                            <> &middot; p = {overview.assessment_based.p_value} &middot; {overview.assessment_based.significant_at_0_05 ? "Significant (α=.05)" : "Not significant (α=.05)"}</>
                          )}
                        </MetricTooltip>
                      </span>
                    </div>
                  </div>
                  <div className="analytics-card">
                    <div className="analytics-card-icon cohend"><LuTarget size={20} /></div>
                    <div className="analytics-card-body">
                      <span className="analytics-card-value">d = {overview.assessment_based.cohens_d ?? "--"}</span>
                      <span className="analytics-card-label">
                        <MetricTooltip
                          title="Cohen's d Effect Size"
                          meanFormula="d = d̄ / S_d"
                          baseFormula="where d̄ = Mean Difference, S_d = Standard Deviation of Differences"
                          desc="Quantifies the standardized magnitude of the learning gain: 0.20 = Small Effect, 0.50 = Medium Effect, 0.80+ = Large Effect."
                        >
                          Cohen's d &middot; {overview.assessment_based.cohens_d_interpretation || "--"}
                        </MetricTooltip>
                      </span>
                    </div>
                  </div>
                  <div className="analytics-card">
                    <div className="analytics-card-icon hakesg"><LuTrendingUp size={20} /></div>
                    <div className="analytics-card-body">
                      <span className="analytics-card-value">g = {overview.assessment_based.hakes_g ?? "--"}</span>
                      <span className="analytics-card-label">
                        <MetricTooltip
                          title="Hake's Normalized Learning Gain (g)"
                          meanFormula="g = (Mean Post% - Mean Pre%) / (100% - Mean Pre%)"
                          baseFormula="where 100% = Maximum possible assessment score"
                          desc="Measures the fraction of maximum possible learning gain realized by students: g < 0.30 (Low Gain), 0.30 ≤ g < 0.70 (Medium Gain), g ≥ 0.70 (High Gain)."
                        >
                          Hake's Normalized Gain &middot; {overview.assessment_based.hakes_g_interpretation || "--"}
                        </MetricTooltip>
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>

        <div className="admin-toolbar">
          <div className="admin-search-wrapper">
            <LuSearch className="admin-search-icon" size={20} />
            <input 
              type="text" 
              placeholder="Search directory by name or email address..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="admin-search-input"
            />
          </div>

          <div className="admin-filter-container">
            <LuFilter size={20} color="#5b5675" />
            <select 
              value={roleFilter} 
              onChange={(e) => setRoleFilter(e.target.value)}
              className="admin-filter-select"
            >
              <option value="all">View All Roles</option>
              <option value="admin">Administrators Only</option>
              <option value="user">Standard Users Only</option>
            </select>

            <select 
              value={statusFilter} 
              onChange={(e) => setStatusFilter(e.target.value)}
              className="admin-filter-select"
            >
              <option value="all">View All Statuses</option>
              <option value="active">Active Accounts</option>
              <option value="suspended">Suspended Accounts</option>
            </select>

            <select
              value={postTestRowFilter}
              onChange={(e) => setPostTestRowFilter(e.target.value)}
              className="admin-filter-select"
              title="Filter by whether the account has a recorded post-test score"
            >
              <option value="all">View All (Post-Test)</option>
              <option value="completed">Post-Test Completed</option>
              <option value="not_completed">Post-Test Not Completed</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="admin-message-box error">
            <LuBan size={24} />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="admin-loading-state">
            <LuRefreshCw size={48} className="spinner-icon" style={{ animation: 'spin 2s linear infinite' }} />
            <span>Fetching secure directory...</span>
          </div>
        ) : (
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Identity</th>
                  <th>System Role</th>
                  <th>Access Status</th>
                  <th className="th-metrics">Metrics</th>
                  <th className="th-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user, userIdx) => {
                  const isExpanded = expandedEmails.has(user.email);
                  const cached = userMetricsCache[user.email];
                  const isLoadingMetrics = loadingMetricsEmails.has(user.email);
                  const rowError = metricsError[user.email];
                  const isActivityExpanded = expandedActivitySections.has(user.email);
                  const userModuleFilter = userActivityModuleFilters[user.email] || "all";

                  const userActivities = Array.isArray(cached?.activities) ? cached.activities : [];
                  const moduleMap = {};
                  userActivities.forEach((act) => {
                    const mod = act.moduleId || "Other";
                    if (!moduleMap[mod]) moduleMap[mod] = { count: 0, passed: 0 };
                    moduleMap[mod].count += 1;
                    if (act.status === "passed") moduleMap[mod].passed += 1;
                  });

                  const moduleOptions = Object.keys(moduleMap).sort().map((modId) => {
                    const rawNum = modId.replace(/[^0-9]/g, "");
                    const label = rawNum !== "" ? `Module ${rawNum}` : modId;
                    return {
                      id: modId,
                      label,
                      count: moduleMap[modId].count,
                      passed: moduleMap[modId].passed,
                    };
                  });

                  const filteredActivities = userModuleFilter === "all"
                    ? userActivities
                    : userActivities.filter((act) => (act.moduleId || "Other") === userModuleFilter);

                  return (
                  <Fragment key={user.email || user._id || `user-${userIdx}`}>
                  <tr>
                    <td>
                      <div className="admin-user-info">
                        <span className="admin-user-name">{user.name || "Unnamed Profile"}</span>
                        <span className="admin-user-email">{user.email}</span>
                        {!(user.isAdmin || user.role === "admin") && user.hasCompletedPostTest && (
                          <span className="admin-badge badge-active" style={{ marginTop: "4px", width: "fit-content", fontSize: "0.72rem", padding: "3px 10px" }}>
                            <LuAward size={13} /> Post-Test Completed
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      {user.isAdmin || user.role === "admin" ? (
                        <span className="admin-badge badge-admin">
                          <LuShield size={16} /> Administrator
                        </span>
                      ) : (
                        <span className="admin-badge badge-user">
                          <LuUser size={16} /> Student User
                        </span>
                      )}
                    </td>
                    <td>
                      {isSuspendedStatus(user.status) ? (
                        <span className="admin-badge badge-suspended">
                          <LuBan size={16} /> Suspended
                        </span>
                      ) : user.isVerified === false && !(user.isAdmin || user.role === "admin") ? (
                        <span className="admin-badge badge-suspended" title="Verification email may not have been delivered -- see the Verify action">
                          <LuMailWarning size={16} /> Unverified
                        </span>
                      ) : (
                        <span className="admin-badge badge-active">
                          <LuCheck size={16} /> Active Access
                        </span>
                      )}
                    </td>
                    <td className="td-metrics">
                      <button
                        onClick={() => toggleUserMetrics(user.email)}
                        className={`admin-metrics-toggle-btn ${isExpanded ? "expanded" : ""}`}
                        title="View this user's AES, ROG, TSR, and learning path metrics"
                      >
                        <LuChartBar size={16} /> View Metrics
                        {isExpanded ? <LuChevronUp size={16} /> : <LuChevronDown size={16} />}
                      </button>
                    </td>
                    <td className="td-actions">
                      <div className="admin-actions">
                        {user.isVerified === false && !(user.isAdmin || user.role === "admin") && (
                          <button
                            onClick={() => handleManualVerify(user.email)}
                            title="Manually verify this account (use if their verification email never arrived)"
                            className="admin-action-btn activate"
                          >
                            <LuMailWarning size={20} />
                          </button>
                        )}
                        <button 
                          onClick={() => handleStatusToggle(user.email, user.status)}
                          title={isSuspendedStatus(user.status) ? "Restore Account Access" : "Suspend Account Access"}
                          className={`admin-action-btn ${isSuspendedStatus(user.status) ? "activate" : "suspend"}`}
                        >
                          {isSuspendedStatus(user.status) ? <LuCheck size={20} /> : <LuBan size={20} />}
                        </button>
                        <button 
                          onClick={() => handleDelete(user.email)}
                          title="Purge Account (Requires Admin Verification)"
                          className="admin-action-btn delete"
                        >
                          <LuTrash2 size={20} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="admin-metrics-row">
                      <td colSpan="5">
                        <div className="admin-metrics-panel">
                          {isLoadingMetrics ? (
                            <div className="admin-metrics-loading">
                              <LuRefreshCw size={18} className="spinner-icon" style={{ animation: 'spin 2s linear infinite' }} />
                              <span>Loading this user's metrics...</span>
                            </div>
                          ) : rowError ? (
                            <div className="admin-message-box error compact">
                              <LuBan size={18} />
                              <span>{rowError}</span>
                            </div>
                          ) : cached ? (
                            <>
                            <div className="admin-user-current-status">
                              <div>
                                <span className="metric-pill-label">Current account status</span>
                                <strong className={isSuspendedStatus(user.status) ? "status-text suspended" : "status-text active"}>
                                  {isSuspendedStatus(user.status) ? "Suspended" : "Active"}
                                </strong>
                              </div>
                              <span>{user.isVerified ? "Email verified" : "Email unverified"}</span>
                              <span>{cached.account?.role === "admin" ? "Administrator" : "Student account"}</span>
                              <span>Last recorded activity: {cached.activities?.[0]?.timestamp ? new Date(cached.activities[0].timestamp).toLocaleString() : "No activity yet"}</span>
                            </div>
                            <div className="admin-metrics-grid">
                              <div className="admin-metric-pill">
                                <span className="metric-pill-label">
                                  <MetricTooltip
                                    title="User Task Success Rate (TSR)"
                                    formula="TSR = (Passed Test Cases / Total Test Cases) × 100%"
                                    desc="Average functional correctness across all activities attempted by this student."
                                  >
                                    TSR
                                  </MetricTooltip>
                                </span>
                                <span className="metric-pill-value">{cached.metrics.tsr !== null ? `${cached.metrics.tsr}%` : "No data"}</span>
                              </div>
                              <div className="admin-metric-pill">
                                <span className="metric-pill-label">
                                  <MetricTooltip
                                    title="User Algorithmic Efficiency Score (AES)"
                                    formula="AES = ⌊(TSR × Efficiency) × 100⌋"
                                    desc="Multiplicative score grading correctness and target Big-O time and space complexity conformance."
                                  >
                                    AES
                                  </MetricTooltip>
                                </span>
                                <span className="metric-pill-value">{cached.metrics.aes !== null ? `${cached.metrics.aes}%` : "No data"}</span>
                              </div>
                              <div className="admin-metric-pill">
                                <span className="metric-pill-label">
                                  <MetricTooltip
                                    title="User Refactoring Optimization Gain (ROG)"
                                    formula="ROG = AES_final - AES_baseline"
                                    desc="Average efficiency score improvement gained by this student through code refactoring."
                                  >
                                    ROG
                                  </MetricTooltip>
                                </span>
                                <span className="metric-pill-value">{cached.metrics.rog !== null ? `+${cached.metrics.rog}` : "No data"}</span>
                              </div>
                              <div className="admin-metric-pill">
                                <span className="metric-pill-label">
                                  <MetricTooltip
                                    title="Activities Completion"
                                    formula="Passed Activities / Attempted Activities"
                                    desc="Number of activities cleared (AES ≥ 50% or status = passed) out of total attempted."
                                  >
                                    Activities
                                  </MetricTooltip>
                                </span>
                                <span className="metric-pill-value">{cached.metrics.activities_passed} / {cached.metrics.activities_attempted} passed</span>
                              </div>
                              <div className="admin-metric-pill">
                                <span className="metric-pill-label">
                                  <MetricTooltip
                                    title="Course Pre-Test Score"
                                    formula="(Correct Answers / Total Questions) × 100%"
                                    desc="Diagnostic baseline score achieved prior to starting learning modules."
                                  >
                                    Pre-Test
                                  </MetricTooltip>
                                </span>
                                <span className="metric-pill-value">{cached.milestones.preTest !== null ? `${Math.round(cached.milestones.preTest)}%` : "Not taken"}</span>
                              </div>
                              <div className="admin-metric-pill">
                                <span className="metric-pill-label">
                                  <MetricTooltip
                                    title="Course Post-Test Score"
                                    formula="(Correct Answers / Total Questions) × 100%"
                                    desc="Summative diagnostic score achieved after completing course modules."
                                  >
                                    Post-Test
                                  </MetricTooltip>
                                </span>
                                <span className="metric-pill-value">{cached.milestones.postTest !== null ? `${Math.round(cached.milestones.postTest)}%` : "Not taken"}</span>
                              </div>
                              <div className="admin-metric-pill">
                                <span className="metric-pill-label">
                                  <MetricTooltip
                                    title="Curriculum Progress Entries"
                                    formula="Count(Completed Milestones)"
                                    desc="Total number of lessons, quizzes, and diagnostic assessments recorded as completed."
                                  >
                                    Progress Entries
                                  </MetricTooltip>
                                </span>
                                <span className="metric-pill-value">{cached.metrics.progress_entries}</span>
                              </div>
                              <div className="admin-metric-pill">
                                <span className="metric-pill-label">
                                  <MetricTooltip
                                    title="Functional Test Cases"
                                    formula="Passed Functional Tests / Total Functional Tests"
                                    desc="Total individual unit test assertions cleared across all activity submissions."
                                  >
                                    Functional Tests
                                  </MetricTooltip>
                                </span>
                                <span className="metric-pill-value">{cached.metrics.functional_tests?.passed || 0} / {cached.metrics.functional_tests?.total || 0}</span>
                              </div>
                              <div className="admin-metric-pill">
                                <span className="metric-pill-label">
                                  <MetricTooltip
                                    title="Complexity Checks"
                                    formula="Passed Complexity Tests / Total Complexity Tests"
                                    desc="Static code analysis assertions verifying compliance with optimal time and space Big-O targets."
                                  >
                                    Complexity Checks
                                  </MetricTooltip>
                                </span>
                                <span className="metric-pill-value">{cached.metrics.complexity_tests?.passed || 0} / {cached.metrics.complexity_tests?.total || 0}</span>
                              </div>
                              <div className="admin-metric-pill">
                                <span className="metric-pill-label">
                                  <MetricTooltip
                                    title="Hidden Test Cases"
                                    formula="Passed Hidden Tests / Total Hidden Tests"
                                    desc="Randomized edge-case unit tests validating algorithmic robustness and generalization."
                                  >
                                    Hidden Tests
                                  </MetricTooltip>
                                </span>
                                <span className="metric-pill-value">{cached.metrics.hidden_tests?.passed || 0} / {cached.metrics.hidden_tests?.total || 0}</span>
                              </div>
                            </div>
                            <div className="admin-activity-history">
                              <button
                                type="button"
                                className={`admin-activity-dropdown-toggle ${isActivityExpanded ? "open" : ""}`}
                                onClick={() => toggleActivitySection(user.email)}
                                aria-expanded={isActivityExpanded}
                              >
                                <div className="admin-activity-toggle-left">
                                  <LuListChecks size={18} className="admin-activity-toggle-icon" />
                                  <span className="admin-activity-toggle-title">Activity Records</span>
                                  <span className="admin-activity-count-badge">
                                    {userActivities.length} total
                                  </span>
                                  {cached.metrics?.activities_passed !== undefined && (
                                    <span className="admin-activity-passed-badge">
                                      {cached.metrics.activities_passed} / {cached.metrics.activities_attempted || userActivities.length} passed
                                    </span>
                                  )}
                                </div>
                                <div className="admin-activity-toggle-right">
                                  <span className="admin-activity-toggle-hint">
                                    {isActivityExpanded ? "Collapse records" : "Expand records dropdown"}
                                  </span>
                                  {isActivityExpanded ? <LuChevronUp size={18} /> : <LuChevronDown size={18} />}
                                </div>
                              </button>

                              {isActivityExpanded && (
                                <div className="admin-activity-dropdown-body">
                                  {userActivities.length > 0 ? (
                                    <>
                                      <div className="admin-activity-filter-bar">
                                        <div className="admin-activity-filter-group">
                                          <label htmlFor={`module-filter-${user.email}`}>
                                            <LuFilter size={14} /> Filter by Module:
                                          </label>
                                          <select
                                            id={`module-filter-${user.email}`}
                                            value={userModuleFilter}
                                            onChange={(e) => setModuleFilterForUser(user.email, e.target.value)}
                                            className="admin-activity-module-select"
                                          >
                                            <option value="all">All Modules ({userActivities.length})</option>
                                            {moduleOptions.map((mod) => (
                                              <option key={mod.id} value={mod.id}>
                                                {mod.label} ({mod.count} activities · {mod.passed} passed)
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                        <div className="admin-activity-filter-stats">
                                          Showing <strong>{filteredActivities.length}</strong> of {userActivities.length} activities
                                        </div>
                                      </div>

                                      <div className="admin-activity-table-wrap">
                                        <table className="admin-activity-table">
                                          <thead>
                                            <tr>
                                              <th>Activity</th>
                                              <th>Module</th>
                                              <th>Status</th>
                                              <th>AES</th>
                                              <th>ROG</th>
                                              <th>Time</th>
                                              <th>Space</th>
                                              <th>Tests</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {filteredActivities.map((activity, actIdx) => (
                                              <tr key={activity._id || activity.id || `${activity.moduleId || "mod"}-${activity.activityId || "act"}-${activity.timestamp || ""}-${actIdx}`}>
                                                <td>
                                                  <strong>{activity.activityId || "Unknown activity"}</strong>
                                                </td>
                                                <td>
                                                  <span className="admin-module-chip">{activity.moduleId || "--"}</span>
                                                </td>
                                                <td>
                                                  <span className={`activity-status ${activity.status === "passed" ? "passed" : activity.status === "failed" ? "failed" : "draft"}`}>
                                                    {activity.status}
                                                  </span>
                                                </td>
                                                <td>{activity.aes !== null && activity.aes !== undefined ? `${activity.aes}%` : "--"}</td>
                                                <td>+{activity.rog ?? 0}</td>
                                                <td><code className="admin-complexity-code">{activity.time || "--"}</code></td>
                                                <td><code className="admin-complexity-code">{activity.space || "--"}</code></td>
                                                <td>{activity.tests?.passed || 0}/{activity.tests?.total || 0}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </>
                                  ) : (
                                    <div className="admin-activity-empty">No activity submissions recorded yet.</div>
                                  )}
                                </div>
                              )}
                            </div>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                  );
                })}
                {filteredUsers.length === 0 && !loading && (
                  <tr>
                    <td colSpan="5">
                      <div className="admin-empty-state">
                        No accounts match your current search and filter criteria.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CUSTOM ADMIN MODAL OVERLAY */}
      {modalConfig.isOpen && (
        <div className="admin-modal-overlay" onClick={(e) => {
           if(e.target.className === 'admin-modal-overlay') closeModal();
        }}>
          <div className="admin-modal-card">
            <div className={`admin-modal-header ${modalConfig.isDanger ? 'danger' : ''}`}>
              <div className="admin-modal-title">
                {modalConfig.isDanger ? <LuTriangleAlert size={22} /> : <LuShield size={22} />}
                <h3>{modalConfig.title}</h3>
              </div>
              <button className="admin-modal-close" onClick={closeModal}>
                <LuX size={20} />
              </button>
            </div>
            
            <div className="admin-modal-body">
              <p>{modalConfig.message}</p>
              {modalConfig.type === 'prompt' && (
                <div className="admin-modal-input-wrapper">
                  <input
                    type={modalConfig.isPassword ? "password" : "text"}
                    value={modalInputValue}
                    onChange={(e) => setModalInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleModalConfirm();
                    }}
                    className="admin-modal-prompt-input"
                    placeholder="Enter required credentials..."
                    autoFocus
                  />
                </div>
              )}
            </div>

            <div className="admin-modal-footer">
              {modalConfig.type !== 'alert' && (
                <button className="admin-btn-cancel" onClick={closeModal}>
                  Cancel
                </button>
              )}
              <button
                className={`admin-btn-confirm ${modalConfig.isDanger ? 'danger' : ''}`}
                onClick={handleModalConfirm}
              >
                {modalConfig.type === 'alert' ? 'Acknowledge' : 'Confirm Action'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESPONDENT SELECTION MODAL (scope the Overall Learning Impact dashboard) */}
      {isSelectingRespondents && (
        <div className="admin-modal-overlay" onClick={(e) => {
          if (e.target.className === 'admin-modal-overlay') setIsSelectingRespondents(false);
        }}>
          <div className="admin-modal-card respondent-picker-card">
            <div className="admin-modal-header">
              <div className="admin-modal-title">
                <LuListChecks size={22} />
                <h3>Select Respondents</h3>
              </div>
              <button className="admin-modal-close" onClick={() => setIsSelectingRespondents(false)}>
                <LuX size={20} />
              </button>
            </div>

            <div className="admin-modal-body">
              <p>Choose which standard-user accounts count toward the Overall Learning Impact dashboard. Administrator accounts are never included.</p>

              {postTestOnly && (
                <div className="respondent-picker-scope-note">
                  <LuFlaskConical size={14} /> Showing post-test completers only ({respondentPickerUsers.length} of {standardUsers.length} standard users) &mdash; uncheck the toggle to pick from everyone.
                </div>
              )}

              <div className="respondent-picker-toolbar">
                <button className="respondent-picker-link" onClick={() => setPendingRespondents(respondentPickerUsers.map(u => u.email))}>Select All</button>
                <span className="respondent-picker-divider">&middot;</span>
                <button className="respondent-picker-link" onClick={() => setPendingRespondents([])}>Clear All</button>
                <span className="respondent-picker-count">{pendingRespondents.length} / {respondentPickerUsers.length} selected</span>
              </div>

              <div className="respondent-picker-list">
                {respondentPickerUsers.length === 0 ? (
                  <div className="admin-empty-state">
                    {postTestOnly ? "No standard-user accounts have a recorded post-test score yet." : "No standard-user accounts found."}
                  </div>
                ) : (
                  respondentPickerUsers.map((u, uIdx) => (
                    <label key={u.email || u._id || `resp-${uIdx}`} className="respondent-picker-item">
                      <input
                        type="checkbox"
                        checked={pendingRespondents.includes(u.email)}
                        onChange={() => toggleRespondent(u.email)}
                      />
                      <span className="respondent-picker-name">{u.name || "Unnamed Profile"}</span>
                      <span className="respondent-picker-email">{u.email}</span>
                    </label>
                  ))
                )}
              </div>
            </div>

            <div className="admin-modal-footer">
              <button className="admin-btn-cancel" onClick={() => setIsSelectingRespondents(false)}>
                Cancel
              </button>
              <button className="admin-btn-confirm" onClick={applyRespondentSelection}>
                Apply Selection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUserManagement;