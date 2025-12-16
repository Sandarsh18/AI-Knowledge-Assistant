"""Quick test script to check Gemini API status."""

import os
import asyncio
from dotenv import load_dotenv
from google import genai

load_dotenv()

async def test_api():
    api_key = os.getenv("GEMINI_API_KEY")
    model_name = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
    
    print(f"Testing API Key: {api_key[:10]}...")
    print(f"Using Model: {model_name}")
    
    client = genai.Client(api_key=api_key)
    
    try:
        print("\nSending test request...")
        resp = client.models.generate_content(
            model=model_name,
            contents="Say 'API is working!' in one short sentence."
        )
        print(f"✅ SUCCESS: {resp.text}")
        return True
    except Exception as e:
        error_msg = str(e)
        print(f"❌ ERROR: {error_msg}")
        
        if "429" in error_msg or "quota" in error_msg.lower():
            print("\n⚠️  QUOTA ISSUE DETECTED")
            print("Solutions:")
            print("1. Wait 60 seconds and try again (free tier rate limit)")
            print("2. Check your quota at: https://aistudio.google.com/apikey")
            print("3. Try a different API key")
            print("4. Upgrade to paid tier for higher limits")
        return False

if __name__ == "__main__":
    asyncio.run(test_api())
