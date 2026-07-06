import { useEffect, useState } from "react";
import {
    LuBan,
    LuCheckCircle,
    LuRefreshCw,
    LuShield,
    LuTrash2,
    LuUser,
    LuUsers
} from "react-icons/lu";
import DashboardHeader from "../components/DashboardHeader"; // Adjust path if necessary
import "../styles/AdminUserManagement.css";

const AdminUserManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("http://localhost:8000/api/admin/users", {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to fetch users");
      
      setUsers(data.users || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleStatusToggle = async (email, currentStatus) => {
    const newStatus = currentStatus === "Active" ? "Suspended" : "Active";
    if (!window.confirm(`Are you sure you want to change this account's status to ${newStatus}?`)) return;

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`http://localhost:8000/api/admin/users/${email}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to update status");

      // Update local state to reflect the change immediately
      setUsers(users.map(user => 
        user.email === email ? { ...user, status: newStatus } : user
      ));
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleDelete = async (email) => {
    if (!window.confirm("WARNING: Are you sure you want to permanently delete this account? This action cannot be undone.")) return;

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`http://localhost:8000/api/admin/users/${email}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to delete user");

      // Remove the deleted user from local state
      setUsers(users.filter(user => user.email !== email));
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  return (
    <div className="admin-dashboard-container">
      <DashboardHeader />
      
      <main className="main-content">
        <div className="header-container">
          <h1 className="page-title">
            <LuUsers size={28} color="#3b82f6" /> User Management
          </h1>
          <button 
            onClick={fetchUsers}
            className="refresh-btn"
          >
            <LuRefreshCw size={16} /> Refresh
          </button>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {loading ? (
          <div className="loading-message">Loading users...</div>
        ) : (
          <div className="table-container">
            <table className="user-table">
              <thead className="table-head">
                <tr>
                  <th className="th-base">Name</th>
                  <th className="th-base">Email</th>
                  <th className="th-base">Role</th>
                  <th className="th-base">Status</th>
                  <th className="th-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.email} className="tr-body">
                    <td className="td-name">{user.name}</td>
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
                          <LuCheckCircle size={14} /> Active
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
                          {user.status === "Active" ? <LuBan size={16} /> : <LuCheckCircle size={16} />}
                        </button>
                        <button 
                          onClick={() => handleDelete(user.email)}
                          title="Delete Account"
                          className="action-btn btn-delete"
                        >
                          <LuTrash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && !loading && (
                  <tr>
                    <td colSpan="5" className="no-users-cell">
                      No users found.
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