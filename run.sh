#!/bin/bash

# Function to check if a Python package is installed
check_package() {
    python3 -c "import $1" 2>/dev/null
    return $?
}

# Function to install requirements
install_requirements() {
    echo "Installing required packages..."
    pip install -r backend/requirements.txt
}

# Get server IP
SERVER_IP=$(hostname -I | awk '{print $1}')

# Check for required packages
required_packages=("fastapi" "uvicorn" "python-multipart" "aiofiles" "sqlalchemy" "pydantic")
missing_packages=false

for package in "${required_packages[@]}"; do
    if ! check_package "$package"; then
        echo "Package $package is not installed"
        missing_packages=true
    fi
done

# Install requirements if any package is missing
if [ "$missing_packages" = true ]; then
    install_requirements
fi

# Start the backend server
cd backend
python3 -m uvicorn main:app --host $SERVER_IP --port 3000 --reload &

# Wait a bit for backend to start
sleep 2

# Start the frontend server
cd ../frontend
python3 -m http.server 3001 --bind $SERVER_IP &

echo "Backend running on http://$SERVER_IP:3000"
echo "Frontend running on http://$SERVER_IP:3001"

# Wait for any key to terminate servers
read -p "Press any key to terminate servers..."

# Kill both servers
pkill -f "uvicorn main:app"
pkill -f "python3 -m http.server 3001"
