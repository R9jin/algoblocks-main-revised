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

  // Cohort-wide analytics dashboard state
  const [overview, setOverview] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState(null);

  // Respondent selection state (for scoping "Overall Learning Impact" to
  // specific accounts during a live data-gathering session)
  const [isSelectingRespondents, setIsSelectingRespondents] = useState(false);
  const [selectedRespondents, setSelectedRespondents] = useState([]); // emails currently applied to the dashboard
  const [pendingRespondents, setPendingRespondents] = useState([]); // emails checked in the picker, not yet applied

  // Read-only log of accounts that have recently used forgot-password, for
  // the Admin > User Management notifications panel. Purely informational:
  // forgot-password already emails the reset link straight to the user
  // (see auth_service.forgot_password), so there's nothing here for an
  // admin to approve -- dismissing an entry just clears the notification.
  const [resetNotifications, setResetNotifications] = useState([]);
  const [resetNotificationsLoading, setResetNotificationsLoading] = useState(true);
  const [resetNotificationsError, setResetNotificationsError] = useState(null);
  const [dismissingResetEmails, setDismissingResetEmails] = useState(() => new Set());

  // Tracks which per-row action (verify / suspend-activate / delete) is
  // currently in flight for which user, so the triggering button can show
  // a spinner instead of just sitting there until the confirmation modal
  // pops up out of nowhere once the request finally resolves. Keyed as
  // "email|action" so a user can have at most one of each action pending
  // at a time, independent of any other row.
  const [pendingRowActions, setPendingRowActions] = useState(() => new Set());
  const rowActionKey = (email, action) => `${email}|${action}`;
  const isRowActionPending = (email, action) => pendingRowActions.has(rowActionKey(email, action));
  const setRowActionPending = (email, action, pending) => {
    setPendingRowActions((prev) => {
      const next = new Set(prev);
      const key = rowActionKey(email, action);
      if (pending) next.add(key); else next.delete(key);
      return next;
    });
  };

  const standardUsers = useMemo(
    () => (Array.isArray(users) ? users.filter(u => !(u.isAdmin || u.role === "admin")) : []),
    [users]
  );

  const openRespondentPicker = () => {
    setPendingRespondents(selectedRespondents.length > 0 ? selectedRespondents : standardUsers.map(u => u.email));
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
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchResetNotifications = async () => {
    setResetNotificationsLoading(true);
    setResetNotificationsError(null);
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE}/api/admin/password-reset-notifications`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(data, "Failed to fetch password reset notifications"));
      setResetNotifications(Array.isArray(data.requests) ? data.requests : []);
    } catch (err) {
      setResetNotificationsError(err.message);
    } finally {
      setResetNotificationsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchOverview();
    fetchResetNotifications();
  }, []);

  const fetchOverview = async (emailsOverride) => {
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      const token = getAuthToken();
      const emailsParam = Array.isArray(emailsOverride) && emailsOverride.length > 0
        ? `?emails=${encodeURIComponent(emailsOverride.join(","))}`
        : "";
      const response = await fetch(`${API_BASE}/api/admin/analytics/overview${emailsParam}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(data, "Failed to fetch analytics overview"));
      setOverview(data);
    } catch (err) {
      setOverviewError(err.message);
    } finally {
      setOverviewLoading(false);
    }
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
        
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchTerm, roleFilter, statusFilter]);

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
        setRowActionPending(email, "status", true);
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
        } finally {
          setRowActionPending(email, "status", false);
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
        setRowActionPending(email, "verify", true);
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
        } finally {
          setRowActionPending(email, "verify", false);
        }
      }
    });
  };

  const handleDismissResetNotification = (email) => {
    showModal({
      type: "confirm",
      title: "Dismiss Notification",
      message: `Dismiss the password-reset notification for ${email}? The reset link was already emailed directly to them -- this just clears it from this list.`,
      isDanger: false,
      onConfirm: async () => {
        setDismissingResetEmails((prev) => new Set(prev).add(email));
        try {
          const token = getAuthToken();
          const response = await fetch(`${API_BASE}/api/admin/password-reset-notifications/${encodeURIComponent(email)}/dismiss`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${token}` }
          });
          const data = await response.json();
          if (!response.ok) throw new Error(getErrorMessage(data, "Failed to dismiss notification"));
          setResetNotifications((prev) => prev.filter((r) => r.email !== email));
        } catch (err) {
          setTimeout(() => {
            showModal({ type: "alert", title: "Error", message: err.message });
          }, 300);
        } finally {
          setDismissingResetEmails((prev) => {
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

        setRowActionPending(email, "delete", true);
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
        } finally {
          setRowActionPending(email, "delete", false);
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
              <h2><LuMailWarning size={22} /> Password Reset Notifications</h2>
              <div className="analytics-scope-indicator">
                <LuUsers size={14} />
                {resetNotificationsLoading
                  ? "Checking..."
                  : `${resetNotifications.length} recent notification${resetNotifications.length === 1 ? "" : "s"} -- informational only; the reset link is emailed straight to the user, no admin action needed`}
              </div>
            </div>
            <div className="analytics-dashboard-actions">
              <button onClick={fetchResetNotifications} className="admin-refresh-btn small">
                <LuRefreshCw size={16} /> Refresh
              </button>
            </div>
          </div>

          {resetNotificationsLoading ? (
            <div className="admin-loading-state compact">
              <LuRefreshCw size={28} className="spinner-icon" style={{ animation: 'spin 2s linear infinite' }} />
              <span>Loading notifications...</span>
            </div>
          ) : resetNotificationsError ? (
            <div className="admin-message-box error">
              <LuBan size={24} />
              <span>{resetNotificationsError}</span>
            </div>
          ) : resetNotifications.length === 0 ? (
            <div className="analytics-empty-note">No recent password reset requests.</div>
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
                  {resetNotifications.map((r) => {
                    const isDismissing = dismissingResetEmails.has(r.email);
                    return (
                      <tr key={r.email}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{r.name || r.email}</div>
                          <div style={{ fontSize: "0.85rem", color: "#94a3b8" }}>{r.email}</div>
                        </td>
                        <td>{r.reset_requested_at ? new Date(r.reset_requested_at).toLocaleString() : "--"}</td>
                        <td>
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button
                              className="admin-refresh-btn small outline"
                              disabled={isDismissing}
                              onClick={() => handleDismissResetNotification(r.email)}
                            >
                              {isDismissing ? (
                                <LuRefreshCw size={16} className="spinner-icon" style={{ animation: 'spin 2s linear infinite' }} />
                              ) : (
                                <LuX size={16} />
                              )}
                              {isDismissing ? "Dismissing..." : "Dismiss"}
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
              </div>
            </div>
            <div className="analytics-dashboard-actions">
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
              <span>Computing cohort analytics...</span>
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
                    <span className="analytics-card-label">Avg Task Success Rate (TSR)</span>
                  </div>
                </div>
                <div className="analytics-card">
                  <div className="analytics-card-icon aes"><LuTarget size={20} /></div>
                  <div className="analytics-card-body">
                    <span className="analytics-card-value">{overview.system_generated.aes !== null ? `${overview.system_generated.aes}%` : "--"}</span>
                    <span className="analytics-card-label">Avg Algorithmic Efficiency Score (AES)</span>
                  </div>
                </div>
                <div className="analytics-card">
                  <div className="analytics-card-icon rog"><LuTrendingUp size={20} /></div>
                  <div className="analytics-card-body">
                    <span className="analytics-card-value">{overview.system_generated.rog !== null ? `+${overview.system_generated.rog}` : "--"}</span>
                    <span className="analytics-card-label">Avg Refactoring Optimization Gain (ROG)</span>
                  </div>
                </div>
                <div className="analytics-card">
                  <div className="analytics-card-icon count"><LuUsers size={20} /></div>
                  <div className="analytics-card-body">
                    <span className="analytics-card-value">{overview.user_count}</span>
                    <span className="analytics-card-label">Respondents Included{overview.is_filtered ? " (Selected)" : ""}</span>
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
                      <span className="analytics-card-label">Mean Pre-test &rarr; Post-test</span>
                    </div>
                  </div>
                  <div className="analytics-card">
                    <div className="analytics-card-icon sd"><LuChartBar size={20} /></div>
                    <div className="analytics-card-body">
                      <span className="analytics-card-value">SD {overview.assessment_based.sd_pretest} / {overview.assessment_based.sd_posttest}</span>
                      <span className="analytics-card-label">Standard Deviation (Pre / Post)</span>
                    </div>
                  </div>
                  <div className="analytics-card">
                    <div className="analytics-card-icon ttest"><LuFlaskConical size={20} /></div>
                    <div className="analytics-card-body">
                      <span className="analytics-card-value">
                        t = {overview.assessment_based.t_value ?? "--"} (df = {overview.assessment_based.degrees_of_freedom ?? "--"})
                      </span>
                      <span className="analytics-card-label">
                        Paired Samples t-Test
                        {overview.assessment_based.p_value !== null && (
                          <> &middot; p = {overview.assessment_based.p_value} &middot; {overview.assessment_based.significant_at_0_05 ? "Significant (α=.05)" : "Not significant (α=.05)"}</>
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="analytics-card">
                    <div className="analytics-card-icon cohend"><LuTarget size={20} /></div>
                    <div className="analytics-card-body">
                      <span className="analytics-card-value">d = {overview.assessment_based.cohens_d ?? "--"}</span>
                      <span className="analytics-card-label">Cohen's d &middot; {overview.assessment_based.cohens_d_interpretation || "--"}</span>
                    </div>
                  </div>
                  <div className="analytics-card">
                    <div className="analytics-card-icon hakesg"><LuTrendingUp size={20} /></div>
                    <div className="analytics-card-body">
                      <span className="analytics-card-value">g = {overview.assessment_based.hakes_g ?? "--"}</span>
                      <span className="analytics-card-label">Hake's Normalized Gain &middot; {overview.assessment_based.hakes_g_interpretation || "--"}</span>
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
                {filteredUsers.map((user) => {
                  const isExpanded = expandedEmails.has(user.email);
                  const cached = userMetricsCache[user.email];
                  const isLoadingMetrics = loadingMetricsEmails.has(user.email);
                  const rowError = metricsError[user.email];

                  return (
                  <Fragment key={user.email || Math.random()}>
                  <tr>
                    <td>
                      <div className="admin-user-info">
                        <span className="admin-user-name">{user.name || "Unnamed Profile"}</span>
                        <span className="admin-user-email">{user.email}</span>
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
                            disabled={isRowActionPending(user.email, "verify")}
                          >
                            {isRowActionPending(user.email, "verify")
                              ? <LuRefreshCw size={18} className="spinner-icon" style={{ animation: 'spin 2s linear infinite' }} />
                              : <LuMailWarning size={20} />}
                          </button>
                        )}
                        <button 
                          onClick={() => handleStatusToggle(user.email, user.status)}
                          title={isSuspendedStatus(user.status) ? "Restore Account Access" : "Suspend Account Access"}
                          className={`admin-action-btn ${isSuspendedStatus(user.status) ? "activate" : "suspend"}`}
                          disabled={isRowActionPending(user.email, "status")}
                        >
                          {isRowActionPending(user.email, "status")
                            ? <LuRefreshCw size={18} className="spinner-icon" style={{ animation: 'spin 2s linear infinite' }} />
                            : (isSuspendedStatus(user.status) ? <LuCheck size={20} /> : <LuBan size={20} />)}
                        </button>
                        <button 
                          onClick={() => handleDelete(user.email)}
                          title="Purge Account (Requires Admin Verification)"
                          className="admin-action-btn delete"
                          disabled={isRowActionPending(user.email, "delete")}
                        >
                          {isRowActionPending(user.email, "delete")
                            ? <LuRefreshCw size={18} className="spinner-icon" style={{ animation: 'spin 2s linear infinite' }} />
                            : <LuTrash2 size={20} />}
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
                            <div className="admin-metrics-grid">
                              <div className="admin-metric-pill">
                                <span className="metric-pill-label">TSR</span>
                                <span className="metric-pill-value">{cached.metrics.tsr !== null ? `${cached.metrics.tsr}%` : "No data"}</span>
                              </div>
                              <div className="admin-metric-pill">
                                <span className="metric-pill-label">AES</span>
                                <span className="metric-pill-value">{cached.metrics.aes !== null ? `${cached.metrics.aes}%` : "No data"}</span>
                              </div>
                              <div className="admin-metric-pill">
                                <span className="metric-pill-label">ROG</span>
                                <span className="metric-pill-value">{cached.metrics.rog !== null ? `+${cached.metrics.rog}` : "No data"}</span>
                              </div>
                              <div className="admin-metric-pill">
                                <span className="metric-pill-label">Activities</span>
                                <span className="metric-pill-value">{cached.metrics.activities_passed} / {cached.metrics.activities_attempted} passed</span>
                              </div>
                              <div className="admin-metric-pill">
                                <span className="metric-pill-label">Pre-Test</span>
                                <span className="metric-pill-value">{cached.milestones.preTest !== null ? `${Math.round(cached.milestones.preTest)}%` : "Not taken"}</span>
                              </div>
                              <div className="admin-metric-pill">
                                <span className="metric-pill-label">Post-Test</span>
                                <span className="metric-pill-value">{cached.milestones.postTest !== null ? `${Math.round(cached.milestones.postTest)}%` : "Not taken"}</span>
                              </div>
                              <div className="admin-metric-pill">
                                <span className="metric-pill-label">Progress Entries</span>
                                <span className="metric-pill-value">{cached.metrics.progress_entries}</span>
                              </div>
                            </div>
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

              <div className="respondent-picker-toolbar">
                <button className="respondent-picker-link" onClick={() => setPendingRespondents(standardUsers.map(u => u.email))}>Select All</button>
                <span className="respondent-picker-divider">&middot;</span>
                <button className="respondent-picker-link" onClick={() => setPendingRespondents([])}>Clear All</button>
                <span className="respondent-picker-count">{pendingRespondents.length} / {standardUsers.length} selected</span>
              </div>

              <div className="respondent-picker-list">
                {standardUsers.length === 0 ? (
                  <div className="admin-empty-state">No standard-user accounts found.</div>
                ) : (
                  standardUsers.map((u) => (
                    <label key={u.email} className="respondent-picker-item">
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