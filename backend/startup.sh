#!/bin/bash
# Purpose: Install dependencies and start the FastAPI application for Azure App Service.
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000