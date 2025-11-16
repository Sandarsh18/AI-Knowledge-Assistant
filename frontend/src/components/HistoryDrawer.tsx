// Purpose: Display a switcher for previously uploaded documents.
import React from 'react'
import { Clock3, FileText, ExternalLink } from 'lucide-react'
import type { DocumentSummary } from '../lib/types'

interface HistoryDrawerProps {
  documents: DocumentSummary[]
  activeDocId: string | null
  onSelect: (docId: string) => void
}

const HistoryDrawer: React.FC<HistoryDrawerProps> = ({ documents, activeDocId, onSelect }) => {
  if (documents.length === 0) {
    return (
      <aside className="glass-card flex h-[32rem] flex-col items-center justify-center gap-3 text-center text-slate-500 dark:text-slate-400">
        <Clock3 className="h-8 w-8" />
        <p className="text-sm">No documents yet. Upload a PDF to start building your chat history.</p>
      </aside>
    )
  }

  return (
    <aside className="glass-card h-[32rem] overflow-hidden">
      <header className="rounded-2xl bg-white/70 px-5 py-4 text-sm font-semibold text-slate-700 shadow-inner dark:bg-slate-900/70 dark:text-slate-100">
        Your PDFs
      </header>
      <div className="space-y-3 overflow-y-auto px-4 py-5">
        {documents.map((doc) => {
          const isActive = doc.docId === activeDocId
          return (
            <button
              key={doc.docId}
              type="button"
              onClick={() => onSelect(doc.docId)}
              className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                isActive
                  ? 'border-brand-400 bg-brand-50/80 shadow-lg dark:border-brand-500/60 dark:bg-brand-500/10'
                  : 'border-transparent bg-white/70 shadow-sm hover:shadow-md dark:bg-slate-900/60'
              }`}
            >
              <div className="flex items-center justify-between text-sm text-slate-700 dark:text-slate-200">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  <span className="font-semibold">{doc.fileName}</span>
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {new Date(doc.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Doc ID: {doc.docId.slice(0, 8)}...</span>
                <a
                  href={doc.blobUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-brand-600 hover:underline dark:text-brand-300"
                >
                  Open <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </button>
          )
        })}
      </div>
    </aside>
  )
}

export default HistoryDrawer
