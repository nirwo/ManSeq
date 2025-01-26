#!/bin/bash

# Function to check if Python package is installed
check_package() {
    python3 -c "import $1" 2>/dev/null
    return $?
}

# Function to install requirements
install_requirements() {
    echo "Checking and installing Python dependencies..."
    if ! command -v pip3 &> /dev/null; then
        echo "pip3 not found. Installing pip3..."
        sudo apt-get update && sudo apt-get install -y python3-pip
    fi
    
    cd backend
    if [ -f "requirements.txt" ]; then
        echo "Installing requirements from requirements.txt..."
        pip3 install -r requirements.txt
    else
        echo "requirements.txt not found!"
        exit 1
    fi
    cd ..
}

# Check and install dependencies
if ! check_package fastapi || ! check_package uvicorn; then
    install_requirements
fi

# Start the backend server
cd backend
python3 main.py &

# Wait a bit for backend to start
sleep 2

# Start the frontend server
cd ../frontend
python3 -m http.server 3001 --bind 0.0.0.0 &

echo "Backend running on http://0.0.0.0:3000"
echo "Frontend running on http://0.0.0.0:3001"

# Wait for any key to terminate both servers
read -p "Press any key to terminate servers..."

# Kill both servers
pkill -f "python3 main.py"
pkill -f "python3 -m http.server 3001"
