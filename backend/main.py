from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import sqlite3
import json
import csv
import io
import os
import subprocess
import requests
import asyncio
from typing import List, Optional, Dict
from pydantic import BaseModel
from datetime import datetime

app = FastAPI()

# Configure CORS - allow all origins for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "servers.db")

# Database connection management
def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        # Create tables
        conn.execute('''CREATE TABLE IF NOT EXISTS applications
            (id INTEGER PRIMARY KEY,
             name TEXT NOT NULL UNIQUE,
             description TEXT)''')
        
        conn.execute('''CREATE TABLE IF NOT EXISTS servers
            (id INTEGER PRIMARY KEY,
             name TEXT NOT NULL,
             type TEXT NOT NULL,
             status TEXT DEFAULT 'Unknown',
             shutdown_status TEXT DEFAULT 'Not Started',
             owner_name TEXT,
             owner_contact TEXT,
             hostname TEXT,
             port INTEGER DEFAULT 80,
             application_id INTEGER,
             FOREIGN KEY (application_id) REFERENCES applications (id))''')
            
        # Add sample data
        try:
            # Sample applications
            apps = [
                ("E-Commerce System", "Main e-commerce platform"),
                ("CRM System", "Customer relationship management"),
                ("Analytics Platform", "Data analytics and reporting")
            ]
            
            for app_name, desc in apps:
                conn.execute('INSERT INTO applications (name, description) VALUES (?, ?)',
                           (app_name, desc))
            
            # Get application IDs
            cursor = conn.cursor()
            cursor.execute('SELECT id, name FROM applications')
            app_ids = {name: id for id, name in cursor.fetchall()}
            
            # Sample servers
            servers = [
                ("Web Server 1", "WEB", "Pending", "John Doe", "john@example.com", "google.com", 80, app_ids["E-Commerce System"]),
                ("DB Server 1", "DATABASE", "Pending", "Jane Smith", "jane@example.com", "github.com", 443, app_ids["E-Commerce System"]),
                ("App Server 1", "APPLICATION", "Pending", "Bob Wilson", "bob@example.com", "microsoft.com", 80, app_ids["CRM System"]),
                ("Analytics DB", "DATABASE", "Pending", "Alice Brown", "alice@example.com", "amazon.com", 80, app_ids["Analytics Platform"]),
                ("Load Balancer", "WEB", "Pending", "Charlie Davis", "charlie@example.com", "cloudflare.com", 443, app_ids["E-Commerce System"])
            ]
            
            for server in servers:
                conn.execute('''
                    INSERT INTO servers (name, type, status, shutdown_status, owner_name, owner_contact, hostname, port, application_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', server + ('Not Started',))
        except sqlite3.IntegrityError:
            # Sample data already exists
            pass

init_db()

async def check_server_status(hostname: str, port: int = 80):
    try:
        # Quick timeout for faster response
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(hostname, port),
            timeout=1.0
        )
        writer.close()
        await writer.wait_closed()
        return 'Online'
    except Exception:
        return 'Offline'

async def update_all_statuses():
    while True:
        try:
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute('SELECT id, hostname, port FROM servers')
                servers = cursor.fetchall()
                
                for server in servers:
                    status = await check_server_status(server[1], server[2])
                    cursor.execute('UPDATE servers SET status = ? WHERE id = ?',
                                 (status, server[0]))
                conn.commit()
        except Exception as e:
            print(f"Error updating statuses: {e}")
        finally:
            await asyncio.sleep(30)  # Check every 30 seconds

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(update_all_statuses())

# Application endpoints
@app.get("/applications")
async def get_applications():
    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM applications')
        columns = [col[0] for col in cursor.description]
        apps = [dict(zip(columns, row)) for row in cursor.fetchall()]
        return {"applications": apps}  # Wrap in object
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

@app.post("/applications")
async def create_application(app_data: dict):
    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('INSERT INTO applications (name, description) VALUES (?, ?)',
                      (app_data["name"], app_data["description"]))
        app_id = cursor.lastrowid
        return {"id": app_id, **app_data}
    finally:
        if conn:
            conn.close()

@app.delete("/applications/{app_id}")
async def delete_application(app_id: int):
    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        # First update any servers using this application
        cursor.execute('UPDATE servers SET application_id = NULL WHERE application_id = ?', (app_id,))
        # Then delete the application
        cursor.execute('DELETE FROM applications WHERE id = ?', (app_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Application not found")
        return {"status": "success"}
    finally:
        if conn:
            conn.close()

@app.get("/servers")
async def get_servers():
    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT s.*, a.name as application_name 
            FROM servers s
            LEFT JOIN applications a ON s.application_id = a.id
        ''')
        columns = [col[0] for col in cursor.description]
        servers = [dict(zip(columns, row)) for row in cursor.fetchall()]
        return {"servers": servers}  # Wrap in object to avoid empty response issues
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

@app.post("/servers")
async def create_server(server_data: dict):
    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO servers (name, type, status, shutdown_status, owner_name, owner_contact, hostname, port, application_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            server_data["name"],
            server_data["type"],
            "Pending",
            "Not Started",
            server_data["owner_name"],
            server_data["owner_contact"],
            server_data.get("hostname", ""),
            server_data.get("port", 80),
            server_data.get("application_id")
        ))
        server_id = cursor.lastrowid
        return {"id": server_id, **server_data}
    finally:
        if conn:
            conn.close()

@app.put("/servers/{server_id}")
async def update_server(server_id: int, server_data: dict):
    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Build update query dynamically based on provided fields
        update_fields = []
        params = []
        for field in ['name', 'type', 'status', 'shutdown_status', 'owner_name', 
                     'owner_contact', 'hostname', 'port', 'application_id']:
            if field in server_data:
                update_fields.append(f"{field} = ?")
                params.append(server_data[field])
        
        if not update_fields:
            raise HTTPException(status_code=400, detail="No fields to update")
            
        query = f'''UPDATE servers SET {", ".join(update_fields)} WHERE id = ?'''
        params.append(server_id)
        
        cursor.execute(query, params)
        conn.commit()
        
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Server not found")
            
        # Return updated server data
        cursor.execute('SELECT * FROM servers WHERE id = ?', (server_id,))
        columns = [col[0] for col in cursor.description]
        server = dict(zip(columns, cursor.fetchone()))
        return server
    finally:
        if conn:
            conn.close()

@app.delete("/servers/{server_id}")
async def delete_server(server_id: int):
    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM servers WHERE id = ?', (server_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Server not found")
    finally:
        if conn:
            conn.close()
    return {"message": "Server deleted"}

@app.post("/servers/import-csv")
async def import_csv(file: UploadFile = File(...)):
    content = await file.read()
    csv_data = content.decode()
    reader = csv.DictReader(io.StringIO(csv_data))
    
    # Define valid server types
    VALID_TYPES = {'WEB', 'DB', 'APP', 'CACHE', 'QUEUE', 'WORKER'}
    
    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        for row in reader:
            try:
                # Create/get application using the name field
                app_name = row['name']
                cursor.execute('SELECT id FROM applications WHERE name = ?', (app_name,))
                result = cursor.fetchone()
                if result:
                    app_id = result[0]
                else:
                    # Create new application
                    cursor.execute('INSERT INTO applications (name, description) VALUES (?, ?)',
                                 (app_name, f"Application managed by {row.get('team', 'Unknown Team')}"))
                    app_id = cursor.lastrowid
                
                # Handle port conversion safely
                port = row.get('port', '')
                try:
                    port = int(port) if port else 80
                except (ValueError, TypeError):
                    port = 80
                
                # Handle server type
                server_type = row.get('type', '').upper()
                if not server_type or server_type not in VALID_TYPES:
                    server_type = 'WEB'  # Default to WEB if type is missing or invalid
                
                # Create server entry with component name based on type
                server_name = f"{app_name} {server_type.capitalize()}"
                        
                cursor.execute(
                    '''INSERT INTO servers 
                       (name, type, status, shutdown_status, owner_name, owner_contact, hostname, port, application_id)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                    (server_name,  # Use type-specific name for the server
                     server_type,  
                     'Pending', 
                     'Not Started',
                     row.get('team', ''),  # Team as owner
                     '',  
                     row.get('host', ''), 
                     port,
                     app_id)
                )
            except Exception as e:
                conn.rollback()
                raise HTTPException(status_code=400, detail=f"Error importing row {row.get('name', 'unknown')}: {str(e)}")
        conn.commit()
        return {"message": "Import successful"}
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    import uvicorn
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind to")
    parser.add_argument("--port", type=int, default=3000, help="Port to bind to")
    args = parser.parse_args()
    
    uvicorn.run("main:app", host=args.host, port=args.port, reload=True)
