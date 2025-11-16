"""Utilities for extracting text content from PDF documents using PyPDF2."""
from __future__ import annotations

from io import BytesIO
from typing import Optional
from PyPDF2 import PdfReader


# -----------------------------------------------------
# Extract Text from PDF
# -----------------------------------------------------
def extract_text_from_pdf(data: bytes, max_chars: int = 20000) -> str:
    """
    Extract text from a PDF byte stream safely.
    Handles corrupted or encrypted pages gracefully.

    Args:
        data: Raw PDF bytes
        max_chars: Optional limit to prevent huge context overloads

    Returns:
        Extracted text (truncated if over limit)
    """
    if not data:
        print("⚠️ [pdf] No data received for extraction.")
        return "No readable content found in the uploaded PDF."

    try:
        stream = BytesIO(data)
        reader = PdfReader(stream)
    except Exception as exc:
        print(f"❌ [pdf] Failed to open PDF: {exc}")
        return "Unable to read the uploaded PDF file."

    text_segments: list[str] = []
    total_pages = len(reader.pages)
    extracted_pages = 0

    for i, page in enumerate(reader.pages, start=1):
        try:
            # Skip encrypted pages if necessary
            if reader.is_encrypted:
                reader.decrypt("")  # Attempt to decrypt empty password

            content: Optional[str] = page.extract_text()
            if content:
                text_segments.append(content.strip())
                extracted_pages += 1
            else:
                print(f"⚠️ [pdf] Page {i} contained no extractable text.")
        except Exception as exc:
            print(f"❌ [pdf] Failed to extract text from page {i}: {exc}")

    if not text_segments:
        print("⚠️ [pdf] No extractable text found in PDF.")
        return "No readable text was found in the uploaded PDF."

    full_text = "\n\n".join(segment for segment in text_segments if segment)

    # Truncate extremely large text bodies to keep Gemini input manageable
    if len(full_text) > max_chars:
        print(f"⚠️ [pdf] PDF text truncated from {len(full_text)} → {max_chars} characters.")
        full_text = full_text[:max_chars] + "\n\n[Text truncated for processing.]"

    print(f"✅ [pdf] Extracted {extracted_pages}/{total_pages} pages successfully.")
    return full_text
