// Purpose: Axios client wrapper for interacting with the FastAPI backend.
import axios from 'axios'
import type { ChatHistoryResponse, UploadPayload } from './types'

// Detect environment
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

// 🌐 Base URL setup
// - Local: http://127.0.0.1:8000
// - Production: Your deployed FastAPI App Service (set in .env)
const baseURL =
  import.meta.env.VITE_API_URL ||
  (isLocal ? 'http://127.0.0.1:8000' : '/api')

console.info(`[api] Using backend URL → ${baseURL}`)

// Axios instance
const api = axios.create({
  baseURL,
  withCredentials: false,
  headers: {
    'Accept': 'application/json',
  },
})

// Generic error handler
const handleApiError = (error: any, context: string) => {
  console.error(`[api:${context}] Request failed:`, error)
  if (axios.isAxiosError(error)) {
    const msg = error.response?.data?.detail || error.message
    throw new Error(msg)
  }
  throw error
}

/**
 * Upload a PDF file to the backend for processing.
 * The backend extracts text and stores the file in Azure Blob Storage or local uploads.
 */
export const uploadPdf = async (file: File, userId: string): Promise<UploadPayload> => {
  try {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('user_id', userId)

    const { data } = await api.post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })

    console.log('✅ PDF uploaded successfully:', data)
    return data
  } catch (error) {
    handleApiError(error, 'uploadPdf')
    throw error
  }
}

/**
 * Send a user question to the backend → forwards it to Gemini Flash with the document context.
 */
export const ask = async (
  userId: string,
  docId: string,
  question: string,
): Promise<{ answer: string }> => {
  try {
    const { data } = await api.post('/ask', {
      user_id: userId,
      doc_id: docId,
      question,
    })

    console.log('🤖 Gemini answer received:', data)
    return data
  } catch (error) {
    handleApiError(error, 'ask')
    throw error
  }
}

/**
 * Retrieve chat history for a specific user and optionally a specific document.
 */
export const getHistory = async (
  userId: string,
  docId?: string,
): Promise<ChatHistoryResponse> => {
  try {
    const params = new URLSearchParams({ user_id: userId })
    if (docId) params.append('doc_id', docId)

    const { data } = await api.get(`/history?${params.toString()}`)
    console.log('🕓 Chat history loaded:', data)
    return data
  } catch (error) {
    handleApiError(error, 'getHistory')
    throw error
  }
}
