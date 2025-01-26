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
python3 -m uvicorn main:app --host 0.0.0.0 --port 3000 --reload &

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
pkill -f "uvicorn main:app"
pkill -f "python3 -m http.server 3001"
