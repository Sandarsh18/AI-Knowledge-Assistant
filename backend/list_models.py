"""List available Gemini models."""

import os
from dotenv import load_dotenv
from google import genai

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=api_key)

print("Available models:")
try:
    models = client.models.list()
    for model in models:
        if "gemini" in model.name.lower():
            print(f"  ✓ {model.name}")
except Exception as e:
    print(f"Error listing models: {e}")
