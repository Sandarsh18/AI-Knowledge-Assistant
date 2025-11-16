// Purpose: Main screen — handles auth, document upload, and chat lifecycle for Azure PDF Chat.
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import TopBar from './components/TopBar'
import UploadCard from './components/UploadCard'
import ChatPanel from './components/ChatPanel'
import HistoryDrawer from './components/HistoryDrawer'
import { getUser, login, logout, type AuthUser } from './lib/auth'
import { ask, getHistory } from './lib/api'
import type { ChatMessage, DocumentSummary, HistoryItemPayload } from './lib/types'

const mapHistoryItem = (item: HistoryItemPayload): ChatMessage => ({
  id: item.id,
  role: item.role,
  content: item.content,
  timestamp: item.timestamp,
  docId: item.doc_id,
})

const App: React.FC = () => {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [activeDocId, setActiveDocId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isHistoryLoading, setIsHistoryLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [hasBackend, setHasBackend] = useState(true)

  const activeDocument = useMemo(
    () => documents.find((doc) => doc.docId === activeDocId) ?? null,
    [documents, activeDocId],
  )

  // Check backend availability + authentication
  useEffect(() => {
    const initApp = async () => {
      try {
        const backendUrl = import.meta.env.VITE_API_URL ?? '/api'
        const healthRes = await fetch(`${backendUrl}/health`)
        if (!healthRes.ok) throw new Error('Backend not reachable')
        setHasBackend(true)
      } catch {
        setHasBackend(false)
        console.warn('⚠️ Backend unavailable — running in mock/offline mode')
      }

      const currentUser = await getUser()
      setUser(currentUser)
      setIsCheckingAuth(false)
    }
    initApp()
  }, [])

  // Hydrate chat history when user/document changes
  useEffect(() => {
    if (!user || !activeDocId) {
      setMessages([])
      return
    }

    const hydrateHistory = async () => {
      setIsHistoryLoading(true)
      try {
        const history = await getHistory(user.userId, activeDocId)
        const mapped = history.items.map(mapHistoryItem)
        setMessages(mapped)
      } catch (error) {
        console.error('[history] Failed to load chat history', error)
        setNotice({ type: 'error', text: 'Unable to load chat history right now.' })
      } finally {
        setIsHistoryLoading(false)
      }
    }

    hydrateHistory()
  }, [user, activeDocId])

  // Auto-dismiss success/error toasts
  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(null), 3500)
    return () => window.clearTimeout(timeout)
  }, [notice])

  // Handle new upload
  const handleUploaded = useCallback((document: DocumentSummary) => {
    setDocuments((prev) => {
      const exists = prev.some((item) => item.docId === document.docId)
      if (exists) return prev
      return [document, ...prev]
    })
    setActiveDocId(document.docId)
    setNotice({ type: 'success', text: `Uploaded "${document.fileName}" successfully.` })
  }, [])

  // Handle question submission
  const handleSend = useCallback(
    async (question: string) => {
      if (!user || !activeDocId) {
        setNotice({ type: 'error', text: 'Select a document before asking a question.' })
        return
      }
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: question,
        timestamp: new Date().toISOString(),
        docId: activeDocId,
      }
      setMessages((prev) => [...prev, userMessage])
      setIsSending(true)

      try {
        const { answer } = await ask(user.userId, activeDocId, question)
        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: answer,
          timestamp: new Date().toISOString(),
          docId: activeDocId,
        }
        setMessages((prev) => [...prev, assistantMessage])
      } catch (error) {
        console.error('[ask] Failed to submit question', error)
        setNotice({ type: 'error', text: 'We could not fetch an answer. Please retry.' })
      } finally {
        setIsSending(false)
      }
    },
    [user, activeDocId],
  )

  const handleSelectDocument = useCallback((docId: string) => setActiveDocId(docId), [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 pb-16 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <TopBar user={user} onLogin={login} onLogout={logout} />

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-8 sm:px-6 lg:px-8">
        {!hasBackend ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
            ⚠️ Backend service is offline. PDF uploads and AI chat will not work until the FastAPI app is running.
          </div>
        ) : null}

        {notice ? (
          <div
            role="status"
            className={`rounded-3xl border px-5 py-4 text-sm shadow-lg backdrop-blur ${
              notice.type === 'success'
                ? 'border-emerald-200 bg-emerald-50/80 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200'
                : 'border-rose-200 bg-rose-50/80 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200'
            }`}
          >
            {notice.text}
          </div>
        ) : null}

        {isCheckingAuth ? (
          <section className="flex flex-1 items-center justify-center py-20">
            <div className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-white/80 px-6 py-4 text-sm text-slate-600 shadow-xl backdrop-blur dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
              <span className="h-2 w-2 animate-ping rounded-full bg-brand-500" />
              Checking sign-in status...
            </div>
          </section>
        ) : null}

        {!isCheckingAuth && !user ? (
          <section className="flex flex-1 items-center justify-center pb-12 pt-6">
            <div className="glass-card max-w-xl text-center">
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
                Welcome to Azure PDF Chat
              </h2>
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                Sign in with your Azure AD account to upload PDFs and receive grounded answers powered by Gemini Flash.
              </p>
              <button
                type="button"
                onClick={login}
                className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand-600 to-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-xl transition hover:scale-105 hover:shadow-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
              >
                Login with Azure AD
              </button>
            </div>
          </section>
        ) : null}

        {!isCheckingAuth && user ? (
          <>
            <UploadCard userId={user.userId} onUploaded={handleUploaded} />
            <section className="grid grid-cols-1 gap-6 pb-16 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <ChatPanel
                messages={messages}
                onSend={handleSend}
                disabled={!activeDocument || isSending}
                isLoading={isSending}
                activeDocument={activeDocument}
                isHistoryLoading={isHistoryLoading}
              />
              <HistoryDrawer
                documents={documents}
                activeDocId={activeDocId}
                onSelect={handleSelectDocument}
              />
            </section>
          </>
        ) : null}
      </main>

      <footer className="mx-auto w-full max-w-6xl px-4 pb-10 text-center text-xs text-slate-500 dark:text-slate-400 sm:px-6 lg:px-8">
        Built with ❤️ using Azure Static Web Apps, Azure App Service, and Gemini Flash.
      </footer>
    </div>
  )
}

export default App
