/**
 * Root layout component orchestrating the chat experience.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TopBar from "./components/TopBar";
import UploadCard, { UploadCardHandle } from "./components/UploadCard";
import ChatPanel, { UploadRequestOptions } from "./components/ChatPanel";
import HistoryDrawer from "./components/HistoryDrawer";
import LoginPage from "./components/LoginPage";
import SignupPage from "./components/SignupPage";
import {
  getUser,
  loginWithCredentials,
  signupWithCredentials,
  AuthUser,
  updateLocalProfile,
  canEditProfile
} from "./lib/auth";
import { DocumentItem, listDocuments } from "./lib/api";
import "./styles/index.css";

const formatRelativeTime = (value: string) => {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return null;
  }

  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const diffInSeconds = Math.round((timestamp - Date.now()) / 1000);
  const absoluteSeconds = Math.abs(diffInSeconds);

  if (absoluteSeconds < 60) {
    return formatter.format(diffInSeconds, "second");
  }
  const diffInMinutes = Math.round(diffInSeconds / 60);
  if (Math.abs(diffInMinutes) < 60) {
    return formatter.format(diffInMinutes, "minute");
  }
  const diffInHours = Math.round(diffInMinutes / 60);
  if (Math.abs(diffInHours) < 24) {
    return formatter.format(diffInHours, "hour");
  }
  const diffInDays = Math.round(diffInHours / 24);
  if (Math.abs(diffInDays) < 30) {
    return formatter.format(diffInDays, "day");
  }
  const diffInMonths = Math.round(diffInDays / 30);
  if (Math.abs(diffInMonths) < 12) {
    return formatter.format(diffInMonths, "month");
  }
  const diffInYears = Math.round(diffInMonths / 12);
  return formatter.format(diffInYears, "year");
};

const App: React.FC = () => {
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authView, setAuthView] = useState<"login" | "signup">("login");
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [documentsStatus, setDocumentsStatus] = useState<string | null>(null);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [isUploaderVisible, setIsUploaderVisible] = useState(true);
  const [allowProfileEdit, setAllowProfileEdit] = useState(false);
  const uploadCardRef = useRef<UploadCardHandle | null>(null);

  const activeDocument = useMemo(() => {
    if (!activeDocId) {
      return null;
    }
    return documents.find((doc) => doc.id === activeDocId) ?? null;
  }, [activeDocId, documents]);

  const activeDocumentUploadedLabel = useMemo(() => {
    if (!activeDocument) {
      return null;
    }
    return formatRelativeTime(activeDocument.created_at) ?? new Date(activeDocument.created_at).toLocaleString();
  }, [activeDocument]);

  useEffect(() => {
    const checkAuth = async () => {
      const currentUser = await getUser();
      setUser(currentUser);
      setAuthLoading(false);
      setAllowProfileEdit(canEditProfile());
    };
    void checkAuth();
  }, []);

  const handleDocumentSelect = (docId: string) => {
    setActiveDocId(docId);
    setIsUploaderVisible(false);
  };

  const refreshDocuments = useCallback(async () => {
    if (!user) {
      setDocuments([]);
      setDocumentsStatus("Login to view your documents.");
      return;
    }
    try {
      setDocumentsLoading(true);
      setDocumentsStatus("Loading documents...");
      const items = await listDocuments(user.userId);
      setDocuments(items);
      setDocumentsStatus(items.length === 0 ? "No documents yet. Upload your first PDF." : null);
    } catch (error) {
      console.error(error);
      setDocumentsStatus("Unable to load documents.");
    } finally {
      setDocumentsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      void refreshDocuments();
    } else {
      setDocuments([]);
      setDocumentsStatus("Login to view your documents.");
    }
  }, [user, refreshDocuments]);

  const handleLogin = async (email: string, password: string) => {
    await loginWithCredentials(email, password);
    const currentUser = await getUser();
    setUser(currentUser);
  };

  const handleSignup = async (email: string, password: string, name: string) => {
    await signupWithCredentials(email, password, name);
    const currentUser = await getUser();
    setUser(currentUser);
  };

  const handleDocumentUploaded = async (docId: string) => {
    await refreshDocuments();
    setActiveDocId(docId);
    setIsUploaderVisible(false);
  };

  const handleOpenDocument = (docId: string) => {
    setActiveDocId(docId);
    setIsUploaderVisible(false);
  };

  const handleNewChat = () => {
    setActiveDocId(null);
    setIsUploaderVisible(true);
  };

  const handleShowUploader = (options?: UploadRequestOptions) => {
    setIsUploaderVisible(true);
    if (options?.openPicker) {
      requestAnimationFrame(() => uploadCardRef.current?.openFileDialog());
    }
  };

  const handleProfileUpdate = async (name: string) => {
    try {
      const updated = await updateLocalProfile({ name });
      setUser(updated);
    } catch (error) {
      console.error(error);
    }
  };

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100 dark:bg-slate-950">
        <div className="text-center">
          <div className="mb-4 flex justify-center">
            <span className="logo-orb animate-pulse" aria-hidden="true" />
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    if (authView === "signup") {
      return (
        <SignupPage
          onSignup={handleSignup}
          onSwitchToLogin={() => setAuthView("login")}
        />
      );
    }
    return (
      <LoginPage
        onLogin={handleLogin}
        onSwitchToSignup={() => setAuthView("signup")}
      />
    );
  }

  return (
    <div className="app-shell">
      <TopBar />
      <div className="app-body">
        <HistoryDrawer
          user={user}
          documents={documents}
          status={documentsStatus}
          isLoading={documentsLoading}
          onSelect={handleDocumentSelect}
          activeDocId={activeDocId}
          onUpdateProfile={allowProfileEdit ? handleProfileUpdate : undefined}
        />
        <main className="workspace">
          <div className="workspace-header glass-panel">
            <div className="workspace-headline">
              <span className="workspace-pill" aria-live="polite">
                {activeDocument ? "Active document" : "Welcome"}
              </span>
              <h2 className="workspace-title">
                {activeDocument ? activeDocument.file_name : "Chat with your PDFs"}
              </h2>
              <p className="workspace-subtitle">
                {activeDocument
                  ? `Uploaded ${activeDocumentUploadedLabel}. Continue asking grounded questions or start fresh anytime.`
                  : "Upload a PDF or open one from the library to get grounded answers, citations, and summaries."}
              </p>
            </div>
            <div className="workspace-actions">
              <button
                type="button"
                className="action-btn action-btn--primary"
                onClick={() => handleShowUploader({ openPicker: true })}
              >
                Upload a PDF
              </button>
              <button
                type="button"
                className="action-btn action-btn--ghost"
                onClick={handleNewChat}
                disabled={!activeDocId}
              >
                Start fresh chat
              </button>
            </div>
          </div>

          <div className="workspace-stage">
            {isUploaderVisible && (
              <UploadCard
                ref={uploadCardRef}
                onUploaded={handleDocumentUploaded}
                onOpenDocument={handleOpenDocument}
              />
            )}
            <ChatPanel
              activeDocId={activeDocId}
              activeDocument={activeDocument}
              onRequestUpload={handleShowUploader}
            />
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;