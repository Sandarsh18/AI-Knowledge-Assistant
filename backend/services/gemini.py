"""Client wrapper for querying the Google Gemini Flash API (with robust error handling and local fallback)."""
from __future__ import annotations

import os
import requests
from typing import Optional

# -----------------------------------------------------
# Constants
# -----------------------------------------------------
_ENDPOINT = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "gemini-1.5-flash-latest:generateContent"
)
_TIMEOUT_SECONDS = 30
_API_KEY: Optional[str] = None
_IS_LOCAL_MODE = False


# -----------------------------------------------------
# Configuration
# -----------------------------------------------------
def configure(api_key: Optional[str] = None) -> None:
    """
    Configure the Gemini client with the provided API key or environment variable.

    Example:
        configure(os.getenv("GEMINI_API_KEY"))
    """
    global _API_KEY, _IS_LOCAL_MODE

    if not api_key:
        api_key = os.getenv("GEMINI_API_KEY")

    if not api_key or api_key.strip() == "":
        print("⚙️ Running Gemini in LOCAL MOCK MODE — responses will be simulated.")
        _IS_LOCAL_MODE = True
        return

    _API_KEY = api_key.strip()
    print("🔑 Gemini API key configured successfully.")


# -----------------------------------------------------
# Core Function
# -----------------------------------------------------
def ask_with_context(question: str, context: str) -> str:
    """
    Submit a question to Gemini with PDF text context and return the response.

    Returns:
        A string answer restricted strictly to PDF context.
    """
    if _IS_LOCAL_MODE:
        print("💬 Gemini mock mode → returning simulated answer.")
        # Simple local mock for offline testing
        return f"(Simulated answer) Based on your PDF, this might relate to: {question[:60]}..."

    if not _API_KEY:
        raise RuntimeError("Gemini API key has not been configured. Call configure() first or set GEMINI_API_KEY in .env.")

    if not context.strip():
        return "I couldn't find that in the uploaded PDF."

    instruction = (
        "You are a helpful assistant restricted to answering using only the supplied PDF text. "
        "If the answer is not explicitly available in the context, reply exactly with: "
        "'I couldn't find that in the uploaded PDF.'"
    )

    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": (
                            f"{instruction}\n\n"
                            f"Context:\n{context}\n\n"
                            f"Question: {question}\n\n"
                            "Answer:"
                        )
                    }
                ],
            }
        ]
    }

    headers = {
        "Authorization": f"Bearer {_API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        response = requests.post(
            _ENDPOINT,
            headers=headers,
            json=payload,
            timeout=_TIMEOUT_SECONDS,
        )

        # Handle unsuccessful HTTP responses gracefully
        if not response.ok:
            if response.status_code == 429:
                raise RuntimeError("Rate limit exceeded. Please try again later.")
            elif response.status_code == 401:
                raise RuntimeError("Invalid Gemini API key. Check your .env configuration.")
            else:
                raise RuntimeError(f"Gemini request failed: {response.status_code} {response.text}")

        data = response.json()
        candidates = data.get("candidates", [])
        if not candidates:
            return "I couldn't find that in the uploaded PDF."

        content = candidates[0].get("content", {})
        parts = content.get("parts", [])
        answer = "".join(part.get("text", "") for part in parts if "text" in part).strip()

        if not answer or "I couldn't find that in the uploaded PDF." in answer:
            return "I couldn't find that in the uploaded PDF."

        print("✅ Gemini response received successfully.")
        return answer

    except requests.exceptions.Timeout:
        raise RuntimeError("Gemini API request timed out after 30 seconds.")
    except requests.exceptions.ConnectionError:
        raise RuntimeError("Unable to reach the Gemini API endpoint. Check your internet or proxy settings.")
    except Exception as e:
        raise RuntimeError(f"Unexpected error occurred while querying Gemini: {e}")
