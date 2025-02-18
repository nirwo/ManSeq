# Data Center Monitor (DC-Mon)

A modern web application for monitoring and managing data center systems, built with FastAPI, Vue.js, and Tailwind CSS.

## Features

- 📊 **Status Overview**: Real-time monitoring of all systems
- 👥 **Owner Management**: Track system owners and their contact information
- 🌓 **Dark Mode**: Comfortable viewing in any environment
- 📱 **Responsive Design**: Works on desktop and mobile devices

## Prerequisites

- Python 3.8 or higher
- Node.js 16.x or higher
- npm or yarn

## Quick Start

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd datacenter-shutdown-manager
   ```

2. **Check the example data format**
   - View [template.csv](template.csv) for the required format
   - See [sample_data.csv](sample_data.csv) for example entries

3. **Set up the Backend**
   ```bash
   # Create and activate virtual environment
   python -m venv venv
   source venv/bin/activate  # On Windows use: venv\Scripts\activate
   
   # Install Python dependencies
   cd backend
   pip install -r requirements.txt
   ```

4. **Set up the Frontend**
   ```bash
   # Install Node.js dependencies
   cd frontend
   npm install
   ```

## Running the Application

1. **Start the Backend Server**
   ```bash
   # From the backend directory
   uvicorn main:app --reload --port 3000
   ```
   The API will be available at `http://localhost:3000`

2. **Start the Frontend Development Server**
   ```bash
   # From the frontend directory
   npm run dev
   ```
   The web interface will be available at `http://localhost:3001`

3. **Using the Start Script**
   ```bash
   # From the project root
   chmod +x start.sh  # Make the script executable
   ./start.sh        # Run both backend and frontend
   ```

## API Documentation

- API documentation is available at `http://localhost:3000/docs`
- ReDoc alternative documentation at `http://localhost:3000/redoc`

## Project Structure

```
datacenter-shutdown-manager/
├── backend/
│   ├── main.py           # FastAPI application
│   ├── requirements.txt  # Python dependencies
│   └── servers.db       # SQLite database
├── frontend/
│   ├── src/
│   │   ├── styles.css   # Tailwind CSS styles
│   │   └── components/  # Vue components
│   ├── index.html       # Main HTML file
│   ├── app.js          # Vue application
│   └── package.json    # Node.js dependencies
├── template.csv        # CSV template with required columns
├── sample_data.csv    # Example data file
├── start.sh          # Startup script
└── README.md        # This file
```

## Usage

1. **Status Overview Page**
   - View total number of systems
   - Monitor online/offline status
   - Check systems with issues
   - Access quick contact information

2. **Owners Page**
   - List all system owners
   - View contact details
   - See systems managed by each owner
   - Quick-access contact options

## CSV File Format

Two example CSV files are provided to help you understand the data format:

1. **[template.csv](template.csv)**: Basic template showing the required columns and format
2. **[sample_data.csv](sample_data.csv)**: Sample data with example entries

The CSV files should follow this structure:
- System Name
- IP Address
- Owner Name
- Owner Email
- Department
- Status
- Last Check Time
- Notes

Example from template.csv:
```csv
System Name,IP Address,Owner Name,Owner Email,Department,Status,Last Check Time,Notes
server1,192.168.1.1,John Doe,john@example.com,IT,Online,2025-01-25 19:30:00,Primary server
server2,192.168.1.2,Jane Smith,jane@example.com,DevOps,Offline,2025-01-25 19:30:00,Backup server
```

## Development

- The project uses the `modern-ui` branch for development
- Tailwind CSS v3.4.1 for styling
- Vue.js for frontend components
- FastAPI for backend API
- SQLite for data storage

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support, please open an issue in the GitHub repository or contact the maintainers.
