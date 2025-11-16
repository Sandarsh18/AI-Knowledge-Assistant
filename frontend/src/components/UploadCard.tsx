// Purpose: Provide the user interface for validating and uploading PDF documents.
import React, { useRef, useState } from 'react'
import { FileUp, Loader2 } from 'lucide-react'
import { uploadPdf } from '../lib/api'
import type { DocumentSummary, UploadPayload } from '../lib/types'

interface UploadCardProps {
  userId: string
  onUploaded: (document: DocumentSummary) => void
}

const MAX_FILE_SIZE_MB = 25

const UploadCard: React.FC<UploadCardProps> = ({ userId, onUploaded }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  const reset = () => {
    setSelectedFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      setSelectedFile(null)
      return
    }

    if (file.type !== 'application/pdf') {
      setError('Only PDF files are supported.')
      reset()
      return
    }

    const sizeMb = file.size / (1024 * 1024)
    if (sizeMb > MAX_FILE_SIZE_MB) {
      setError(`File exceeds the ${MAX_FILE_SIZE_MB}MB limit.`)
      reset()
      return
    }

    setError(null)
    setSelectedFile(file)
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Choose a PDF file before uploading.')
      return
    }

    setIsUploading(true)
    setError(null)

    try {
      const payload: UploadPayload = await uploadPdf(selectedFile, userId)
      const summary: DocumentSummary = {
        docId: payload.doc_id,
        fileName: payload.file_name,
        blobUrl: payload.blob_url,
        createdAt: payload.created_at,
      }
      onUploaded(summary)
      reset()
    } catch (err) {
      console.error('[upload] Failed to upload PDF', err)
      setError('Upload failed. Please try again in a moment.')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <section className="glass-card flex flex-col gap-4">
      <header className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600/90 text-white shadow-lg">
          <FileUp className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Upload a PDF</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            We store your file securely in Azure Blob Storage and only use it to answer your questions.
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/70 p-5 text-sm text-slate-600 shadow-sm transition dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          onChange={handleFileChange}
          className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm transition focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-brand-400 dark:focus:ring-brand-400/30"
        />
        {selectedFile ? (
          <div className="flex items-center justify-between rounded-xl bg-slate-100/80 px-4 py-2 text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
            <span className="font-medium">{selectedFile.name}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
            </span>
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Drag and drop not enabled in this MVP. Select a PDF up to {MAX_FILE_SIZE_MB}MB.
          </p>
        )}
      </div>

      {error ? (
        <p className="rounded-2xl bg-rose-500/10 px-4 py-3 text-sm text-rose-500 dark:bg-rose-500/20 dark:text-rose-200">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={handleUpload}
          disabled={!selectedFile || isUploading}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand-600 to-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:scale-105 hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isUploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Uploading...
            </>
          ) : (
            'Upload PDF'
          )}
        </button>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          ✅ Files stored in Azure Blob • 🔒 Chat history stored in Cosmos DB
        </p>
      </div>
    </section>
  )
}

export default UploadCard
