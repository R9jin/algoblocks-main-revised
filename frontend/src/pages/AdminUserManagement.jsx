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
  LuUser,
  LuUsers
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
  const [roleFilter, setRoleFilter] = useState("all"); // 'all', 'admin', 'user'
  const [statusFilter, setStatusFilter] = useState("all"); // 'all', 'active', 'suspended'

  const currentUser = JSON.parse(localStorage.getItem("user") || sessionStorage.getItem("user") || "{}");

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
      
      setUsers(data.users || data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Filtered and searched user list calculation
  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const matchesSearch = 
        (user.name || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
        (user.email || "").toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesRole = 
        roleFilter === "all" ? true : 
        roleFilter === "admin" ? user.isAdmin === true : !user.isAdmin;
      
      const matchesStatus = 
        statusFilter === "all" ? true : 
        statusFilter === "active" ? user.status !== "Suspended" : user.status === "Suspended";
        
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchTerm, roleFilter, statusFilter]);

  const handleStatusToggle = async (email, currentStatus) => {
    if (email === currentUser.email) {
      alert("Security restriction: You cannot modify your own administrative account status.");
      return;
    }

    const newStatus = currentStatus === "Active" || !currentStatus ? "Suspended" : "Active";
    if (!window.confirm(`Are you sure you want to change this account's status to ${newStatus}?`)) return;

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
      alert(`Error: ${err.message}`);
    }
  };

  // Secure Delete with Admin Password Re-Prompt
  const handleDelete = async (email) => {
    if (email === currentUser.email) {
      alert("Critical security boundary: You cannot delete your own active administrator profile.");
      return;
    }

    const passwordPrompt = window.prompt(
      `SECURITY VERIFICATION REQUIRED\n\nTo permanently delete account (${email}), please re-enter your current Admin password:`
    );

    if (passwordPrompt === null) return; // Cancelled
    if (!passwordPrompt.trim()) {
      alert("Deletion aborted: Password cannot be blank.");
      return;
    }

    try {
      const token = localStorage.getItem("token") || localStorage.getItem("authToken");
      
      // Step 1: Verify the admin's identity with their supplied password before destructive action
      const verifyRes = await fetch(`${API_BASE}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: currentUser.email, password: passwordPrompt })
      });
      
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || verifyData.status !== "success") {
        throw new Error("Incorrect administrator password. Deletion cancelled.");
      }

      // Step 2: Proceed with execution of target user deletion
      const response = await fetch(`${API_BASE}/api/admin/users/${encodeURIComponent(email)}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to delete user");

      setUsers(users.filter(u => u.email !== email));
      alert("User account successfully purged.");
    } catch (err) {
      alert(`Authorization Error: ${err.message}`);
    }
  };

  return (
    <div className="admin-dashboard-container">
      <DashboardHeader backTo="/dashboard" backText="Back to Dashboard" />
      
      <main className="main-content">
        <div className="header-container">
          <h1 className="page-title">
            <LuUsers size={28} color="#3b82f6" /> User Management
          </h1>
          <button onClick={fetchUsers} className="refresh-btn">
            <LuRefreshCw size={16} /> Refresh
          </button>
        </div>

        {/* SEARCH AND CONTROLS TOOLBAR */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginBottom: "20px", background: "rgba(255, 255, 255, 0.03)", padding: "15px", borderRadius: "12px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: "1 1 250px", background: "rgba(0,0,0,0.2)", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)" }}>
            <LuSearch size={18} color="#94a3b8" />
            <input 
              type="text" 
              placeholder="Search by name or email..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ background: "transparent", border: "none", color: "white", outline: "none", width: "100%" }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <LuFilter size={16} color="#94a3b8" />
            <select 
              value={roleFilter} 
              onChange={(e) => setRoleFilter(e.target.value)}
              style={{ background: "#1e293b", color: "white", border: "1px solid #334155", padding: "8px 12px", borderRadius: "8px", outline: "none" }}
            >
              <option value="all">All Roles</option>
              <option value="admin">Admins Only</option>
              <option value="user">Users Only</option>
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <select 
              value={statusFilter} 
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ background: "#1e293b", color: "white", border: "1px solid #334155", padding: "8px 12px", borderRadius: "8px", outline: "none" }}
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="suspended">Suspended Only</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {loading ? (
          <div className="loading-message">Loading directory...</div>
        ) : (
          <div className="table-container">
            <table className="user-table">
              <thead className="table-head">
                <tr>
                  <th className="th-base">Name</th>
                  <th className="th-base">Email</th>
                  <th className="th-base">Role</th>
                  <th className="th-base">Status</th>
                  <th className="th-actions">Actions (Secured)</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.email} className="tr-body">
                    <td className="td-name">{user.name || "Unnamed"}</td>
                    <td className="td-email">{user.email}</td>
                    <td className="td-base">
                      {user.isAdmin ? (
                        <span className="role-badge role-admin">
                          <LuShield size={14} /> Admin
                        </span>
                      ) : (
                        <span className="role-badge role-user">
                          <LuUser size={14} /> User
                        </span>
                      )}
                    </td>
                    <td className="td-base">
                      {user.status === "Suspended" ? (
                        <span className="status-badge status-suspended">
                          <LuBan size={14} /> Suspended
                        </span>
                      ) : (
                        <span className="status-badge status-active">
                          <LuCheck size={14} /> Active
                        </span>
                      )}
                    </td>
                    <td className="td-actions">
                      <div className="actions-container">
                        <button 
                          onClick={() => handleStatusToggle(user.email, user.status)}
                          title={user.status === "Active" ? "Suspend Account" : "Activate Account"}
                          className={`action-btn ${user.status === "Active" ? "btn-toggle-active" : "btn-toggle-suspended"}`}
                        >
                          {user.status === "Active" ? <LuBan size={16} /> : <LuCheck size={16} />}
                        </button>
                        <button 
                          onClick={() => handleDelete(user.email)}
                          title="Delete Account (Requires Admin Password Re-entry)"
                          className="action-btn btn-delete"
                        >
                          <LuTrash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && !loading && (
                  <tr>
                    <td colSpan="5" className="no-users-cell">
                      No matching user accounts discovered.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminUserManagement;