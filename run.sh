#!/bin/bash

# Start the backend server
cd backend
python3 main.py &

# Wait a bit for backend to start
sleep 2

# Start the frontend server
cd ../frontend
python3 -m http.server 3001 &

echo "Backend running on http://localhost:3000"
echo "Frontend running on http://localhost:3001"

# Wait for any key to terminate both servers
read -p "Press any key to terminate servers..."

# Kill both servers
pkill -f "python3 main.py"
pkill -f "python3 -m http.server 3001"
