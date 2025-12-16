/**
 * Card component handling PDF uploads with premium theming and drag-drop support.
 */
import React, {
  ChangeEvent,
  DragEvent,
  forwardRef,
  useImperativeHandle,
  useRef,
  useState
} from "react";
import "../styles/index.css";
import { uploadPdf } from "../lib/api";
import { getUser } from "../lib/auth";

interface UploadCardProps {
  onUploaded: (docId: string) => void;
  onOpenDocument?: (docId: string) => void;
}

const MAX_FILE_SIZE_MB = 25;
const ACCEPTED_TYPES = ["application/pdf"];

type StatusTone = "idle" | "info" | "success" | "error";

export interface UploadCardHandle {
  openFileDialog: () => void;
}

const UploadCard = forwardRef<UploadCardHandle, UploadCardProps>(({ onUploaded, onOpenDocument }, ref) => {
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<StatusTone>("idle");
  const [isDragging, setIsDragging] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [lastUploaded, setLastUploaded] = useState<{ id: string; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useImperativeHandle(ref, () => ({
    openFileDialog: () => {
      fileInputRef.current?.click();
    }
  }));

  const resetInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const processFile = async (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setStatus("Please upload a valid PDF document.");
      setStatusType("error");
      setIsCollapsed(false);
      resetInput();
      return;
    }

    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setStatus("File is too large. Maximum allowed size is 25 MB.");
      setStatusType("error");
      setIsCollapsed(false);
      resetInput();
      return;
    }

    const user = await getUser();
    if (!user) {
      setStatus("Authentication required. Please log in.");
      setStatusType("error");
      setIsCollapsed(false);
      resetInput();
      return;
    }

    try {
      setIsCollapsed(false);
      setIsLoading(true);
      setStatus("Uploading your document...");
      setStatusType("info");
      const response = await uploadPdf(file, user.userId);
      setStatusType("success");
      setLastUploaded({ id: response.doc_id, name: response.file_name });
      setIsCollapsed(true);
      onUploaded(response.doc_id);
    } catch (error) {
      console.error(error);
      setStatus("Upload failed. Please try again.");
      setStatusType("error");
      setIsCollapsed(false);
    } finally {
      setIsLoading(false);
      resetInput();
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    await processFile(file);
  };

  const handleDragOver = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) {
      return;
    }
    await processFile(file);
  };

  const handleExpandRequest = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsCollapsed(false);
  };

  const handleOpenLastUploaded = () => {
    if (lastUploaded?.id && onOpenDocument) {
      onOpenDocument(lastUploaded.id);
    }
  };

  const chipTone =
    statusType === "success"
      ? "status-chip-success"
      : statusType === "error"
        ? "status-chip-error"
        : statusType === "info"
          ? "status-chip-info"
          : "";

  const statusIndicatorClass =
    statusType === "success"
      ? "bg-emerald-500 dark:bg-emerald-300"
      : statusType === "error"
        ? "bg-rose-500 dark:bg-rose-300"
        : "bg-blue-500 dark:bg-cyan-300";

  return (
    <section className={`glass-panel interactive-card grid-noise ${isCollapsed ? "upload-card-collapsed" : ""}`}>
      <div className="flex flex-col gap-5">
        <div className="neon-divider pb-2">
          <h2 className="text-2xl font-semibold">Document Uploader</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Securely upload a PDF (up to 25 MB) and unlock grounded question answering.
          </p>
        </div>

        <label
          className={`dropzone ${isDragging ? "dropzone-active" : ""} ${isCollapsed ? "dropzone-collapsed" : ""}`}
          onDragOver={handleDragOver}
          onDragEnter={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              (event.currentTarget.querySelector("input") as HTMLInputElement | null)?.click();
            }
          }}
        >
          <div className={`dropzone-icon ${isCollapsed ? "dropzone-icon-compact" : ""} ${isCollapsed ? "" : "animate-float-soft"}`}>
            <svg
              className="h-7 w-7 text-blue-500 dark:text-blue-300"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 19V5" />
              <path d="M5 12l7-7 7 7" />
              <path d="M5 19h14" />
            </svg>
          </div>
          <div className={isCollapsed ? "flex w-full flex-col gap-2 text-left sm:flex-row sm:items-center sm:justify-between" : "space-y-2 text-center"}>
            {isCollapsed ? (
              <>
                <div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Upload another PDF or drop a file here.
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Last uploaded: {lastUploaded?.name ?? "—"}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  {lastUploaded?.id && (
                    <button
                      type="button"
                      onClick={handleOpenLastUploaded}
                      className="rounded-full border border-emerald-500/60 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 shadow-sm transition hover:border-emerald-500 hover:bg-emerald-500/20 dark:border-emerald-400/60 dark:bg-emerald-500/10 dark:text-emerald-200"
                    >
                      Open in chat
                    </button>
                  )}
                  <button
                    type="button"
                    className="rounded-full border border-blue-500/60 bg-white px-3 py-1 text-xs font-semibold text-blue-700 shadow-sm transition hover:border-rose-500 hover:text-rose-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    onClick={handleExpandRequest}
                  >
                    Expand view
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Drag & drop your PDF here or click to browse.
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Only .pdf files are supported. Maximum size: 25 MB.
                </p>
              </>
            )}
          </div>
          <input
            ref={fileInputRef}
            className="hidden"
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
            disabled={isLoading}
          />
        </label>

        {status && (
          <div className={`status-chip ${chipTone}`} aria-live="polite">
            <span className={`inline-flex h-2 w-2 rounded-full ${statusIndicatorClass} animate-pulse`} />
            {status}
          </div>
        )}

        {isLoading && (
          <div className="h-1 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div className="h-full w-1/2 animate-gradient-flow bg-gradient-to-r from-blue-500 via-blue-400 to-blue-500" />
          </div>
        )}
      </div>
    </section>
  );
});

UploadCard.displayName = "UploadCard";

export default UploadCard;
