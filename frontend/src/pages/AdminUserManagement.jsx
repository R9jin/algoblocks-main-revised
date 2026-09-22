// frontend/src/pages/AdminUserManagement.jsx
import { Fragment, useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import ExcelJS from "exceljs";
import { addTableSheet, addKeyValueSheet, downloadWorkbook, colLetter, excelStringLiteral, sheetRefs, OPEN_LAST_ROW } from "../utils/excelReport";
import { addRegressionSheets, drawRegressionPdfSection } from "../utils/regressionReport";
import { LearningImpactModelSection, LearningImpactModelReportSection } from "../components/LearningImpactModel";
import {
  LuActivity,
  LuAward,
  LuBan,
  LuChartBar,
  LuCheck,
  LuChevronDown,
  LuChevronUp,
  LuFileText,
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
import curriculumIndex from "../data/curriculumIndex";
import "../styles/AdminUserManagement.css";

// moduleId ("module-3") -> display title ("Divide and Conquer"), used to
// label the per-module breakdown rows in the full report instead of
// showing raw ids the way the activity-history chips do.
const MODULE_TITLES = curriculumIndex.reduce((acc, module) => {
  acc[module.moduleId] = module.title;
  return acc;
}, {});

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

// Controls the "Generate Full Report" trigger/modal (Overall Learning
// Impact report) at the bottom of this page -- same switch as
// SHOW_FULL_REPORT_FEATURE in EvaluationSuite.jsx. Set to `false` to hide
// it again without touching anything the report depends on.
const SHOW_FULL_REPORT_FEATURE = true;

// Formats a possibly-null metric as "72.5%" -- or a bare "--" when there is
// no value yet, instead of the dangling "--%" the report used to print for
// respondents/modules with no scored submissions.
const fmtPct = (v) => (v != null ? `${v}%` : "--");

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

  // Full report view -- a printable rollup of the *currently applied*
  // Overall Learning Impact scope (selectedRespondents / postTestOnly),
  // reusing the same `overview` payload rather than re-querying, so the
  // report always matches whatever's on screen above it.
  const [showFullReport, setShowFullReport] = useState(false);

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
      { target: ".admin-header", title: "Admin overview", description: "Use the top controls to search, filter, and refresh the user list." },
      { target: ".admin-analytics-dashboard", title: "Manage accounts", description: "Review performance analytics across all accounts and apply actions carefully." },
      { target: ".admin-toolbar", title: "User directory", description: "Search and filter accounts, then expand any row in the table below to see activity details and apply actions." },
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

  // Builds the Chapter-4-ready narrative paragraph beneath the report's
  // assessment-based table -- phrased the way a Results/Discussion write-up
  // states a paired t-test outcome, so it's usable close to verbatim rather
  // than just restating the numbers already in the table above it.
  const buildImpactNarrative = (ov) => {
    if (!ov) return "";
    const ab = ov.assessment_based || {};
    const n = ov.paired_test_takers || 0;
    if (n === 0) {
      return "No respondents in the current scope have completed both the pre-test and post-test, so no paired learning-gain statistics are available yet.";
    }

    const sigPhrase = ab.significant_at_0_05
      ? "a statistically significant"
      : "no statistically significant";
    const tStr = ab.t_value != null ? ab.t_value.toFixed(3) : "--";
    const pStr = ab.p_value != null ? ab.p_value.toFixed(4) : "--";
    const dStr = ab.cohens_d != null ? ab.cohens_d.toFixed(3) : "--";
    const gStr = ab.hakes_g != null ? ab.hakes_g.toFixed(3) : "--";

    return `Among the ${n} respondent${n === 1 ? "" : "s"} in the current scope with paired pre-test and post-test scores, mean scores rose from ${ab.mean_pretest}% (SD = ${ab.sd_pretest}) to ${ab.mean_posttest}% (SD = ${ab.sd_posttest}). A paired-samples t-test found ${sigPhrase} difference between the two administrations, t(${ab.degrees_of_freedom ?? n - 1}) = ${tStr}, p = ${pStr}. The effect size was ${(ab.cohens_d_interpretation || "").toLowerCase()} (Cohen's d = ${dStr}), and Hake's normalized learning gain was classified as ${(ab.hakes_g_interpretation || "").toLowerCase()} (g = ${gStr}).`;
  };

  const buildSystemNarrative = (ov) => {
    if (!ov) return "";
    const sg = ov.system_generated || {};
    if (!sg.activities_attempted) {
      return "No activity submissions were recorded for the current scope.";
    }
    const passRate = sg.activities_attempted
      ? Math.round((sg.activities_passed / sg.activities_attempted) * 100)
      : 0;
    return `Across ${sg.activities_attempted} recorded activity submission${sg.activities_attempted === 1 ? "" : "s"} in the current scope, respondents achieved an average Task Success Rate of ${fmtPct(sg.tsr)} and an average Algorithmic Efficiency Score of ${fmtPct(sg.aes)}, passing ${sg.activities_passed} activities (${passRate}%). Among the ${sg.rog_refactored_count} optimization-activity submissions evaluated, the average Refactoring Optimization Gain was +${sg.rog ?? 0} AES points.`;
  };

  const reportScopeLabel = selectedRespondents.length > 0
    ? `${selectedRespondents.length} selected respondent${selectedRespondents.length === 1 ? "" : "s"}`
    : `All standard users${overview ? ` (n=${overview.total_standard_users})` : ""}`;

  // Builds and downloads an actual .pdf file directly in the browser --
  // no print dialog, no "print to PDF" step. jsPDF + autoTable draw the
  // report's text and tables onto PDF pages ourselves, so pagination is
  // fully under our control (autoTable repeats headers and breaks rows
  // cleanly across pages on its own).
  const handleDownloadPdf = (ov) => {
    if (!ov) return;
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const marginX = 40;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const brandColor = [90, 19, 152];
    let y = 54;

    const ensureRoom = (needed) => {
      if (y + needed > pageHeight - 40) {
        doc.addPage();
        y = 54;
      }
    };

    const addHeading = (text) => {
      ensureRoom(24);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(...brandColor);
      doc.text(text, marginX, y);
      y += 18;
      doc.setTextColor(20, 20, 20);
    };

    const addParagraph = (text) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const lines = doc.splitTextToSize(text, pageWidth - marginX * 2);
      lines.forEach((line) => {
        ensureRoom(14);
        doc.text(line, marginX, y);
        y += 13;
      });
      y += 8;
    };

    const addKeyValueTable = (rows) => {
      autoTable(doc, {
        startY: y,
        margin: { left: marginX, right: marginX },
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 5 },
        headStyles: { fillColor: brandColor },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 220 } },
        body: rows,
      });
      y = doc.lastAutoTable.finalY + 20;
    };

    // Title block
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(30, 20, 50);
    doc.text("AlgoBlocks \u2014 Learning Impact Report", marginX, y);
    y += 22;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 110);
    doc.text(`Generated ${new Date().toLocaleString()}`, marginX, y);
    y += 13;
    doc.text(
      `Scope: ${reportScopeLabel}${postTestOnly ? ` \u00b7 Post-test completers only (${ov.post_test_completers ?? 0})` : ""}`,
      marginX,
      y
    );
    y += 24;
    doc.setTextColor(20, 20, 20);

    // 1. System-generated
    addHeading("1. System-Generated Learning Performance");
    addParagraph(buildSystemNarrative(ov));
    const sg = ov.system_generated;
    addKeyValueTable([
      ["Respondents Included", String(ov.user_count)],
      ["Activity Submissions", String(sg.activities_attempted)],
      ["Activities Passed", String(sg.activities_passed)],
      ["Avg Task Success Rate (TSR)", fmtPct(sg.tsr)],
      ["Avg Algorithmic Efficiency Score (AES)", fmtPct(sg.aes)],
      ["Avg Refactoring Optimization Gain (ROG)", `+${sg.rog ?? 0} (n'=${sg.rog_refactored_count})`],
      ["Functional Tests Passed", `${sg.functional_tests.passed}/${sg.functional_tests.total}`],
      ["Complexity Tests Passed", `${sg.complexity_tests.passed}/${sg.complexity_tests.total}`],
      ["Hidden Tests Passed", `${sg.hidden_tests.passed}/${sg.hidden_tests.total}`],
    ]);

    // 2. Per-module breakdown
    addHeading("2. Per-Module Breakdown");
    const moduleEntries = Object.entries(ov.by_module || {});
    if (moduleEntries.length > 0) {
      autoTable(doc, {
        startY: y,
        margin: { left: marginX, right: marginX },
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 5 },
        headStyles: { fillColor: brandColor },
        head: [["Module", "Submissions", "Passed", "Avg TSR", "Avg AES", "Avg ROG"]],
        body: moduleEntries.map(([moduleId, m]) => [
          MODULE_TITLES[moduleId] || moduleId,
          String(m.activities_attempted),
          String(m.activities_passed),
          fmtPct(m.tsr),
          fmtPct(m.aes),
          `+${m.rog ?? 0}`,
        ]),
      });
      y = doc.lastAutoTable.finalY + 20;
    } else {
      addParagraph("No module-level submissions recorded for the current scope.");
    }

    // 3. Assessment-based measures
    addHeading("3. Assessment-Based Learning Measures");
    addParagraph(buildImpactNarrative(ov));
    if (ov.paired_test_takers > 0) {
      const ab = ov.assessment_based;
      addKeyValueTable([
        ["Paired Pre/Post Test Takers (n)", String(ov.paired_test_takers)],
        ["Mean Pre-test / Post-test", `${ab.mean_pretest}% \u2192 ${ab.mean_posttest}%`],
        ["SD Pre-test / Post-test", `${ab.sd_pretest} / ${ab.sd_posttest}`],
        ["Paired t-test", `t(${ab.degrees_of_freedom}) = ${ab.t_value}, p = ${ab.p_value} (${ab.significant_at_0_05 ? "significant" : "not significant"} at \u03b1=.05)`],
        ["Cohen's d", `${ab.cohens_d} \u00b7 ${ab.cohens_d_interpretation}`],
        ["Hake's Normalized Gain (g)", `${ab.hakes_g} \u00b7 ${ab.hakes_g_interpretation}`],
      ]);
    }

    // 4. Individual respondent breakdown
    addHeading(`4. Individual Respondent Breakdown (${ov.by_user?.length ?? 0})`);
    if (ov.by_user && ov.by_user.length > 0) {
      autoTable(doc, {
        startY: y,
        margin: { left: marginX, right: marginX },
        theme: "grid",
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: brandColor },
        head: [["Name", "Email", "Activities", "Passed", "Avg TSR", "Avg AES", "Avg ROG", "Pre-test", "Post-test"]],
        body: ov.by_user.map((u) => [
          u.name || "Unnamed Profile",
          u.email,
          String(u.metrics.activities_attempted),
          String(u.metrics.activities_passed),
          fmtPct(u.metrics.tsr),
          fmtPct(u.metrics.aes),
          `+${u.metrics.rog ?? 0}`,
          u.preTest != null ? `${u.preTest}%` : "--",
          u.postTest != null ? `${u.postTest}%` : "--",
        ]),
      });
    } else {
      addParagraph("No respondents in the current scope.");
    }

    // 5. Individual learning-path breakdown (per respondent, per module) --
    // same flattened rows as the on-screen section 5, so the PDF and the
    // modal never fall out of sync.
    addHeading("5. Individual Learning Path Breakdown (by module)");
    const learningPathRows = (ov.by_user || []).flatMap((u) => {
      const modules = Object.entries(u.by_module || {});
      return modules.map(([moduleId, m], idx) => [
        idx === 0 ? (u.name || "Unnamed Profile") : "",
        idx === 0 ? u.email : "",
        MODULE_TITLES[moduleId] || moduleId,
        String(m.activities_attempted),
        String(m.activities_passed),
        fmtPct(m.tsr),
        fmtPct(m.aes),
        `+${m.rog ?? 0}`,
      ]);
    });
    if (learningPathRows.length > 0) {
      autoTable(doc, {
        startY: y,
        margin: { left: marginX, right: marginX },
        theme: "grid",
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: brandColor },
        head: [["Name", "Email", "Module", "Submissions", "Passed", "Avg TSR", "Avg AES", "Avg ROG"]],
        body: learningPathRows,
      });
      y = doc.lastAutoTable.finalY + 20;
    } else {
      addParagraph("No per-module submissions recorded for any respondent in the current scope.");
    }

    // 6. Learning Impact Model (simple regression) -- appended after the
    // existing sections so their order and numbering are untouched. The
    // helper only needs this handler's own layout primitives; its per-
    // respondent appendix is anonymized (S01.. by row order, no names/emails).
    drawRegressionPdfSection(
      {
        doc, autoTable, marginX, pageWidth, brandColor,
        ensureRoom, addHeading, addParagraph,
        getY: () => y,
        setY: (next) => { y = next; },
      },
      ov.regression,
      6
    );

    doc.save(`AlgoBlocks-Learning-Impact-Report-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  // Builds and downloads the .xlsx counterpart of the report above -- same
  // scope/data source (the currently-applied `overview` payload) but, since
  // a spreadsheet isn't paginated the way a PDF page is, every sheet carries
  // the *full* underlying data rather than a print-friendly subset.
  // ---------------------------------------------------------------------
  // Excel export
  //
  // The workbook is built as a chain, bottom-up, so that no derived number
  // anywhere in it is a pasted-in literal:
  //
  //   Submissions  (raw: one row per activity submission, exactly as the
  //                 database holds it -- tests passed/total, the final AES,
  //                 the ROG, the per-category test counts)
  //        |
  //        v  AVERAGEIF / SUMIF / COUNTIFS on each respondent's email
  //   Respondents  and  Learning Path Detail  and  Per-Module Breakdown
  //        |
  //        v  AVERAGE / SUM / COUNTA over the columns above
  //   Summary  (cohort TSR, AES, ROG, test tallies)
  //
  //   Pre-Post Test Data  (raw: each respondent's two scores)
  //        |
  //        v  AVERAGE / STDEV.S / T.TEST / the t, d and g definitions
  //   Summary  (assessment-based measures)
  //
  // Concretely, every one of these is a live formula you can double-click:
  //
  //  - Each submission's own TSR is `=IF(AND(ISNUMBER(passed),ISNUMBER(total),
  //    total>0),passed/total*100,"")` -- the ratio, computed in the cell,
  //    left blank when that submission has no scored tests so it drops out
  //    of every mean exactly as the backend drops it.
  //  - Whether a submission counts as "passed" is the AES >= 50 OR
  //    status = "passed" rule, written out as an IF/OR over its own row.
  //  - A respondent's TSR / AES / ROG are AVERAGEIF over their submissions;
  //    their activity, pass and test-case counts are COUNTIF / SUMIF.
  //  - Per-module figures are the same formulas with a second criterion,
  //    and the cohort figures are plain AVERAGE / SUM over the raw column.
  //  - The paired t-test, Cohen's d and Hake's g are rebuilt from the two
  //    score columns using the same definitions the backend uses (sample
  //    stdev, mean-difference / (sd-difference / sqrt(n)), Excel's own
  //    T.TEST for the p-value).
  //
  // Everything is LIVE, in both directions:
  //
  //  - Respondents is the roster. Each submission carries an "In Respondents"
  //    flag (a COUNTIF against the Respondents email column), and the cohort
  //    Summary, Per-Module Breakdown and Learning Path Detail all count only
  //    flagged submissions -- so deleting a respondent's row removes them from
  //    every figure, and editing a name there renames them everywhere.
  //  - Pre-Post Test Data has no typed scores: each row looks its respondent
  //    up by email on the Respondents sheet, and a row only counts when that
  //    respondent has BOTH scores. Edit or clear a score on Respondents and
  //    the t-test, Cohen's d and Hake's g follow.
  //  - Every range is a whole column (see sheetRefs), so rows added below the
  //    last one -- or deleted from anywhere -- are picked up automatically.
  //
  // The only typed-in numbers are genuine raw observations: a submission's
  // test counts, its AES and ROG, and each respondent's pre/post score.
  // Every formula also carries the server's value as its cached result, so
  // the numbers read correctly before Excel recalculates -- and because the
  // formulas mirror the backend's definitions term for term, recalculating
  // reproduces them rather than shifting them.
  const handleDownloadExcel = async (ov) => {
    if (!ov) return;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "AlgoBlocks";
    workbook.created = new Date();

    const sg = ov.system_generated || {};
    const ab = ov.assessment_based || {};
    const byUser = ov.by_user || [];
    const moduleEntries = Object.entries(ov.by_module || {});
    const learningPathRowsForCount = byUser.flatMap((u) => Object.entries(u.by_module || {}));

    // Per-submission raw rows (api/services/admin_analytics_service.py ->
    // _submission_raw_row). Older backends don't send them; in that case the
    // aggregates fall back to being reconstructed one level up, from the
    // Respondents / Learning Path sheets, which is still formula-driven --
    // just averaging already-averaged rows rather than raw submissions.
    const rawSubs = Array.isArray(ov.submissions) ? ov.submissions : [];
    const hasRawSubs = rawSubs.length > 0;

    const nameByEmail = {};
    byUser.forEach((u) => { nameByEmail[u.email] = u.name || "Unnamed Profile"; });
    const moduleTitle = (moduleId) => MODULE_TITLES[moduleId] || moduleId || "unknown";

    // Column layouts + cross-sheet range strings are worked out up front
    // (they only need row/column *counts*, not the worksheets themselves)
    // so the Summary sheet's formulas can be written first -- putting
    // Summary as the first tab in the file without resorting to reordering
    // worksheets after the fact.
    const SUB_SHEET = "Submissions";
    const SUB_KEYS = [
      "name", "email", "module", "activity", "type", "status", "unchanged",
      "tsrPassed", "tsrTotal", "tsr", "aes", "rog", "rogCounted", "countedPassed",
      "inRoster",
      "funcPassed", "funcTotal", "compPassed", "compTotal", "hidPassed", "hidTotal",
      "timestamp",
    ];
    const sub = sheetRefs(SUB_SHEET, SUB_KEYS, rawSubs.length);

    const RESP_COLS_DEF = [
      "name", "email", "status", "attempted", "passed", "tsr", "aes", "rog",
      "rogN", "unchanged", "funcPassed", "funcTotal", "compPassed", "compTotal",
      "hidPassed", "hidTotal", "preTest", "postTest",
    ];
    const resp = sheetRefs("Respondents", RESP_COLS_DEF, byUser.length);
    // Bounded (row 2..OPEN_LAST_ROW) variant, only for the SUMPRODUCT-based
    // fallback below, which cannot take whole columns.
    const respRange = (key) => resp.bounded(key);

    const LP_COLS_DEF = [
      "name", "email", "module", "attempted", "passed", "tsr", "aes", "rog",
      "rogN", "unchanged", "funcPassed", "funcTotal", "compPassed", "compTotal",
      "hidPassed", "hidTotal",
    ];
    const lp = sheetRefs("Learning Path Detail", LP_COLS_DEF, learningPathRowsForCount.length);
    const lpCol = (key) => lp.bounded(key);

    // Pre-Post Test Data has one row per respondent; a row only counts when
    // that respondent has both scores (otherwise pre/post/diff are blank and
    // AVERAGE / STDEV.S / COUNT skip them together, keeping the pairs aligned).
    const PP_COLS_DEF = ["name", "email", "pre", "post", "diff"];
    const pp = sheetRefs("Pre-Post Test Data", PP_COLS_DEF, byUser.length);
    const ppColIdx = {};
    PP_COLS_DEF.forEach((key, i) => { ppColIdx[key] = i + 1; });
    const ppRange = (key) => pp.range(key);

    // Name lookup shared by the sheets that repeat a respondent's name: the
    // Respondents sheet is the one place the name is typed.
    const nameLookup = (emailCell, fallback) =>
      `IFERROR(INDEX(${resp.range("name")},MATCH(${emailCell},${resp.range("email")},0)),${fallback})`;

    // ----- Helpers for the submission-backed formulas -------------------
    // `criteria` is a list of [rangeString, criterionString] pairs -- the
    // respondent's email cell, the module title cell, or both.
    const flat = (criteria) => criteria.map(([r, c]) => `${r},${c}`).join(",");
    const countRows = (criteria) => `COUNTIFS(${flat(criteria)})`;
    const sumCol = (key, criteria) =>
      criteria.length === 0
        ? `SUM(${sub.range(key)})`
        : `SUMIFS(${sub.range(key)},${flat(criteria)})`;
    // Means deliberately go through AVERAGEIFS, which skips the blank-string
    // cells the raw sheet writes for "this submission has no value here" --
    // the same submissions the backend leaves out of the mean.
    const avgCol = (key, criteria) =>
      criteria.length === 0
        ? `IFERROR(AVERAGE(${sub.range(key)}),"")`
        : `IFERROR(AVERAGEIFS(${sub.range(key)},${flat(criteria)}),"")`;
    // ROG only counts on optimization-type submissions (normal activities'
    // rog, if present, is ignored) -- zero gains DO count, so this needs
    // "is a number", not "> 0".
    //
    // BUG FIX (n' inflated to the full row count): this used to test
    // "<>" against the rogCounted column, which is meant as an
    // is-this-blank check. But every row's rogCounted cell holds an
    // actual formula (=IF(...,value,"")), even on rows where it
    // evaluates to "". A formula that *returns* "" is not a truly
    // blank cell to Excel, so "<>" counted it anyway -- inflating n'
    // to every row in scope (e.g. 3066) instead of just the rows with
    // a real numeric ROG (e.g. 458). A numeric-range comparison doesn't
    // have this problem: COUNTIFS never treats a text result (including
    // "") as satisfying a numeric inequality, regardless of whether
    // that text came from a formula or a literal cell. -1E+15 is just
    // a bound far below any real ROG value (which is always >= 0).
    const countRog = (criteria) => countRows([...criteria, [sub.range("rogCounted"), '">-1E+15"']]);
    const countUnchanged = (criteria) => countRows([...criteria, [sub.range("unchanged"), '"Yes"']]);
    const pairStr = (aKey, bKey, criteria) =>
      `${sumCol(aKey, criteria)}&"/"&${sumCol(bKey, criteria)}`;
    // Cohort-, module- and learning-path-level figures count only submissions
    // whose respondent is still listed on the Respondents sheet.
    const inRoster = [sub.range("inRoster"), "1"];
    const cohortCriteria = [inRoster];

    /**
     * The full metric set for one scope (a respondent, a respondent+module,
     * a module, or the whole cohort), as formulas over the Submissions
     * sheet. `m` supplies the cached values the server already computed.
     */
    const metricFormulas = (criteria, m = {}) => ({
      attempted: {
        formula: criteria.length === 0 ? `COUNTA(${sub.range("email")})` : countRows(criteria),
        result: m.activities_attempted ?? 0,
      },
      passed: { formula: sumCol("countedPassed", criteria), result: m.activities_passed ?? 0 },
      tsr: { formula: avgCol("tsr", criteria), result: m.tsr ?? "" },
      aes: { formula: avgCol("aes", criteria), result: m.aes ?? "" },
      rog: { formula: avgCol("rogCounted", criteria), result: m.rog ?? "" },
      rogN: { formula: countRog(criteria), result: m.rog_refactored_count ?? 0 },
      unchanged: { formula: countUnchanged(criteria), result: m.unchanged_code_resubmissions ?? 0 },
      funcPassed: { formula: sumCol("funcPassed", criteria), result: m.functional_tests?.passed ?? 0 },
      funcTotal: { formula: sumCol("funcTotal", criteria), result: m.functional_tests?.total ?? 0 },
      compPassed: { formula: sumCol("compPassed", criteria), result: m.complexity_tests?.passed ?? 0 },
      compTotal: { formula: sumCol("compTotal", criteria), result: m.complexity_tests?.total ?? 0 },
      hidPassed: { formula: sumCol("hidPassed", criteria), result: m.hidden_tests?.passed ?? 0 },
      hidTotal: { formula: sumCol("hidTotal", criteria), result: m.hidden_tests?.total ?? 0 },
    });

    // ----- Computed: Summary (built first so it's the first tab) ------
    const hasRespondents = byUser.length > 0;
    // Fallback only: without raw submissions the cohort means are rebuilt
    // from the Respondents sheet, weighted by each respondent's activity
    // count (exact for ROG, a close match for TSR/AES).
    const weightedRespAvg = (valueKey, weightKey) =>
      `SUMPRODUCT(${respRange(valueKey)},${respRange(weightKey)})/SUM(${respRange(weightKey)})`;

    let systemRows;
    if (!hasRespondents) {
      systemRows = [["Respondents Included", 0]];
    } else if (hasRawSubs) {
      const cohort = metricFormulas(cohortCriteria, sg);
      systemRows = [
        ["Respondents Included", { formula: resp.count("email"), result: ov.user_count }],
        ["Activity Submissions", cohort.attempted],
        ["Activities Passed", cohort.passed],
        ["Avg Task Success Rate (TSR)", { ...cohort.tsr, numFmt: '0.0"%"' }],
        ["Avg Algorithmic Efficiency Score (AES)", { ...cohort.aes, numFmt: '0.0"%"' }],
        ["Avg Refactoring Optimization Gain (ROG)", {
          formula: `"+"&ROUND(IFERROR(AVERAGEIFS(${sub.range("rogCounted")},${flat(cohortCriteria)}),0),1)&" (n'="&${countRog(cohortCriteria)}&")"`,
          result: `+${sg.rog ?? 0} (n'=${sg.rog_refactored_count})`,
        }],
        ["Unchanged-Code Resubmissions", {
          formula: countUnchanged(cohortCriteria),
          result: sg.unchanged_code_resubmissions ?? 0,
        }],
        ["Functional Tests Passed", {
          formula: pairStr("funcPassed", "funcTotal", cohortCriteria),
          result: `${sg.functional_tests?.passed ?? 0}/${sg.functional_tests?.total ?? 0}`,
        }],
        ["Complexity Tests Passed", {
          formula: pairStr("compPassed", "compTotal", cohortCriteria),
          result: `${sg.complexity_tests?.passed ?? 0}/${sg.complexity_tests?.total ?? 0}`,
        }],
        ["Hidden Tests Passed", {
          formula: pairStr("hidPassed", "hidTotal", cohortCriteria),
          result: `${sg.hidden_tests?.passed ?? 0}/${sg.hidden_tests?.total ?? 0}`,
        }],
      ];
    } else {
      systemRows = [
        ["Respondents Included", { formula: resp.count("email"), result: ov.user_count }],
        ["Activity Submissions", { formula: `SUM(${respRange("attempted")})`, result: sg.activities_attempted }],
        ["Activities Passed", { formula: `SUM(${respRange("passed")})`, result: sg.activities_passed }],
        ["Avg Task Success Rate (TSR)", { formula: weightedRespAvg("tsr", "attempted"), numFmt: '0.0"%"', result: sg.tsr }],
        ["Avg Algorithmic Efficiency Score (AES)", { formula: weightedRespAvg("aes", "attempted"), numFmt: '0.0"%"', result: sg.aes }],
        ["Avg Refactoring Optimization Gain (ROG)", { formula: `"+"&ROUND(${weightedRespAvg("rog", "rogN")},1)&" (n'="&SUM(${respRange("rogN")})&")"`, result: `+${sg.rog ?? 0} (n'=${sg.rog_refactored_count})` }],
        ["Unchanged-Code Resubmissions", { formula: `SUM(${respRange("unchanged")})`, result: sg.unchanged_code_resubmissions ?? 0 }],
        ["Functional Tests Passed", { formula: `SUM(${respRange("funcPassed")})&"/"&SUM(${respRange("funcTotal")})`, result: `${sg.functional_tests?.passed ?? 0}/${sg.functional_tests?.total ?? 0}` }],
        ["Complexity Tests Passed", { formula: `SUM(${respRange("compPassed")})&"/"&SUM(${respRange("compTotal")})`, result: `${sg.complexity_tests?.passed ?? 0}/${sg.complexity_tests?.total ?? 0}` }],
        ["Hidden Tests Passed", { formula: `SUM(${respRange("hidPassed")})&"/"&SUM(${respRange("hidTotal")})`, result: `${sg.hidden_tests?.passed ?? 0}/${sg.hidden_tests?.total ?? 0}` }],
      ];
    }

    // Assessment-based measures, all over the Pre-Post Test Data sheet, whose
    // pre/post/diff cells are themselves formulas over the Respondents sheet.
    // A respondent without both scores is blank there, and AVERAGE / STDEV.S /
    // COUNT skip blanks together, so pairs stay aligned. The p-value is the
    // two-tailed t distribution at the paired t statistic -- identical to
    // T.TEST(pre, post, 2, 1), but it does not need the two ranges to be the
    // same length, which is what lets rows be deleted or left blank safely.
    // Fewer than two pairs make STDEV.S fail, hence the "n/a".
    const preR = ppRange("pre");
    const postR = ppRange("post");
    const diffR = ppRange("diff");
    const nPairs = `COUNT(${diffR})`;
    const tFormula = `AVERAGE(${diffR})/(_xlfn.STDEV.S(${diffR})/SQRT(${nPairs}))`;
    const dFormula = `AVERAGE(${diffR})/_xlfn.STDEV.S(${diffR})`;
    const gFormula = `(AVERAGE(${postR})-AVERAGE(${preR}))/(100-AVERAGE(${preR}))`;
    const pFormula = `_xlfn.T.DIST.2T(ABS(${tFormula}),${nPairs}-1)`;
    const live = (formula, result, numFmt) => ({
      formula: `IFERROR(${formula},"n/a")`,
      result: result ?? "n/a",
      ...(numFmt ? { numFmt } : {}),
    });

    const assessmentRows = !hasRespondents ? [["Paired Pre/Post Test Takers (n)", 0]] : [
      ["Paired Pre/Post Test Takers (n)", { formula: nPairs, result: ov.paired_test_takers ?? 0 }],
      ["Mean Pre-test", live(`AVERAGE(${preR})`, ab.mean_pretest, '0.00"%"')],
      ["Mean Post-test", live(`AVERAGE(${postR})`, ab.mean_posttest, '0.00"%"')],
      ["SD Pre-test", live(`_xlfn.STDEV.S(${preR})`, ab.sd_pretest, "0.00")],
      ["SD Post-test", live(`_xlfn.STDEV.S(${postR})`, ab.sd_posttest, "0.00")],
      ["Mean Difference (Post - Pre)", live(`AVERAGE(${diffR})`, ab.mean_difference, "0.00")],
      ["SD of Differences", live(`_xlfn.STDEV.S(${diffR})`, ab.sd_difference, "0.00")],
      ["t-value", live(tFormula, ab.t_value, "0.000")],
      ["Degrees of Freedom", { formula: `IF(${nPairs}>0,${nPairs}-1,"n/a")`, result: ab.degrees_of_freedom ?? "n/a" }],
      ["p-value (two-tailed paired t-test)", live(pFormula, ab.p_value, "0.0000")],
      ["Significant at α=.05", { formula: `IFERROR(IF(${pFormula}<0.05,"Yes","No"),"n/a")`, result: ab.significant_at_0_05 == null ? "n/a" : (ab.significant_at_0_05 ? "Yes" : "No") }],
      ["Cohen's d", live(dFormula, ab.cohens_d, "0.000")],
      ["Cohen's d Interpretation", { formula: `IFERROR(IF(ABS(${dFormula})>=0.8,"Large Effect",IF(ABS(${dFormula})>=0.5,"Medium Effect",IF(ABS(${dFormula})>=0.2,"Small Effect","Negligible Effect"))),"n/a")`, result: ab.cohens_d_interpretation ?? "n/a" }],
      ["Hake's Normalized Gain (g)", live(gFormula, ab.hakes_g, "0.000")],
      ["Hake's g Interpretation", { formula: `IFERROR(IF(${gFormula}>=0.7,"High Gain",IF(${gFormula}>=0.3,"Medium Gain","Low Gain")),"n/a")`, result: ab.hakes_g_interpretation ?? "n/a" }],
    ];

    addKeyValueSheet(workbook, "Summary", [
      {
        heading: "AlgoBlocks — Learning Impact Report",
        rows: [
          ["Generated", new Date().toLocaleString()],
          ["Scope", `${reportScopeLabel}${postTestOnly ? ` · Post-test completers only (${ov.post_test_completers ?? 0})` : ""}`],
          ["How to read this workbook", hasRawSubs
            ? "Every figure below is an Excel formula over the raw sheets. Click a cell to see its arithmetic."
            : "Figures below are Excel formulas over the Respondents and Pre-Post Test Data sheets."],
        ],
      },
      {
        heading: "1. System-Generated Learning Performance",
        narrative: buildSystemNarrative(ov),
        rows: systemRows,
      },
      {
        heading: "3. Assessment-Based Learning Measures",
        narrative: buildImpactNarrative(ov),
        rows: assessmentRows,
      },
    ], { headerColor: "5A1398" });

    // ----- Raw data: Respondents (one row per respondent) -----------
    const RESP_COLS = [
      { header: "Name", key: "name", width: 22 },
      { header: "Email", key: "email", width: 30 },
      { header: "Status", key: "status", width: 12 },
      { header: "Activities Attempted", key: "attempted", width: 18 },
      { header: "Activities Passed", key: "passed", width: 16 },
      { header: "Avg TSR (%)", key: "tsr", width: 12, numFmt: '0.0"%"' },
      { header: "Avg AES (%)", key: "aes", width: 12, numFmt: '0.0"%"' },
      { header: "Avg ROG", key: "rog", width: 12, numFmt: "+0.0;-0.0;0" },
      { header: "ROG Sample (n')", key: "rogN", width: 16 },
      { header: "Unchanged-Code Resubmissions", key: "unchanged", width: 16 },
      { header: "Functional Passed", key: "funcPassed", width: 16 },
      { header: "Functional Total", key: "funcTotal", width: 16 },
      { header: "Complexity Passed", key: "compPassed", width: 16 },
      { header: "Complexity Total", key: "compTotal", width: 16 },
      { header: "Hidden Passed", key: "hidPassed", width: 14 },
      { header: "Hidden Total", key: "hidTotal", width: 14 },
      { header: "Pre-test (%)", key: "preTest", width: 12, numFmt: '0.00"%"' },
      { header: "Post-test (%)", key: "postTest", width: 12, numFmt: '0.00"%"' },
    ];
    addTableSheet(
      workbook,
      "Respondents",
      RESP_COLS,
      byUser.map((u, i) => {
        // Each respondent's row aggregates their own submissions, keyed off
        // the email cell in this very row -- so editing or filtering the
        // Submissions sheet flows straight through to here.
        const byEmail = [[sub.range("email"), resp.localCell("email", i)]];
        const m = u.metrics || {};
        const computed = hasRawSubs ? metricFormulas(byEmail, m) : {
          attempted: m.activities_attempted ?? 0,
          passed: m.activities_passed ?? 0,
          tsr: m.tsr ?? 0,
          aes: m.aes ?? 0,
          rog: m.rog ?? 0,
          rogN: m.rog_refactored_count ?? 0,
          unchanged: m.unchanged_code_resubmissions ?? 0,
          funcPassed: m.functional_tests?.passed ?? 0,
          funcTotal: m.functional_tests?.total ?? 0,
          compPassed: m.complexity_tests?.passed ?? 0,
          compTotal: m.complexity_tests?.total ?? 0,
          hidPassed: m.hidden_tests?.passed ?? 0,
          hidTotal: m.hidden_tests?.total ?? 0,
        };
        return {
          name: u.name || "Unnamed Profile",
          email: u.email,
          status: u.status || "active",
          ...computed,
          preTest: u.preTest != null ? u.preTest : "--",
          postTest: u.postTest != null ? u.postTest : "--",
        };
      }),
      { headerColor: "5A1398" }
    );

    // ----- Raw data: Learning Path Detail (respondent x module rows) --
    const LP_COLS = [
      { header: "Name", key: "name", width: 22 },
      { header: "Email", key: "email", width: 30 },
      { header: "Module", key: "module", width: 26 },
      { header: "Submissions", key: "attempted", width: 14 },
      { header: "Passed", key: "passed", width: 10 },
      { header: "Avg TSR (%)", key: "tsr", width: 12, numFmt: '0.0"%"' },
      { header: "Avg AES (%)", key: "aes", width: 12, numFmt: '0.0"%"' },
      { header: "Avg ROG", key: "rog", width: 12, numFmt: "+0.0;-0.0;0" },
      { header: "ROG Sample (n')", key: "rogN", width: 16 },
      { header: "Unchanged-Code Resubmissions", key: "unchanged", width: 16 },
      { header: "Functional Passed", key: "funcPassed", width: 16 },
      { header: "Functional Total", key: "funcTotal", width: 16 },
      { header: "Complexity Passed", key: "compPassed", width: 16 },
      { header: "Complexity Total", key: "compTotal", width: 16 },
      { header: "Hidden Passed", key: "hidPassed", width: 14 },
      { header: "Hidden Total", key: "hidTotal", width: 14 },
    ];

    let lpIndex = -1;
    const learningPathRows = byUser.flatMap((u) =>
      Object.entries(u.by_module || {}).map(([moduleId, m]) => {
        lpIndex += 1;
        const criteria = [
          [sub.range("email"), lp.localCell("email", lpIndex)],
          [sub.range("module"), lp.localCell("module", lpIndex)],
          inRoster,
        ];
        const computed = hasRawSubs ? metricFormulas(criteria, m) : {
          attempted: m.activities_attempted ?? 0,
          passed: m.activities_passed ?? 0,
          tsr: m.tsr ?? 0,
          aes: m.aes ?? 0,
          rog: m.rog ?? 0,
          rogN: m.rog_refactored_count ?? 0,
          unchanged: m.unchanged_code_resubmissions ?? 0,
          funcPassed: m.functional_tests?.passed ?? 0,
          funcTotal: m.functional_tests?.total ?? 0,
          compPassed: m.complexity_tests?.passed ?? 0,
          compTotal: m.complexity_tests?.total ?? 0,
          hidPassed: m.hidden_tests?.passed ?? 0,
          hidTotal: m.hidden_tests?.total ?? 0,
        };
        return {
          // The name is looked up from the Respondents sheet (the one place
          // it is typed); email and module are this row's two keys.
          name: {
            formula: nameLookup(lp.localCell("email", lpIndex), '""'),
            result: u.name || "Unnamed Profile",
          },
          email: u.email,
          module: moduleTitle(moduleId),
          ...computed,
        };
      })
    );

    addTableSheet(workbook, "Learning Path Detail", LP_COLS, learningPathRows, { headerColor: "5A1398" });

    // ----- Raw data: Pre-Post Test Data (paired respondents only) -----
    const PP_COLS = [
      { header: "Name", key: "name", width: 22 },
      { header: "Email", key: "email", width: 30 },
      { header: "Pre-test (%)", key: "pre", width: 14, numFmt: '0.00"%"' },
      { header: "Post-test (%)", key: "post", width: 14, numFmt: '0.00"%"' },
      { header: "Difference (Post - Pre)", key: "diff", width: 20, numFmt: '0.00"%"' },
    ];

    // One row per respondent. Nothing here is typed except the email key:
    // name, pre, post and the difference are formulas over the Respondents
    // sheet, and pre/post/diff stay blank unless that respondent has BOTH
    // scores -- so a row whose respondent was deleted, or who lacks a score,
    // drops out of every statistic on its own. To add a respondent, add them
    // to Respondents first, then copy the last row of this sheet down one and
    // type their email.
    const respEmailR = resp.range("email");
    const scoreLookup = (emailCell, scoreKey) =>
      `IF(COUNTIFS(${respEmailR},${emailCell},${resp.range("preTest")},">=0",${resp.range("postTest")},">=0")>0,` +
      `SUMIFS(${resp.range(scoreKey)},${respEmailR},${emailCell}),"")`;
    addTableSheet(
      workbook,
      "Pre-Post Test Data",
      PP_COLS,
      byUser.map((u, i) => {
        const emailCell = pp.localCell("email", i);
        const preCell = pp.localCell("pre", i);
        const postCell = pp.localCell("post", i);
        const paired = u.preTest != null && u.postTest != null;
        return {
          name: { formula: nameLookup(emailCell, '""'), result: u.name || "Unnamed Profile" },
          email: u.email,
          pre: { formula: scoreLookup(emailCell, "preTest"), result: paired ? u.preTest : "" },
          post: { formula: scoreLookup(emailCell, "postTest"), result: paired ? u.postTest : "" },
          diff: {
            formula: `IF(AND(ISNUMBER(${preCell}),ISNUMBER(${postCell})),${postCell}-${preCell},"")`,
            result: paired ? u.postTest - u.preTest : "",
          },
        };
      }),
      { headerColor: "5A1398" }
    );

    // ----- Computed: Per-Module Breakdown -------------------------------
    // With raw submissions this reads straight off them (one criterion: the
    // module title in column A). Without, it aggregates the Learning Path
    // sheet, weighting each respondent's module average by their activity
    // count.
    const moduleRows = moduleEntries.length === 0 ? [] : moduleEntries.map(([moduleId, m], i) => {
      const title = moduleTitle(moduleId);
      if (hasRawSubs) {
        const criteria = [[sub.range("module"), `$A${2 + i}`], inRoster];
        const c = metricFormulas(criteria, m);
        return {
          module: title,
          attempted: c.attempted,
          passed: c.passed,
          tsr: { ...c.tsr, numFmt: '0.0"%"' },
          aes: { ...c.aes, numFmt: '0.0"%"' },
          rog: { ...c.rog, numFmt: "+0.0;-0.0;0" },
          rogN: c.rogN,
          unchanged: c.unchanged,
          functional: { formula: pairStr("funcPassed", "funcTotal", criteria), result: `${m.functional_tests?.passed ?? 0}/${m.functional_tests?.total ?? 0}` },
          complexity: { formula: pairStr("compPassed", "compTotal", criteria), result: `${m.complexity_tests?.passed ?? 0}/${m.complexity_tests?.total ?? 0}` },
          hidden: { formula: pairStr("hidPassed", "hidTotal", criteria), result: `${m.hidden_tests?.passed ?? 0}/${m.hidden_tests?.total ?? 0}` },
        };
      }
      if (learningPathRows.length === 0) return null;
      const quoted = excelStringLiteral(title);
      const moduleMatch = `${lpCol("module")}="${quoted}"`;
      const weightedAvg = (valueCol, weightCol) =>
        `SUMPRODUCT((${moduleMatch})*${lpCol(valueCol)}*${lpCol(weightCol)})/SUMPRODUCT((${moduleMatch})*${lpCol(weightCol)})`;
      const sumIf = (valueCol) => `SUMIF(${lpCol("module")},"${quoted}",${lpCol(valueCol)})`;
      return {
        module: title,
        attempted: { formula: sumIf("attempted"), result: m.activities_attempted ?? 0 },
        passed: { formula: sumIf("passed"), result: m.activities_passed ?? 0 },
        tsr: { formula: weightedAvg("tsr", "attempted"), numFmt: '0.0"%"', result: m.tsr ?? 0 },
        aes: { formula: weightedAvg("aes", "attempted"), numFmt: '0.0"%"', result: m.aes ?? 0 },
        rog: { formula: weightedAvg("rog", "rogN"), numFmt: "+0.0;-0.0;0", result: m.rog ?? 0 },
        rogN: { formula: sumIf("rogN"), result: m.rog_refactored_count ?? 0 },
        unchanged: { formula: sumIf("unchanged"), result: m.unchanged_code_resubmissions ?? 0 },
        functional: { formula: `${sumIf("funcPassed")}&"/"&${sumIf("funcTotal")}`, result: `${m.functional_tests?.passed ?? 0}/${m.functional_tests?.total ?? 0}` },
        complexity: { formula: `${sumIf("compPassed")}&"/"&${sumIf("compTotal")}`, result: `${m.complexity_tests?.passed ?? 0}/${m.complexity_tests?.total ?? 0}` },
        hidden: { formula: `${sumIf("hidPassed")}&"/"&${sumIf("hidTotal")}`, result: `${m.hidden_tests?.passed ?? 0}/${m.hidden_tests?.total ?? 0}` },
      };
    }).filter(Boolean);

    addTableSheet(
      workbook,
      "Per-Module Breakdown",
      [
        { header: "Module", key: "module", width: 28 },
        { header: "Submissions", key: "attempted", width: 14 },
        { header: "Passed", key: "passed", width: 12 },
        { header: "Avg TSR", key: "tsr", width: 12 },
        { header: "Avg AES", key: "aes", width: 12 },
        { header: "Avg ROG", key: "rog", width: 12 },
        { header: "ROG Sample (n')", key: "rogN", width: 16 },
        { header: "Unchanged-Code Resubmissions", key: "unchanged", width: 16 },
        { header: "Functional Passed/Total", key: "functional", width: 20 },
        { header: "Complexity Passed/Total", key: "complexity", width: 20 },
        { header: "Hidden Passed/Total", key: "hidden", width: 20 },
      ],
      moduleRows,
      { headerColor: "5A1398" }
    );

    // ----- Raw data: Submissions (the base of the whole workbook) -------
    // One row per activity submission. The three computed columns here are
    // the per-submission definitions the backend applies before averaging:
    // a submission's own TSR, whether its ROG counts as a refactoring gain,
    // and whether it counts as a passed activity.
    if (hasRawSubs) {
      addTableSheet(
        workbook,
        SUB_SHEET,
        [
          { header: "Name", key: "name", width: 22 },
          { header: "Email", key: "email", width: 30 },
          { header: "Module", key: "module", width: 26 },
          { header: "Activity", key: "activity", width: 26 },
          { header: "Type", key: "type", width: 12 },
          { header: "Status", key: "status", width: 12 },
          { header: "Code Unchanged", key: "unchanged", width: 15 },
          { header: "Tests Passed", key: "tsrPassed", width: 13 },
          { header: "Tests Total", key: "tsrTotal", width: 13 },
          { header: "TSR (%)", key: "tsr", width: 11, numFmt: "0.00" },
          { header: "Final AES", key: "aes", width: 11, numFmt: "0.00" },
          { header: "ROG", key: "rog", width: 10, numFmt: "0.00" },
          { header: "ROG Counted", key: "rogCounted", width: 13, numFmt: "0.00" },
          { header: "Counted as Passed", key: "countedPassed", width: 16 },
          { header: "In Respondents (1/0)", key: "inRoster", width: 18 },
          { header: "Functional Passed", key: "funcPassed", width: 16 },
          { header: "Functional Total", key: "funcTotal", width: 16 },
          { header: "Complexity Passed", key: "compPassed", width: 16 },
          { header: "Complexity Total", key: "compTotal", width: 16 },
          { header: "Hidden Passed", key: "hidPassed", width: 14 },
          { header: "Hidden Total", key: "hidTotal", width: 14 },
          { header: "Timestamp", key: "timestamp", width: 22 },
        ],
        rawSubs.map((s, i) => {
          const P = sub.localCell("tsrPassed", i);
          const T = sub.localCell("tsrTotal", i);
          const A = sub.localCell("aes", i);
          const G = sub.localCell("rog", i);
          const TY = sub.localCell("type", i);
          const S = sub.localCell("status", i);
          const countsTsr = typeof s.tsr_passed === "number" && typeof s.tsr_total === "number" && s.tsr_total > 0;
          // ROG is only meaningful on optimization-type submissions (normal
          // activities don't have a baseline-vs-refactored comparison, so
          // any rog sitting on one of their rows is ignored). Zero gains DO
          // count within optimization submissions -- only "was this ever
          // evaluated" (final_aes present) gates it, not "was the gain > 0".
          const countsRog = s.type === "optimization" && typeof s.final_aes === "number" && typeof s.rog === "number";
          const countsPassed = (typeof s.final_aes === "number" && s.final_aes >= 50) || s.status === "passed";
          const emailCell = sub.localCell("email", i);
          return {
            // Looked up from the Respondents sheet by email (falls back to
            // the email itself when the respondent is no longer listed).
            name: {
              formula: nameLookup(emailCell, emailCell),
              result: nameByEmail[s.email] || s.email || "Unnamed Profile",
            },
            email: s.email,
            module: moduleTitle(s.moduleId),
            activity: s.activityId ?? "",
            type: s.type ?? "",
            status: s.status ?? "",
            unchanged: s.code_unchanged ? "Yes" : "No",
            tsrPassed: s.tsr_passed ?? "",
            tsrTotal: s.tsr_total ?? "",
            // This submission's own Task Success Rate. Blank -- and so
            // skipped by every AVERAGEIF above -- when it has no scored
            // tests, which is exactly when the backend skips it too.
            tsr: {
              formula: `IF(AND(ISNUMBER(${P}),ISNUMBER(${T}),${T}>0),${P}/${T}*100,"")`,
              result: countsTsr ? (s.tsr_passed / s.tsr_total) * 100 : "",
            },
            aes: s.final_aes ?? "",
            rog: s.rog ?? "",
            // ROG only counts on optimization-type submissions (normal
            // activities' rog is ignored), and only needs the activity to
            // have actually been evaluated (an AES exists) -- a zero gain
            // counts same as any other.
            rogCounted: {
              formula: `IF(AND(${TY}="optimization",ISNUMBER(${A}),ISNUMBER(${G})),${G},"")`,
              result: countsRog ? s.rog : "",
            },
            // The backend's pass rule, written out: AES >= 50, or the
            // submission was explicitly marked passed.
            countedPassed: {
              formula: `IF(OR(AND(ISNUMBER(${A}),${A}>=50),${S}="passed"),1,0)`,
              result: countsPassed ? 1 : 0,
            },
            // 1 while this submission's respondent is still on the
            // Respondents sheet. Delete the respondent and this flips to 0,
            // which drops the row from the cohort, module and learning-path
            // figures without touching the submission itself.
            inRoster: {
              formula: `IF(COUNTIF(${resp.range("email")},${emailCell})>0,1,0)`,
              result: nameByEmail[s.email] !== undefined ? 1 : 0,
            },
            funcPassed: s.functional_passed ?? 0,
            funcTotal: s.functional_total ?? 0,
            compPassed: s.complexity_passed ?? 0,
            compTotal: s.complexity_total ?? 0,
            hidPassed: s.hidden_passed ?? 0,
            hidTotal: s.hidden_total ?? 0,
            timestamp: s.timestamp ?? "",
          };
        }),
        { headerColor: "5A1398" }
      );
    }

    // ----- Learning Impact Model (simple regression) --------------------
    // Added AFTER every existing sheet so the current sheet order is
    // untouched. "Regression Data" carries anonymized IDs and raw scores with
    // real formulas for z-scores/X/Y/LII; "Regression Summary" recomputes the
    // statistics from it (SLOPE/INTERCEPT/CORREL/RSQ/T.DIST.2T). No names or emails.
    addRegressionSheets(workbook, ov.regression, { headerColor: "5A1398" });

    await downloadWorkbook(workbook, `AlgoBlocks-Learning-Impact-Report-${new Date().toISOString().slice(0, 10)}.xlsx`);
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
                        meanFormula="Mean ROG = (1 / M') × Σ [ AES_final,k - AES_baseline,k ]  for k where gain > 0"
                        baseFormula="where ROG_k = AES_final,k - AES_baseline,k for activity k"
                        desc={`Calculated by computing the score improvement from initial baseline attempt to final refactored solution for each optimization-type activity, averaged only over the M' = ${overview.system_generated.rog_refactored_count ?? 0} optimization submissions that were actually evaluated (includes zero-gain first-try passes; excludes never-attempted drafts and normal, non-optimization activities entirely).`}
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

              {/* Simple regression over the SAME scoped respondents as the
                  cards above (computed once server-side and shared with the
                  full report / PDF / Excel). Loading, error and offline
                  states are handled by the surrounding ternary. */}
              <LearningImpactModelSection regression={overview.regression} />
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
                                    title="This User's Mean Task Success Rate (TSR)"
                                    meanFormula="Mean TSR = (1 / M) × Σ [ TSR_k ] × 100%"
                                    baseFormula="where TSR_k = (Passed Test Cases / Total Test Cases) for activity k"
                                    desc="Calculated by computing the test pass rate for every activity this student submitted, summing across all M activities they attempted, and dividing by M."
                                  >
                                    TSR
                                  </MetricTooltip>
                                </span>
                                <span className="metric-pill-value">{cached.metrics.tsr !== null ? `${cached.metrics.tsr}%` : "No data"}</span>
                              </div>
                              <div className="admin-metric-pill">
                                <span className="metric-pill-label">
                                  <MetricTooltip
                                    title="This User's Mean Algorithmic Efficiency Score (AES)"
                                    meanFormula="Mean AES = (1 / M) × Σ [ AES_k ]"
                                    baseFormula="where AES_k = ⌊(TSR_k × Efficiency_k) × 100⌋ for activity k"
                                    desc="Averages every activity's AES across all M activities this student attempted. Efficiency = [min(W_target/W_actual, 1.0) for Time & Space] / 2, using 1-9 Asymptotic Weights."
                                  >
                                    AES
                                  </MetricTooltip>
                                </span>
                                <span className="metric-pill-value">{cached.metrics.aes !== null ? `${cached.metrics.aes}%` : "No data"}</span>
                              </div>
                              <div className="admin-metric-pill">
                                <span className="metric-pill-label">
                                  <MetricTooltip
                                    title="This User's Mean Refactoring Optimization Gain (ROG)"
                                    meanFormula="Mean ROG = (1 / M) × Σ [ AES_final,k - AES_baseline,k ]"
                                    baseFormula="where ROG_k = AES_final,k - AES_baseline,k for activity k this student refactored"
                                    desc="Averages the AES improvement from this student's baseline (first passing) submission to their final submission, across all M activities where a refactor was recorded."
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
                                                {/* ROG only exists for optimization-challenge activities -- a
                                                    regular activity never shows it here, even if its record
                                                    happens to carry a leftover/stray rog value. */}
                                                <td>{activity.type === "optimization" ? `+${activity.rog ?? 0}` : "--"}</td>
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

        {/* FULL REPORT -- rolls up whatever scope is currently applied to
            the Overall Learning Impact dashboard above (all users / selected
            respondents, post-test-completers-only or not) into one printable
            view, for pulling straight into a Chapter 4 Results write-up.
            Reuses the same `overview` payload already fetched for that
            dashboard so the two never disagree with each other.
            Toggle with SHOW_FULL_REPORT_FEATURE -- see top of file. */}
        {SHOW_FULL_REPORT_FEATURE && (
          <div className="admin-full-report-trigger">
            <button
              className="admin-refresh-btn"
              onClick={() => setShowFullReport(true)}
              disabled={!overview}
            >
              <LuFileText size={18} /> Generate Full Report
            </button>
            <span className="admin-full-report-hint">
              Rolls up the current Overall Learning Impact scope ({reportScopeLabel}{postTestOnly ? " · post-test completers only" : ""}) into a printable report.
            </span>
          </div>
        )}
      </div>

      {/* FULL REPORT MODAL */}
      {SHOW_FULL_REPORT_FEATURE && showFullReport && overview && (
        <div className="admin-modal-overlay report-overlay" onClick={(e) => {
          if (e.target.className.includes('report-overlay')) setShowFullReport(false);
        }}>
          <div className="admin-modal-card full-report-card">
            <div className="admin-modal-header no-print">
              <div className="admin-modal-title">
                <LuFileText size={22} />
                <h3>Full Learning Impact Report</h3>
              </div>
              <div className="full-report-header-actions">
                <button className="admin-refresh-btn small outline" onClick={() => handleDownloadExcel(overview)}>
                  <LuFileText size={16} /> Download Excel
                </button>
                <button className="admin-refresh-btn small outline" onClick={() => handleDownloadPdf(overview)}>
                  <LuFileText size={16} /> Download PDF
                </button>
                <button className="admin-modal-close" onClick={() => setShowFullReport(false)}>
                  <LuX size={20} />
                </button>
              </div>
            </div>

            <div className="admin-modal-body full-report-body" id="full-report-printable">
              <div className="full-report-meta">
                <h1>AlgoBlocks &mdash; Learning Impact Report</h1>
                <p>Generated {new Date().toLocaleString()}</p>
                <p>
                  Scope: {reportScopeLabel}
                  {postTestOnly && ` · Post-test completers only (${overview.post_test_completers ?? 0})`}
                </p>
              </div>

              <section className="full-report-section">
                <h2>1. System-Generated Learning Performance</h2>
                <p>{buildSystemNarrative(overview)}</p>
                <table className="full-report-table">
                  <tbody>
                    <tr><th>Respondents Included</th><td>{overview.user_count}</td></tr>
                    <tr><th>Activity Submissions</th><td>{overview.system_generated.activities_attempted}</td></tr>
                    <tr><th>Activities Passed</th><td>{overview.system_generated.activities_passed}</td></tr>
                    <tr><th>Avg Task Success Rate (TSR)</th><td>{fmtPct(overview.system_generated.tsr)}</td></tr>
                    <tr><th>Avg Algorithmic Efficiency Score (AES)</th><td>{fmtPct(overview.system_generated.aes)}</td></tr>
                    <tr><th>Avg Refactoring Optimization Gain (ROG)</th><td>+{overview.system_generated.rog ?? 0} (n'={overview.system_generated.rog_refactored_count})</td></tr>
                    <tr><th>Functional Tests Passed</th><td>{overview.system_generated.functional_tests.passed}/{overview.system_generated.functional_tests.total}</td></tr>
                    <tr><th>Complexity Tests Passed</th><td>{overview.system_generated.complexity_tests.passed}/{overview.system_generated.complexity_tests.total}</td></tr>
                    <tr><th>Hidden Tests Passed</th><td>{overview.system_generated.hidden_tests.passed}/{overview.system_generated.hidden_tests.total}</td></tr>
                  </tbody>
                </table>
              </section>

              <section className="full-report-section">
                <h2>2. Per-Module Breakdown</h2>
                {overview.by_module && Object.keys(overview.by_module).length > 0 ? (
                  <table className="full-report-table wide">
                    <thead>
                      <tr>
                        <th>Module</th>
                        <th>Submissions</th>
                        <th>Passed</th>
                        <th>Avg TSR</th>
                        <th>Avg AES</th>
                        <th>Avg ROG</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(overview.by_module).map(([moduleId, m]) => (
                        <tr key={moduleId}>
                          <td>{MODULE_TITLES[moduleId] || moduleId}</td>
                          <td>{m.activities_attempted}</td>
                          <td>{m.activities_passed}</td>
                          <td>{fmtPct(m.tsr)}</td>
                          <td>{fmtPct(m.aes)}</td>
                          <td>+{m.rog ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="analytics-empty-note">No module-level submissions recorded for the current scope.</p>
                )}
              </section>

              <section className="full-report-section">
                <h2>3. Assessment-Based Learning Measures</h2>
                <p>{buildImpactNarrative(overview)}</p>
                {overview.paired_test_takers > 0 && (
                  <table className="full-report-table">
                    <tbody>
                      <tr><th>Paired Pre/Post Test Takers (n)</th><td>{overview.paired_test_takers}</td></tr>
                      <tr><th>Mean Pre-test / Post-test</th><td>{overview.assessment_based.mean_pretest}% &rarr; {overview.assessment_based.mean_posttest}%</td></tr>
                      <tr><th>SD Pre-test / Post-test</th><td>{overview.assessment_based.sd_pretest} / {overview.assessment_based.sd_posttest}</td></tr>
                      <tr><th>Paired t-test</th><td>t({overview.assessment_based.degrees_of_freedom}) = {overview.assessment_based.t_value}, p = {overview.assessment_based.p_value} ({overview.assessment_based.significant_at_0_05 ? "significant" : "not significant"} at &alpha;=.05)</td></tr>
                      <tr><th>Cohen's d</th><td>{overview.assessment_based.cohens_d} &middot; {overview.assessment_based.cohens_d_interpretation}</td></tr>
                      <tr><th>Hake's Normalized Gain (g)</th><td>{overview.assessment_based.hakes_g} &middot; {overview.assessment_based.hakes_g_interpretation}</td></tr>
                    </tbody>
                  </table>
                )}
              </section>

              <section className="full-report-section">
                <h2>4. Individual Respondent Breakdown ({overview.by_user?.length ?? 0})</h2>
                {overview.by_user && overview.by_user.length > 0 ? (
                  <div className="user-report-table-wrapper">
                    <table className="full-report-table wide user-report-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Email</th>
                          <th>Activities</th>
                          <th>Passed</th>
                          <th>Avg TSR</th>
                          <th>Avg AES</th>
                          <th>Avg ROG</th>
                          <th>Pre-test</th>
                          <th>Post-test</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview.by_user.map((u) => (
                          <tr key={u.email}>
                            <td>{u.name || "Unnamed Profile"}</td>
                            <td>{u.email}</td>
                            <td>{u.metrics.activities_attempted}</td>
                            <td>{u.metrics.activities_passed}</td>
                            <td>{fmtPct(u.metrics.tsr)}</td>
                            <td>{fmtPct(u.metrics.aes)}</td>
                            <td>+{u.metrics.rog ?? 0}</td>
                            <td>{u.preTest != null ? `${u.preTest}%` : "--"}</td>
                            <td>{u.postTest != null ? `${u.postTest}%` : "--"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="analytics-empty-note">No respondents in the current scope.</p>
                )}
              </section>

              {/* Section 4 above only carries each respondent's single
                  cohort-wide summary row. This section drills into every
                  respondent's own per-module numbers -- their individual
                  progress through the curriculum ("learning path") -- rather
                  than just the summarized totals, using the same
                  per-respondent by_module rollup the backend now returns. */}
              <section className="full-report-section">
                <h2>5. Individual Learning Path Breakdown (by module)</h2>
                {overview.by_user && overview.by_user.some((u) => Object.keys(u.by_module || {}).length > 0) ? (
                  <div className="user-report-table-wrapper">
                    <table className="full-report-table wide user-report-table user-module-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Email</th>
                          <th>Module</th>
                          <th>Submissions</th>
                          <th>Passed</th>
                          <th>Avg TSR</th>
                          <th>Avg AES</th>
                          <th>Avg ROG</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview.by_user.flatMap((u) => {
                          const modules = Object.entries(u.by_module || {});
                          if (modules.length === 0) return [];
                          return modules.map(([moduleId, m], idx) => (
                            <tr key={`${u.email}_${moduleId}`}>
                              <td>{idx === 0 ? (u.name || "Unnamed Profile") : ""}</td>
                              <td>{idx === 0 ? u.email : ""}</td>
                              <td>{MODULE_TITLES[moduleId] || moduleId}</td>
                              <td>{m.activities_attempted}</td>
                              <td>{m.activities_passed}</td>
                              <td>{fmtPct(m.tsr)}</td>
                              <td>{fmtPct(m.aes)}</td>
                              <td>+{m.rog ?? 0}</td>
                            </tr>
                          ));
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="analytics-empty-note">No per-module submissions recorded for any respondent in the current scope.</p>
                )}
              </section>

              {/* Section 6 mirrors the PDF/Excel regression content and is
                  anonymized (S01.. IDs, no names/emails), unlike sections 4-5. */}
              <LearningImpactModelReportSection regression={overview.regression} sectionNumber={6} />
            </div>
          </div>
        </div>
      )}

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