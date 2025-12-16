/**
 * Chat interface component with enhanced theming and animated interactions.
 */
import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import "../styles/index.css";
import { ask, getHistory, Message, DocumentItem } from "../lib/api";
import { getUser } from "../lib/auth";

export interface UploadRequestOptions {
  openPicker?: boolean;
}

interface ChatPanelProps {
  activeDocId: string | null;
  activeDocument?: DocumentItem | null;
  onRequestUpload?: (options?: UploadRequestOptions) => void;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ activeDocId, activeDocument, onRequestUpload }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const sortedMessages = useMemo(
    () =>
      [...messages].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      ),
    [messages]
  );

  useEffect(() => {
    const fetchHistory = async () => {
      if (!activeDocId) {
        setMessages([]);
        setStatus(null);
        return;
      }
      const user = await getUser();
      if (!user) {
        setStatus("Login required to load chat history.");
        return;
      }
      try {
        setStatus("Loading conversation...");
        const history = await getHistory(user.userId, activeDocId);
        setMessages(history);
        setStatus(null);
      } catch (error) {
        console.error(error);
        setStatus("Failed to load conversation.");
      }
    };
    void fetchHistory();
  }, [activeDocId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sortedMessages, isStreaming]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!question.trim() || !activeDocId) {
      return;
    }

    const user = await getUser();
    if (!user) {
      setStatus("Login required to ask questions.");
      return;
    }

    const payload = question.trim();
    const optimisticMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: payload,
      timestamp: new Date().toISOString(),
      doc_id: activeDocId,
      user_id: user.userId
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setQuestion("");
    setIsStreaming(true);
    setStatus(null);

    try {
      const response = await ask(user.userId, activeDocId, payload);
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: response.answer,
        timestamp: new Date().toISOString(),
        doc_id: activeDocId,
        user_id: user.userId
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error(error);
      let errorMsg = "Unable to fetch answer.";
      
      // Extract detailed error message from API response
      if (error?.response?.data?.detail) {
        errorMsg = error.response.data.detail;
      } else if (error?.response?.status === 503) {
        errorMsg = "AI service temporarily unavailable. Please try again in a moment.";
      } else if (error?.response?.status === 502) {
        errorMsg = "Service error. Please try again.";
      } else if (error?.message) {
        errorMsg = error.message;
      }
      
      setStatus(errorMsg);
      
      // Auto-clear error after 8 seconds
      setTimeout(() => setStatus(null), 8000);
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <section className="glass-panel chat-panel">
      <div className="chat-scroll cyber-scroll">
        {!activeDocId && (
          <div className="chat-empty">
            <div className="empty-icon" aria-hidden="true">
              <svg
                className="h-10 w-10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 12h.01" />
                <path d="M19 21H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6l2 2h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2Z" />
                <path d="M16 16h2" />
                <path d="M16 12h2" />
              </svg>
            </div>
            <h3>Ready when you are</h3>
            <p>
              Upload a PDF or pick one from the library to start a grounded conversation. Your chats stay linked to each document.
            </p>
            <div className="empty-actions">
              <button
                type="button"
                className="action-btn action-btn--primary"
                onClick={() => onRequestUpload?.({ openPicker: true })}
                disabled={!onRequestUpload}
              >
                Upload a PDF
              </button>
              <span className="empty-note">Need inspiration? Choose any document on the left.</span>
            </div>
          </div>
        )}

        {activeDocument && sortedMessages.length === 0 && (
          <div className="chat-intro">
            <span className="workspace-pill">Active PDF</span>
            <h3>{activeDocument.file_name}</h3>
            <p>
              Ask for highlights, decisions, or deep dives by section. You can always reset with a fresh chat when you need a new angle.
            </p>
          </div>
        )}

        {sortedMessages.map((message, index) => {
          const key = message.id ?? `${message.doc_id}-${index}`;
          const delay = `${Math.min(index, 6) * 0.04}s`;
          const bubbleClass = `message-bubble ${message.role === "assistant" ? "message-assistant" : "message-user"}`;

          return (
            <div key={key} className={`flex ${message.role === "assistant" ? "justify-start" : "justify-end"}`}>
              <div className={bubbleClass} style={{ animationDelay: delay }}>
                {message.content}
              </div>
            </div>
          );
        })}

        {isStreaming && (
          <div className="flex justify-start">
            <div className="message-bubble message-assistant flex items-center gap-3" style={{ animationDelay: "0s" }}>
              <div className="typing-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <span className="uppercase tracking-[0.2em] text-xs text-slate-500 dark:text-slate-400">Thinking</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="composer-shell">
        <form onSubmit={handleSubmit} className="flex w-full items-end gap-3">
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={
              activeDocId
                ? "Ask a question grounded in your PDF..."
                : "Select a document to begin."
            }
            className="composer-input"
            disabled={!activeDocId || isStreaming}
          />
          <button
            type="submit"
            disabled={!activeDocId || isStreaming || question.trim().length === 0}
            className="composer-send"
            aria-label="Send message"
          >
            <svg
              aria-hidden="true"
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22l-4-9-9-4Z" />
            </svg>
          </button>
        </form>
        {status && (
          <p className="mt-2 inline-flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-blue-500 dark:bg-cyan-300" />
            {status}
          </p>
        )}
      </div>
    </section>
  );
};

export default ChatPanel;