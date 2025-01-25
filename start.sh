#!/bin/bash

# Build Tailwind CSS
npm run build:css

# Kill any existing processes on ports 3000 and 3001
kill $(lsof -t -i:3000) 2>/dev/null || true
kill $(lsof -t -i:3001) 2>/dev/null || true

# Start backend and frontend
python3 backend/main.py --host 0.0.0.0 --port 3000 & 
npx serve frontend -l tcp://0.0.0.0:3001

# Handle cleanup on script exit
cleanup() {
    echo "Cleaning up processes..."
    pkill -f "python3 backend/main.py"
    pkill -f "npx serve frontend"
    exit
}

trap cleanup SIGINT SIGTERM

wait
