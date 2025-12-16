"""
PDF extraction utilities using PyMuPDF (fitz).
Extracts plain text from uploaded PDFs for use by Gemini.
"""

import fitz  # PyMuPDF
from fastapi import UploadFile, HTTPException
from typing import List


async def extract_text_from_pdf(file: UploadFile) -> str:
    """
    Extract plain text from a PDF uploaded via FastAPI.

    Steps:
    1. Read PDF bytes from UploadFile
    2. Reset pointer for re-use
    3. Load PDF via PyMuPDF
    4. Extract text from each page
    5. Return combined text
    """

    # Read bytes
    try:
        pdf_bytes = await file.read()
        file.file.seek(0)
    except Exception:
        raise HTTPException(status_code=400, detail="Failed to read PDF upload.")

    try:
        # Load PDF into memory
        with fitz.open(stream=pdf_bytes, filetype="pdf") as document:
            text_chunks: List[str] = [
                page.get_text("text") for page in document
            ]
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid or corrupted PDF file.")

    # Clean + merge text
    final_text = "\n".join(
        chunk.strip() for chunk in text_chunks if chunk.strip()
    )

    if not final_text:
        raise HTTPException(status_code=400, detail="No extractable text found in the PDF.")

    return final_text
