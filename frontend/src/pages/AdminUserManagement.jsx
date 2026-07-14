// frontend/src/pages/AdminUserManagement.jsx
import { useEffect, useMemo, useState } from "react";
import {
  LuBan,
  LuCheck,
  LuFilter,
  LuRefreshCw,
  LuSearch,
  LuShield,
  LuTrash2,
  LuTriangleAlert,
  LuUser,
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
  }, []);

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
                  <th className="th-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.email || Math.random()}>
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
                ))}
                {filteredUsers.length === 0 && !loading && (
                  <tr>
                    <td colSpan="4">
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
    </div>
  );
};

export default AdminUserManagement;