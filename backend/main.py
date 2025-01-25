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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001", "http://127.0.0.1:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "servers.db")

def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        # Create tables
        conn.execute('''CREATE TABLE IF NOT EXISTS applications
            (id INTEGER PRIMARY KEY,
             name TEXT UNIQUE,
             description TEXT)''')
            
        conn.execute('''CREATE TABLE IF NOT EXISTS servers
            (id INTEGER PRIMARY KEY,
             name TEXT,
             type TEXT,
             status TEXT,
             owner_name TEXT,
             owner_contact TEXT,
             hostname TEXT,
             port INTEGER DEFAULT 80,
             application_id INTEGER,
             FOREIGN KEY(application_id) REFERENCES applications(id))''')
        
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
                    INSERT INTO servers (name, type, status, owner_name, owner_contact, hostname, port, application_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''', server)
            
            conn.commit()
        except sqlite3.IntegrityError:
            # Sample data already exists
            pass

init_db()

async def check_server_status(hostname: str, port: int = 80) -> str:
    if not hostname:
        return "Unknown"
    try:
        # Set a shorter timeout for ping
        ping_result = subprocess.run(['ping', '-c', '1', '-W', '1', hostname], 
                                   stdout=subprocess.PIPE, 
                                   stderr=subprocess.PIPE,
                                   timeout=2)
        if ping_result.returncode == 0:
            if port in [80, 443, 8080, 8443]:
                try:
                    protocol = 'https' if port in [443, 8443] else 'http'
                    url = f"{protocol}://{hostname}:{port}"
                    response = requests.get(url, timeout=3, verify=False)
                    return "Online" if response.status_code < 400 else "Error"
                except requests.exceptions.RequestException:
                    return "Error"
            return "Online"
        return "Offline"
    except (subprocess.TimeoutExpired, subprocess.SubprocessError):
        return "Offline"
    except Exception:
        return "Error"

async def update_all_statuses():
    while True:
        try:
            with sqlite3.connect(DB_PATH) as conn:
                cursor = conn.cursor()
                cursor.execute('SELECT id, hostname, port FROM servers')
                servers = cursor.fetchall()
                
                for server_id, hostname, port in servers:
                    if hostname:
                        status = await check_server_status(hostname, port or 80)
                        cursor.execute('UPDATE servers SET status = ? WHERE id = ?', 
                                     (status, server_id))
                conn.commit()
        except Exception as e:
            print(f"Error updating statuses: {e}")
        await asyncio.sleep(30)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(update_all_statuses())

# Application endpoints
@app.get("/applications")
async def get_applications():
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM applications')
        columns = [col[0] for col in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]

@app.post("/applications")
async def create_application(app_data: dict):
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute('INSERT INTO applications (name, description) VALUES (?, ?)',
                      (app_data["name"], app_data["description"]))
        app_id = cursor.lastrowid
        return {"id": app_id, **app_data}

@app.delete("/applications/{app_id}")
async def delete_application(app_id: int):
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        # First update any servers using this application
        cursor.execute('UPDATE servers SET application_id = NULL WHERE application_id = ?', (app_id,))
        # Then delete the application
        cursor.execute('DELETE FROM applications WHERE id = ?', (app_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Application not found")
        return {"status": "success"}

@app.get("/servers")
async def get_servers():
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT s.*, a.name as application_name 
            FROM servers s 
            LEFT JOIN applications a ON s.application_id = a.id
        ''')
        columns = [col[0] for col in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]

@app.post("/servers")
async def create_server(server_data: dict):
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO servers (name, type, status, owner_name, owner_contact, hostname, port, application_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            server_data["name"],
            server_data["type"],
            "Pending",
            server_data["owner_name"],
            server_data["owner_contact"],
            server_data.get("hostname", ""),
            server_data.get("port", 80),
            server_data.get("application_id")
        ))
        server_id = cursor.lastrowid
        return {"id": server_id, **server_data}

@app.put("/servers/{server_id}")
async def update_server(server_id: int, server_data: dict):
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE servers 
            SET name=?, type=?, owner_name=?, owner_contact=?, hostname=?, port=?, application_id=?
            WHERE id=?
        ''', (
            server_data["name"],
            server_data["type"],
            server_data["owner_name"],
            server_data["owner_contact"],
            server_data.get("hostname", ""),
            server_data.get("port", 80),
            server_data.get("application_id"),
            server_id
        ))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Server not found")
        return {"id": server_id, **server_data}

@app.delete("/servers/{server_id}")
async def delete_server(server_id: int):
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM servers WHERE id = ?', (server_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Server not found")
    return {"message": "Server deleted"}

@app.post("/servers/import-csv")
async def import_csv(file: UploadFile = File(...)):
    content = await file.read()
    csv_data = content.decode()
    reader = csv.DictReader(io.StringIO(csv_data))
    
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        for row in reader:
            app_name = row.get('application', '')
            app_id = None
            if app_name:
                cursor.execute('SELECT id FROM applications WHERE name = ?', (app_name,))
                result = cursor.fetchone()
                if result:
                    app_id = result[0]
                else:
                    cursor.execute('INSERT INTO applications (name, description) VALUES (?, ?)',
                                 (app_name, f"Application for {app_name}"))
                    app_id = cursor.lastrowid
                    
            cursor.execute(
                '''INSERT INTO servers 
                   (name, type, status, owner_name, owner_contact, hostname, port, application_id)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
                (row['name'], row['type'], 'Pending', row['owner_name'], 
                 row['owner_contact'], row.get('hostname', ''), 
                 int(row.get('port', 80)), app_id)
            )
    return {"message": "Import successful"}

if __name__ == "__main__":
    import uvicorn
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind to")
    parser.add_argument("--port", type=int, default=3000, help="Port to bind to")
    args = parser.parse_args()
    
    uvicorn.run("main:app", host=args.host, port=args.port, reload=True)
