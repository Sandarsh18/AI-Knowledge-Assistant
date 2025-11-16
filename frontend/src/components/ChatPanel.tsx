// Purpose: Render the conversational interface for asking PDF-grounded questions.
import React, { useEffect, useRef, useState } from 'react'
import { Loader2, Send, Sparkles, Bot, User } from 'lucide-react'
import { ask, getHistory } from '../lib/api'
import type { ChatMessage, DocumentSummary } from '../lib/types'

interface ChatPanelProps {
  messages: ChatMessage[]
  onSend: (question: string) => Promise<void> | void
  disabled: boolean
  isLoading: boolean
  activeDocument: DocumentSummary | null
  isHistoryLoading: boolean
}

const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  onSend,
  disabled,
  isLoading,
  activeDocument,
  isHistoryLoading,
}) => {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = scrollRef.current
    if (container) {
      container.scrollTop = container.scrollHeight
    }
  }, [messages, isLoading])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = input.trim()
    if (!trimmed || disabled || isLoading) {
      return
    }
    setInput('')
    await onSend(trimmed)
  }

  const emptyState = (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center text-slate-500 dark:text-slate-400">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-600/10 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
        <Sparkles className="h-8 w-8" />
      </div>
      <div>
        <p className="text-base font-semibold">Upload a PDF to get started</p>
        <p className="text-sm">
          Once your document is ready, ask anything about it and Gemini Flash will respond using only its contents.
        </p>
      </div>
    </div>
  )

  return (
    <div className="glass-card flex h-[32rem] flex-col">
      <header className="flex items-center justify-between rounded-2xl bg-white/70 px-5 py-4 text-sm text-slate-600 shadow-inner dark:bg-slate-900/70 dark:text-slate-300">
        <div>
          <p className="font-semibold text-slate-700 dark:text-slate-100">Chat</p>
          <p className="text-xs">
            {activeDocument ? `Asking about: ${activeDocument.fileName}` : 'Select a document to begin.'}
          </p>
        </div>
        {isHistoryLoading && (
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading history...
          </div>
        )}
      </header>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-1 py-5">
        {messages.length === 0 ? (
          emptyState
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-xl rounded-3xl px-4 py-3 text-sm shadow-md ${
                  message.role === 'user'
                    ? 'bg-gradient-to-r from-brand-600 to-indigo-500 text-white'
                    : 'bg-white/80 text-slate-800 dark:bg-slate-800/80 dark:text-slate-100'
                }`}
              >
                <div className="mb-1 flex items-center gap-2 text-xs opacity-75">
                  {message.role === 'user' ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                  <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
                </div>
                <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
              </div>
            </div>
          ))
        )}
        {isLoading ? (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-3xl bg-white/60 px-4 py-3 text-sm text-slate-600 shadow-md dark:bg-slate-900/60 dark:text-slate-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              Thinking with Gemini...
            </div>
          </div>
        ) : null}
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-4 flex items-center gap-3 rounded-2xl bg-white/70 px-4 py-3 shadow-inner dark:bg-slate-900/70"
      >
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={
            activeDocument ? 'Ask a question about this PDF...' : 'Upload a PDF to start asking questions.'
          }
          disabled={disabled}
          className="flex-1 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm transition focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:cursor-not-allowed dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-brand-400 dark:focus:ring-brand-500/40"
        />
        <button
          type="submit"
          disabled={disabled || !input.trim() || isLoading}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-r from-brand-600 to-indigo-500 text-white shadow-lg transition hover:scale-105 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Send question"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
    </div>
  )
}

export default ChatPanel
