// frontend/src/components/LogoutConfirmModal.jsx
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";

export default function LogoutConfirmModal({ isOpen, onClose, onLogoutClick }) {
    const navigate = useNavigate();

    // If the modal isn't open, render nothing
    if (!isOpen) return null;

    const handleConfirm = () => {
        onClose(); // Close the modal

        // Execute passed prop if it exists
        if (onLogoutClick) {
            onLogoutClick();
        } else {
            // Otherwise, nuke the session and redirect securely
            localStorage.removeItem("user");
            sessionStorage.clear();
            // 'replace: true' kills the back button issue!
            navigate("/signin", { replace: true });
        }
    };

    // createPortal forces the modal to render over the whole app, 
    // bypassing any header CSS grids or flexboxes!
    return createPortal(
        <div style={overlayStyle}>
            <div style={contentStyle}>
                <h3 style={{ margin: "0 0 10px 0", color: "#333" }}>Sign Out</h3>
                <p style={{ margin: "0 0 20px 0", color: "#666", fontSize: "15px" }}>
                    Are you sure you want to sign out of AlgoBlocks?
                </p>
                <div style={actionStyle}>
                    <button onClick={onClose} style={cancelBtn}>Cancel</button>
                    <button onClick={handleConfirm} style={confirmBtn}>Sign Out</button>
                </div>
            </div>
        </div>,
        document.body
    );
}

// --- Safe, self-contained CSS ---
const overlayStyle = {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 99999, // Guarantees it floats over everything
};
const contentStyle = {
    background: "white", padding: "24px", borderRadius: "10px",
    width: "320px", textAlign: "center", fontFamily: "inherit",
    boxShadow: "0 10px 25px rgba(0,0,0,0.2)"
};
const actionStyle = {
    display: "flex", justifyContent: "space-between", gap: "12px"
};
const cancelBtn = {
    flex: 1, padding: "10px", borderRadius: "6px", border: "1px solid #ccc",
    background: "transparent", color: "#333", cursor: "pointer", fontWeight: "600"
};
const confirmBtn = {
    flex: 1, padding: "10px", borderRadius: "6px", border: "none",
    background: "#e74c3c", color: "white", cursor: "pointer", fontWeight: "600"
};