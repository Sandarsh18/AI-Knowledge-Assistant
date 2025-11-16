// Purpose: Shared TypeScript interfaces for frontend state management.
export interface DocumentSummary {
  docId: string
  fileName: string
  blobUrl: string
  createdAt: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  docId: string
}

export interface UploadPayload {
  doc_id: string
  file_name: string
  blob_url: string
  created_at: string
}

export interface HistoryItemPayload {
  id: string
  type: 'message'
  user_id: string
  doc_id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface ChatHistoryResponse {
  items: HistoryItemPayload[]
}