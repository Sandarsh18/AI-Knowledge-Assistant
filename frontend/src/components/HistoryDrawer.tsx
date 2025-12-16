/**
 * Drawer component listing uploaded documents with cyberpunk enhancements.
 */
import React from "react";
import "../styles/index.css";
import { DocumentItem } from "../lib/api";
import { AuthUser } from "../lib/auth";
import ProfileCard from "./ProfileCard";

interface HistoryDrawerProps {
  onSelect: (docId: string) => void;
  activeDocId: string | null;
  documents: DocumentItem[];
  status: string | null;
  isLoading: boolean;
  user: AuthUser | null;
  onUpdateProfile?: (name: string) => Promise<void>;
}

const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  onSelect,
  activeDocId,
  documents,
  status,
  isLoading,
  user,
  onUpdateProfile
}) => {

  return (
    <aside className="history-drawer glass-panel grid-noise">
      <ProfileCard
        user={user}
        documentCount={documents.length}
        onUpdateName={onUpdateProfile}
      />

      <div>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              Library
            </h2>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Select a document to revisit your conversation.
            </p>
          </div>
          {isLoading && (
            <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Syncing…</span>
          )}
        </div>
      </div>

      <div className="history-scroller cyber-scroll">
        {documents.map((doc, index) => {
          const isActive = activeDocId === doc.id;
          const delay = `${Math.min(index, 6) * 0.05}s`;
          return (
            <button
              key={doc.id}
              type="button"
              onClick={() => onSelect(doc.id)}
              className={`history-item ${isActive ? "history-item-active" : ""}`}
              style={{ animationDelay: delay }}
              aria-pressed={isActive}
            >
              <span className="line-clamp-1 text-sm font-medium">{doc.file_name}</span>
              <span>{new Date(doc.created_at).toLocaleString()}</span>
            </button>
          );
        })}

        {documents.length === 0 && !status && (
          <div className="history-empty">
            <p>Drop a PDF to begin your cyber journey.</p>
          </div>
        )}
      </div>

      {status && (
        <p className="text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
          {status}
        </p>
      )}
    </aside>
  );
};

export default HistoryDrawer;