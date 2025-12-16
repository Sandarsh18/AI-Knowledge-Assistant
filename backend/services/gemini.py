"""Gemini integration."""

import asyncio
import logging
import os
import time
from typing import Final

from google import genai
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)

# Rate limiting: track last request time
_last_request_time = 0.0
_min_request_interval = 2.0  # Minimum 2 seconds between requests

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY is missing. Check your .env file!")

MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

client = genai.Client(api_key=GEMINI_API_KEY)

SYSTEM_PROMPT: Final = (
    "You are an assistant that answers questions strictly using the "
    "provided document text. If the answer cannot be found, reply with "
    "a short apology and say it's unavailable."
)


def _truncate(text: str, max_chars: int = 12000) -> str:
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "...\n[Truncated for length]"


async def get_gemini_response(document_text: str, question: str) -> str:
    global _last_request_time
    
    if not question.strip():
        raise ValueError("Question must not be empty.")
    
    # Rate limiting: ensure minimum interval between requests
    current_time = time.time()
    time_since_last_request = current_time - _last_request_time
    if time_since_last_request < _min_request_interval:
        wait_time = _min_request_interval - time_since_last_request
        logger.info(f"Rate limiting: waiting {wait_time:.1f}s before next request")
        await asyncio.sleep(wait_time)
    
    _last_request_time = time.time()

    prompt = (
        f"{SYSTEM_PROMPT}\n\n"
        f"Document Text:\n{_truncate(document_text)}\n\n"
        f"Question:\n{question.strip()}\n\n"
        "Answer:"
    )

    def _invoke():
        resp = client.models.generate_content(
            model=MODEL_NAME,
            contents=prompt,
        )
        return (resp.text or "").strip()

    max_retries = 3
    base_delay = 3.0  # Increased initial delay
    
    for attempt in range(max_retries):
        try:
            return await asyncio.to_thread(_invoke)
        except Exception as e:
            error_msg = str(e)
            
            # Check for quota/rate limit errors
            if "429" in error_msg or "RESOURCE_EXHAUSTED" in error_msg or "quota" in error_msg.lower() or "Too Many Requests" in error_msg:
                if attempt < max_retries - 1:
                    delay = base_delay * (2 ** attempt)  # 3s, 6s, 12s
                    logger.warning(f"Gemini API quota exceeded, retrying in {delay}s... (attempt {attempt + 1}/{max_retries})")
                    await asyncio.sleep(delay)
                    continue
                else:
                    logger.error("Gemini API quota exhausted after all retries")
                    raise RuntimeError(
                        "⏱️ API quota limit reached. The free tier has strict rate limits. "
                        "Please wait 60 seconds and try again, or upgrade your API key at https://ai.google.dev/pricing"
                    ) from e
            
            # For other errors, log and re-raise
            logger.exception(f"Gemini request failed on attempt {attempt + 1}")
            if attempt < max_retries - 1:
                delay = base_delay * (2 ** attempt)
                await asyncio.sleep(delay)
                continue
            else:
                raise RuntimeError(f"Failed to get response from AI service: {error_msg}") from e
    
    raise RuntimeError("Failed to get response from AI service after all retries")
