from fastapi import FastAPI, HTTPException, UploadFile, File, Request
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
import aiosqlite

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "servers.db")

# Database connection management
def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Create servers table
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS servers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            type TEXT NOT NULL CHECK(type IN ('WEB', 'HTTPS', 'DB_MYSQL', 'DB_POSTGRES', 'DB_MONGO', 'DB_REDIS', 'APP_TOMCAT', 'APP_NODEJS', 'APP_PYTHON', 'MAIL', 'FTP', 'SSH', 'DNS', 'MONITORING', 'CUSTOM')),
            status TEXT DEFAULT 'Unknown',
            shutdown_status TEXT DEFAULT 'Not Started',
            test_response TEXT,
            owner_name TEXT,
            owner_contact TEXT,
            hostname TEXT,
            port INTEGER,
            application_id INTEGER,
            FOREIGN KEY (application_id) REFERENCES applications (id)
        )
        ''')

        # Create applications table
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS applications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'Unknown',
            test_response TEXT
        )
        ''')

        # Add test_response column if it doesn't exist
        cursor.execute("PRAGMA table_info(servers)")
        columns = [column[1] for column in cursor.fetchall()]
        if 'test_response' not in columns:
            cursor.execute('ALTER TABLE servers ADD COLUMN test_response TEXT')
        
        conn.commit()

init_db()

async def check_server_status(hostname: str, port: int = 80, server_type: str = 'WEB'):
    try:
        if port == 80 or port == 443:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(hostname, port),
                timeout=2.0
            )
            writer.close()
            await writer.wait_closed()
            return {"status": "Online", "message": "Connection successful"}
        else:
            if server_type in ['APP_TOMCAT', 'APP_NODEJS', 'APP_PYTHON', 'WEB']:
                try:
                    response = requests.get(f"http://{hostname}:{port}", timeout=2)
                    return {"status": "Online", "message": f"HTTP response: {response.status_code}"}
                except:
                    return {"status": "Error", "message": "Failed to connect to web service"}
            else:
                reader, writer = await asyncio.wait_for(
                    asyncio.open_connection(hostname, port),
                    timeout=2.0
                )
                writer.close()
                await writer.wait_closed()
                return {"status": "Online", "message": "Port is open"}
    except Exception as e:
        return {"status": "Offline", "message": str(e)}

async def update_all_statuses():
    while True:
        try:
            conn = get_db()
            cursor = conn.cursor()
            
            # Update servers
            cursor.execute('SELECT id, hostname, port, type FROM servers')
            servers = cursor.fetchall()
            
            for server in servers:
                result = await check_server_status(server[1], server[2], server[3])
                cursor.execute(
                    'UPDATE servers SET status = ?, test_response = ? WHERE id = ?',
                    (result["status"], result["message"], server[0])
                )
            
            # Update applications
            cursor.execute('''
                SELECT a.id, GROUP_CONCAT(s.status) as server_statuses 
                FROM applications a 
                LEFT JOIN servers s ON s.application_id = a.id 
                GROUP BY a.id
            ''')
            apps = cursor.fetchall()
            
            for app in apps:
                if not app[1]:  # No servers
                    status = "Unknown"
                    message = "No servers associated"
                else:
                    statuses = app[1].split(',')
                    if all(s == "Online" for s in statuses):
                        status = "Online"
                        message = "All servers online"
                    elif all(s == "Offline" for s in statuses):
                        status = "Offline"
                        message = "All servers offline"
                    else:
                        status = "Partial"
                        online = sum(1 for s in statuses if s == "Online")
                        total = len(statuses)
                        message = f"{online}/{total} servers online"
                
                cursor.execute(
                    'UPDATE applications SET status = ?, test_response = ? WHERE id = ?',
                    (status, message, app[0])
                )
            
            conn.commit()
        except Exception as e:
            print(f"Error updating statuses: {e}")
        finally:
            if conn:
                conn.close()
            await asyncio.sleep(30)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(update_all_statuses())

class ServerValidation(BaseModel):
    hostname: str
    port: int
    type: str

async def validate_server(hostname: str, port: int, server_type: str) -> dict:
    try:
        if port == 80 or port == 443:
            # For default ports, use basic connection check
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(hostname, port),
                timeout=2.0
            )
            writer.close()
            await writer.wait_closed()
            return {"status": "OK", "message": "Connection successful"}
        else:
            # For other ports, attempt service-specific validation
            if server_type in ['APP_TOMCAT', 'APP_NODEJS', 'APP_PYTHON', 'WEB']:
                try:
                    response = requests.get(f"http://{hostname}:{port}", timeout=2)
                    return {"status": "OK", "message": f"HTTP response: {response.status_code}"}
                except:
                    return {"status": "Error", "message": "Failed to connect to web service"}
            else:
                # Basic port check for other services
                reader, writer = await asyncio.wait_for(
                    asyncio.open_connection(hostname, port),
                    timeout=2.0
                )
                writer.close()
                await writer.wait_closed()
                return {"status": "OK", "message": "Port is open"}
    except Exception as e:
        return {"status": "Error", "message": str(e)}

@app.post("/validate-server")
async def validate_server_endpoint(server: ServerValidation):
    result = await validate_server(server.hostname, server.port, server.type)
    return result

@app.post("/servers/{server_id}/test")
async def test_server(server_id: int):
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT hostname, port, type FROM servers WHERE id = ?', (server_id,))
        server = cursor.fetchone()
        
        if not server:
            raise HTTPException(status_code=404, detail="Server not found")
        
        result = await check_server_status(server[0], server[1], server[2])
        
        cursor.execute(
            'UPDATE servers SET status = ?, test_response = ? WHERE id = ?',
            (result["status"], result["message"], server_id)
        )
        conn.commit()
        
        return result
    finally:
        if conn:
            conn.close()

@app.post("/servers/test-all")
async def test_all_servers():
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT id, hostname, port, type FROM servers')
        servers = cursor.fetchall()
        
        results = []
        for server in servers:
            result = await check_server_status(server[1], server[2], server[3])
            cursor.execute(
                'UPDATE servers SET status = ?, test_response = ? WHERE id = ?',
                (result["status"], result["message"], server[0])
            )
            results.append({"id": server[0], "result": result})
        
        conn.commit()
        return {"results": results}
    finally:
        if conn:
            conn.close()

# Application endpoints
@app.get("/applications")
async def get_applications():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = sqlite3.Row
        cursor = await db.execute('SELECT * FROM applications')
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]

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

@app.put("/applications/{app_id}")
async def update_application(app_id: int, app_data: dict):
    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE applications 
            SET name = ?, description = ?
            WHERE id = ?
        ''', (app_data["name"], app_data["description"], app_id))
        
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Application not found")
        
        conn.commit()
        return {"status": "success"}
    except sqlite3.Error as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

@app.delete("/applications/{app_id}")
async def delete_application(app_id: int):
    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # First update any servers that reference this application
        cursor.execute('UPDATE servers SET application_id = NULL WHERE application_id = ?', (app_id,))
        
        # Then delete the application
        cursor.execute('DELETE FROM applications WHERE id = ?', (app_id,))
        
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Application not found")
        
        conn.commit()
        return {"status": "success", "message": "Application deleted successfully"}
    except sqlite3.Error as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

@app.get("/servers")
async def get_servers():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = sqlite3.Row
        cursor = await db.execute('SELECT * FROM servers')
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]

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
        
        # First check if server exists
        cursor.execute('SELECT id FROM servers WHERE id = ?', (server_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Server not found")
            
        # Delete the server
        cursor.execute('DELETE FROM servers WHERE id = ?', (server_id,))
        conn.commit()
        
        return {"message": "Server deleted successfully", "id": server_id}
    except sqlite3.Error as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

@app.post("/servers/import-csv")
async def import_csv(file: UploadFile = File(...)):
    content = await file.read()
    csv_data = csv.DictReader(io.StringIO(content.decode()))
    
    response = {"success": [], "errors": []}
    applications = {}
    
    with get_db() as conn:
        cursor = conn.cursor()
        
        for row in csv_data:
            try:
                # Get or create application based on name
                app_name = row.get('name', '').split('_')[0]  # Get application name from server name prefix
                if app_name not in applications:
                    # Check if application exists
                    cursor.execute('SELECT id FROM applications WHERE name = ?', (app_name,))
                    app_result = cursor.fetchone()
                    
                    if app_result:
                        applications[app_name] = app_result[0]
                    else:
                        # Create new application
                        cursor.execute(
                            'INSERT INTO applications (name, description) VALUES (?, ?)',
                            (app_name, f"Application for {app_name} services")
                        )
                        applications[app_name] = cursor.lastrowid
                
                # Insert server with application reference
                port = int(row.get('port', 80))
                server_data = {
                    'name': row['name'],
                    'type': row.get('type', 'CUSTOM'),
                    'owner_name': row.get('team', 'Unknown'),
                    'hostname': row.get('host', ''),
                    'port': port,
                    'application_id': applications[app_name]
                }
                
                cursor.execute('''
                    INSERT INTO servers (name, type, owner_name, hostname, port, application_id)
                    VALUES (:name, :type, :owner_name, :hostname, :port, :application_id)
                ''', server_data)
                
                response["success"].append({
                    "name": row['name'],
                    "message": "Server created successfully"
                })
                
            except Exception as e:
                response["errors"].append({
                    "name": row.get('name', 'Unknown'),
                    "error": str(e)
                })
        
        conn.commit()
    
    return response

@app.put("/servers/bulk-update")
async def bulk_update_servers(request: Request):
    try:
        data = await request.json()
        server_ids = data.get('server_ids', [])
        updates = data.get('updates', {})
        
        # Remove None values from updates
        updates = {k: v for k, v in updates.items() if v is not None}
        
        if not server_ids or not updates:
            raise HTTPException(status_code=400, detail="No servers or updates specified")
        
        # Update servers in database
        async with aiosqlite.connect(DB_PATH) as db:
            update_fields = ', '.join([f"{k} = ?" for k in updates.keys()])
            update_values = list(updates.values())
            
            # Convert server_ids to string for SQL IN clause
            servers_str = ','.join('?' * len(server_ids))
            
            query = f"""
                UPDATE servers 
                SET {update_fields}
                WHERE id IN ({servers_str})
            """
            
            # Combine update values with server IDs for the query
            all_params = update_values + server_ids
            await db.execute(query, all_params)
            await db.commit()
        
        return {"message": "Servers updated successfully"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/applications/{app_id}/test")
async def test_application(app_id: int):
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Get all servers for this application
        cursor.execute('SELECT id, hostname, port, type FROM servers WHERE application_id = ?', (app_id,))
        servers = cursor.fetchall()
        
        if not servers:
            return {"status": "Unknown", "message": "No servers associated"}
        
        results = []
        for server in servers:
            result = await check_server_status(server[1], server[2], server[3])
            cursor.execute(
                'UPDATE servers SET status = ?, test_response = ? WHERE id = ?',
                (result["status"], result["message"], server[0])
            )
            results.append(result)
        
        # Calculate overall application status
        if all(r["status"] == "Online" for r in results):
            status = "Online"
            message = "All servers online"
        elif all(r["status"] == "Offline" for r in results):
            status = "Offline"
            message = "All servers offline"
        else:
            status = "Partial"
            online = sum(1 for r in results if r["status"] == "Online")
            message = f"{online}/{len(results)} servers online"
        
        cursor.execute(
            'UPDATE applications SET status = ?, test_response = ? WHERE id = ?',
            (status, message, app_id)
        )
        
        conn.commit()
        return {"status": status, "message": message, "server_results": results}
    finally:
        if conn:
            conn.close()

@app.post("/applications/test-all")
async def test_all_applications():
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM applications')
        apps = cursor.fetchall()
        
        results = []
        for app in apps:
            result = await test_application(app[0])
            results.append({"id": app[0], "result": result})
        
        return {"results": results}
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
