#!/bin/bash

# This script starts the FastAPI application for the Azure PDF Chat backend.

# Load environment variables from .env file
if [ -f .env ]; then
    export $(cat .env | xargs)
fi

# Start the FastAPI application using uvicorn
uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --reload --log-level info