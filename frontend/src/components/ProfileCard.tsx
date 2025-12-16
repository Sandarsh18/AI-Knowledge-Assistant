/**
 * Displays authenticated user information with quick stats.
 */
import React, { useEffect, useMemo, useState } from "react";
import { AuthUser } from "../lib/auth";

interface ProfileCardProps {
  user: AuthUser | null;
  documentCount: number;
  onUpdateName?: (name: string) => Promise<void>;
}

const ProfileCard: React.FC<ProfileCardProps> = ({ user, documentCount, onUpdateName }) => {
  const initials = useMemo(() => {
    const source = user?.name || user?.userDetails || "Guest";
    const segments = source.trim().split(/\s+/).slice(0, 2);
    return segments.map((segment) => segment.charAt(0).toUpperCase()).join("") || "?";
  }, [user]);

  const displayName = user?.name || user?.userDetails || "Guest";
  const emailAddress = user?.userDetails || "No email on file";
  const statusLabel = user ? "Active session" : "Guest mode";
  const description = user ? "Signed in securely" : "Sign in to sync uploads across devices.";
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(displayName);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDraftName(displayName);
  }, [displayName]);

  const handleSave = async () => {
    if (!onUpdateName) {
      return;
    }
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === displayName) {
      setIsEditing(false);
      return;
    }
    try {
      setIsSaving(true);
      await onUpdateName(trimmed);
      setIsEditing(false);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setDraftName(displayName);
    setIsEditing(false);
  };

  return (
    <div className="profile-card">
      <div className="profile-card-accent" aria-hidden="true" />
      <div className="profile-card-header">
        <div className="profile-avatar" aria-hidden="true">
          {initials}
        </div>
        <div className="profile-info">
          <p className="profile-name">{displayName}</p>
          <p className="profile-email">{emailAddress}</p>
        </div>
        {onUpdateName && !isEditing && (
          <button
            type="button"
            className="profile-edit-trigger"
            onClick={() => setIsEditing(true)}
          >
            Customize
          </button>
        )}
      </div>

      {isEditing ? (
        <div className="profile-edit-panel">
          <label className="profile-edit-label" htmlFor="profile-name">
            Display name
          </label>
          <div className="profile-edit-row">
            <input
              id="profile-name"
              className="profile-edit-input"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              placeholder="Your display name"
            />
            <div className="profile-edit-actions">
              <button
                type="button"
                className="profile-edit-save"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? "Saving" : "Save"}
              </button>
              <button
                type="button"
                className="profile-edit-cancel"
                onClick={handleCancel}
                disabled={isSaving}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="profile-stats">
          <div className="profile-stat">
            <span className="profile-stat-label">Uploads</span>
            <span className="profile-stat-value">{documentCount}</span>
          </div>
          <div className="profile-stat profile-stat--status">
            <span className="profile-stat-label">Status</span>
            <span className="profile-stat-value">{statusLabel}</span>
          </div>
        </div>
      )}

      <p className="profile-footnote">{description}</p>
    </div>
  );
};

export default ProfileCard;
