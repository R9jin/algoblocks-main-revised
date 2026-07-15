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
import "../styles/AdminUserManagement.css";

const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");

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

  // Per-user metrics dropdown state
  const [expandedEmail, setExpandedEmail] = useState(null);
  const [userMetricsCache, setUserMetricsCache] = useState({});
  const [metricsLoadingEmail, setMetricsLoadingEmail] = useState(null);
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
      const token = localStorage.getItem("token") || localStorage.getItem("authToken");
      const response = await fetch(`${API_BASE}/api/admin/users`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to fetch users");
      
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

  useEffect(() => {
    fetchUsers();
    fetchOverview();
  }, []);

  const fetchOverview = async (emailsOverride) => {
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      const token = localStorage.getItem("token") || localStorage.getItem("authToken");
      const emailsParam = Array.isArray(emailsOverride) && emailsOverride.length > 0
        ? `?emails=${encodeURIComponent(emailsOverride.join(","))}`
        : "";
      const response = await fetch(`${API_BASE}/api/admin/analytics/overview${emailsParam}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to fetch analytics overview");
      setOverview(data);
    } catch (err) {
      setOverviewError(err.message);
    } finally {
      setOverviewLoading(false);
    }
  };

  const toggleUserMetrics = async (email) => {
    if (expandedEmail === email) {
      setExpandedEmail(null);
      return;
    }
    setExpandedEmail(email);
    if (userMetricsCache[email]) return; // already fetched, just showing cached data

    setMetricsLoadingEmail(email);
    setMetricsError((prev) => ({ ...prev, [email]: null }));
    try {
      const token = localStorage.getItem("token") || localStorage.getItem("authToken");
      const response = await fetch(`${API_BASE}/api/admin/users/${encodeURIComponent(email)}/metrics`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to fetch user metrics");
      setUserMetricsCache((prev) => ({ ...prev, [email]: data }));
    } catch (err) {
      setMetricsError((prev) => ({ ...prev, [email]: err.message }));
    } finally {
      setMetricsLoadingEmail(null);
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
        statusFilter === "active" ? user.status !== "Suspended" : user.status === "Suspended";
        
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

    const newStatus = currentStatus === "Active" || !currentStatus ? "Suspended" : "Active";
    
    showModal({
      type: "confirm",
      title: "Confirm Status Change",
      message: `Are you sure you want to change this account's status to ${newStatus}?`,
      isDanger: newStatus === "Suspended",
      onConfirm: async () => {
        try {
          const token = localStorage.getItem("token") || localStorage.getItem("authToken");
          const response = await fetch(`${API_BASE}/api/admin/users/${encodeURIComponent(email)}/status`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ status: newStatus })
          });

          const data = await response.json();
          if (!response.ok) throw new Error(data.detail || "Failed to update status");

          setUsers(users.map(u => 
            u.email === email ? { ...u, status: newStatus } : u
          ));
        } catch (err) {
          showModal({
            type: "alert",
            title: "Error",
            message: err.message
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
          const token = localStorage.getItem("token") || localStorage.getItem("authToken");
          
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
          if (!response.ok) throw new Error(data.detail || "Failed to delete user");

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
                  const isExpanded = expandedEmail === user.email;
                  const cached = userMetricsCache[user.email];
                  const isLoadingMetrics = metricsLoadingEmail === user.email;
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
                      {user.status === "Suspended" ? (
                        <span className="admin-badge badge-suspended">
                          <LuBan size={16} /> Suspended
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
                        <button 
                          onClick={() => handleStatusToggle(user.email, user.status)}
                          title={user.status === "Active" ? "Suspend Account Access" : "Restore Account Access"}
                          className={`admin-action-btn ${user.status === "Active" ? "suspend" : "activate"}`}
                        >
                          {user.status === "Active" ? <LuBan size={20} /> : <LuCheck size={20} />}
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