/**
 * Axios API client encapsulating backend requests.
 */
import axios from "axios";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

if (!apiBaseUrl) {
  // eslint-disable-next-line no-console
  console.warn("VITE_API_BASE_URL is not defined. API calls will fail.");
}

export interface UploadResponse {
  doc_id: string;
  file_name: string;
  blob_url: string;
}

export interface AskResponse {
  answer: string;
}

export interface Message {
  id: string;
  type?: string;
  user_id: string;
  doc_id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface DocumentItem {
  id: string;
  file_name: string;
  created_at: string;
  blob_url?: string;
}

const client = axios.create({
  baseURL: apiBaseUrl,
  timeout: 60000, // Increased timeout for AI processing
  withCredentials: true
});

export const uploadPdf = async (file: File, userId: string): Promise<UploadResponse> => {
  const data = new FormData();
  data.append("file", file);
  data.append("user_id", userId);
  const response = await client.post<UploadResponse>("/upload", data, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  return response.data;
};

export const ask = async (userId: string, docId: string, question: string): Promise<AskResponse> => {
  const response = await client.post<AskResponse>("/ask", {
    user_id: userId,
    doc_id: docId,
    question
  });
  return response.data;
};

export const getHistory = async (userId: string, docId?: string): Promise<Message[]> => {
  const params: Record<string, string> = { user_id: userId };
  if (docId) {
    params.doc_id = docId;
  }
  const response = await client.get<Message[]>("/history", { params });
  return response.data;
};

export const listDocuments = async (userId: string): Promise<DocumentItem[]> => {
  try {
    const response = await client.get<DocumentItem[]>("/documents", {
      params: { user_id: userId }
    });
    return response.data;
  } catch (error) {
    console.warn("Falling back to empty document list:", error);
    return [];
  }
};