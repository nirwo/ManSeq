#!/bin/bash

# Function to check if port is in use
check_port() {
    lsof -i:$1 >/dev/null 2>&1
    return $?
}

# Function to kill process on port
kill_port() {
    local port=$1
    if check_port $port; then
        echo "Killing process on port $port..."
        lsof -t -i:$port | xargs kill -9 2>/dev/null || true
    fi
}

# Function to start backend
start_backend() {
    echo "Starting backend server..."
    python3 backend/main.py --host 0.0.0.0 --port 3000 &
    BACKEND_PID=$!
    sleep 2
    if ! check_port 3000; then
        echo "Failed to start backend server"
        exit 1
    fi
}

# Function to start frontend
start_frontend() {
    echo "Starting frontend server..."
    npx serve frontend -l tcp://0.0.0.0:3001 &
    FRONTEND_PID=$!
    sleep 2
    if ! check_port 3001; then
        echo "Failed to start frontend server"
        exit 1
    fi
}

# Cleanup function
cleanup() {
    echo "Cleaning up processes..."
    [[ ! -z "$BACKEND_PID" ]] && kill $BACKEND_PID 2>/dev/null
    [[ ! -z "$FRONTEND_PID" ]] && kill $FRONTEND_PID 2>/dev/null
    kill_port 3000
    kill_port 3001
    exit
}

# Set up trap
trap cleanup SIGINT SIGTERM

# Build Tailwind CSS
echo "Building CSS..."
npm run build:css

# Kill any existing processes
kill_port 3000
kill_port 3001

# Start servers
start_backend
start_frontend

echo "All services started successfully!"
echo "Backend running on http://localhost:3000"
echo "Frontend running on http://localhost:3001"

# Wait for all processes
wait
