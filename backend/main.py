from fastapi import FastAPI, HTTPException, UploadFile, File, Request, JSONResponse
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
import socket
import aiohttp

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins in development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "servers.db")

# Database connection management
def get_db():
    db = sqlite3.connect(DB_PATH, timeout=30.0, isolation_level=None)
    db.execute('PRAGMA journal_mode=WAL')
    db.row_factory = sqlite3.Row
    return db

def init_db():
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Create servers table
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS servers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            hostname TEXT NOT NULL,
            port INTEGER NOT NULL,
            type TEXT NOT NULL,
            owner_name TEXT,
            application_id INTEGER,
            status TEXT DEFAULT 'offline',
            test_response TEXT,
            FOREIGN KEY (application_id) REFERENCES applications (id)
        )
        ''')
        
        # Create applications table
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS applications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'offline',
            test_response TEXT
        )
        ''')
        
        # Add status column if it doesn't exist in servers table
        cursor.execute("PRAGMA table_info(servers)")
        columns = [col[1] for col in cursor.fetchall()]
        if 'status' not in columns:
            cursor.execute('ALTER TABLE servers ADD COLUMN status TEXT DEFAULT "offline"')
            cursor.execute('ALTER TABLE servers ADD COLUMN test_response TEXT')
            
        # Add status column if it doesn't exist in applications table
        cursor.execute("PRAGMA table_info(applications)")
        columns = [col[1] for col in cursor.fetchall()]
        if 'status' not in columns:
            cursor.execute('ALTER TABLE applications ADD COLUMN status TEXT DEFAULT "offline"')
            cursor.execute('ALTER TABLE applications ADD COLUMN test_response TEXT')
            
        conn.commit()

init_db()

async def ping_host(hostname: str) -> dict:
    try:
        # Run ping command with timeout
        result = subprocess.run(['ping', '-c', '1', '-W', '2', hostname], 
                              capture_output=True, text=True)
        if result.returncode == 0:
            return {"status": "online", "message": "Host is reachable (ping successful)"}
        return {"status": "offline", "message": "Host is not responding to ping"}
    except Exception as e:
        return {"status": "offline", "message": f"Ping failed: {str(e)}"}

async def check_server_status(hostname: str, port: int, server_type: str) -> dict:
    try:
        if not hostname or not port:
            return {"status": "offline", "message": "Invalid hostname or port"}

        # Always try ping first
        ping_result = await ping_host(hostname)
        
        # If ping succeeds, try service-specific test
        if ping_result["status"] == "online":
            try:
                if server_type.lower() == "http":
                    try:
                        async with aiohttp.ClientSession() as session:
                            async with session.get(f"http://{hostname}:{port}", timeout=5) as response:
                                return {"status": "online", "message": f"HTTP server responded with status {response.status}"}
                    except Exception as e:
                        return {"status": "online", "message": f"Host reachable but HTTP service error: {str(e)}"}
                else:
                    # Default TCP check
                    try:
                        reader, writer = await asyncio.wait_for(
                            asyncio.open_connection(hostname, port),
                            timeout=5
                        )
                        writer.close()
                        await writer.wait_closed()
                        return {"status": "online", "message": f"TCP connection successful on port {port}"}
                    except Exception as e:
                        return {"status": "online", "message": f"Host reachable but service error: {str(e)}"}
            except Exception as e:
                # Even if service test fails, if ping works we mark as online
                return ping_result
        
        return ping_result
        
    except Exception as e:
        return {"status": "offline", "message": f"Test failed: {str(e)}"}

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
                    if all(s == "online" for s in statuses):
                        status = "online"
                        message = "All servers online"
                    elif all(s == "offline" for s in statuses):
                        status = "offline"
                        message = "All servers offline"
                    else:
                        status = "partial"
                        online = sum(1 for s in statuses if s == "online")
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

@app.post("/servers/test")
async def test_server(server: dict):
    try:
        result = await check_server_status(server.get("hostname"), server.get("port"), server.get("type", "tcp"))
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/servers/{server_id}/test")
async def test_server_endpoint(server_id: int):
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
        db = get_db()
        cursor = db.cursor()
        
        cursor.execute("SELECT * FROM servers")
        servers = cursor.fetchall()
        
        for server in servers:
            try:
                test_response = await check_server_status(server[1], server[2], server[3])
                cursor.execute(
                    "UPDATE servers SET status = ?, test_response = ? WHERE id = ?",
                    (test_response["status"], json.dumps(test_response), server[0])
                )
                db.commit()
            except Exception as e:
                print(f"Error testing server {server['id']}: {str(e)}")
                continue
        
        cursor.execute("SELECT * FROM applications")
        applications = cursor.fetchall()
        
        for app in applications:
            try:
                cursor.execute("SELECT status FROM servers WHERE application_id = ?", (app["id"],))
                server_statuses = [row[0] for row in cursor.fetchall()]
                
                app_status = "online" if server_statuses and all(status == "online" for status in server_statuses) else "offline"
                
                cursor.execute(
                    "UPDATE applications SET status = ? WHERE id = ?",
                    (app_status, app["id"])
                )
                db.commit()
            except Exception as e:
                print(f"Error updating application {app['id']}: {str(e)}")
                continue
        
        return {"message": "All servers and applications tested successfully"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

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
        db = get_db()
        cursor = db.cursor()
        
        # Get all servers for this application
        cursor.execute('SELECT id, hostname, port, type FROM servers WHERE application_id = ?', (app_id,))
        servers = cursor.fetchall()
        
        if not servers:
            return {"status": "Unknown", "message": "No servers associated"}
        
        results = []
        for server in servers:
            try:
                test_response = await check_server_status(server[1], server[2], server[3])
                cursor.execute(
                    'UPDATE servers SET status = ?, test_response = ? WHERE id = ?',
                    (test_response["status"], json.dumps(test_response), server[0])
                )
                db.commit()
                results.append(test_response)
            except Exception as e:
                print(f"Error testing server {server['id']}: {str(e)}")
                continue
        
        # Calculate overall application status
        if all(r["status"] == "online" for r in results):
            status = "online"
            message = "All servers online"
        elif all(r["status"] == "offline" for r in results):
            status = "offline"
            message = "All servers offline"
        else:
            status = "partial"
            online = sum(1 for r in results if r["status"] == "online")
            message = f"{online}/{len(results)} servers online"
        
        cursor.execute(
            'UPDATE applications SET status = ? WHERE id = ?',
            (status, app_id)
        )
        db.commit()
        
        return {"status": status, "message": message, "server_results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@app.post("/applications/test-all")
async def test_all_applications():
    try:
        db = get_db()
        cursor = db.cursor()
        
        cursor.execute("SELECT * FROM applications")
        applications = cursor.fetchall()
        
        for app in applications:
            try:
                cursor.execute("SELECT * FROM servers WHERE application_id = ?", (app["id"],))
                servers = cursor.fetchall()
                
                for server in servers:
                    test_response = await check_server_status(server[1], server[2], server[3])
                    cursor.execute(
                        'UPDATE servers SET status = ?, test_response = ? WHERE id = ?',
                        (test_response["status"], json.dumps(test_response), server[0])
                    )
                    db.commit()
                
                cursor.execute("SELECT status FROM servers WHERE application_id = ?", (app["id"],))
                server_statuses = [row[0] for row in cursor.fetchall()]
                
                app_status = "online" if server_statuses and all(status == "online" for status in server_statuses) else "offline"
                
                cursor.execute(
                    "UPDATE applications SET status = ? WHERE id = ?",
                    (app_status, app["id"])
                )
                db.commit()
                
            except Exception as e:
                print(f"Error testing application {app['id']}: {str(e)}")
                continue
        
        return {"message": "All applications tested successfully"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@app.post("/servers/import")
async def import_servers(request: Request):
    try:
        data = await request.json()
        servers = data.get("servers", [])
        
        # Validate and insert servers
        for server in servers:
            if not all(k in server for k in ["name", "hostname", "port", "type", "owner_name"]):
                raise HTTPException(status_code=400, detail="Invalid server data format")
        
        # Insert servers into database
        with get_db() as db:
            for server in servers:
                db.execute(
                    "INSERT INTO servers (name, hostname, port, type, owner_name) VALUES (?, ?, ?, ?, ?)",
                    (server["name"], server["hostname"], server["port"], server["type"], server["owner_name"])
                )
            db.commit()
        
        return {"message": "Servers imported successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/applications/import")
async def import_applications(request: Request):
    try:
        data = await request.json()
        applications = data.get("applications", [])
        
        # Validate and insert applications
        for app in applications:
            if not all(k in app for k in ["name", "description"]):
                raise HTTPException(status_code=400, detail="Invalid application data format")
        
        # Insert applications into database
        with get_db() as db:
            for app in applications:
                db.execute(
                    "INSERT INTO applications (name, description) VALUES (?, ?)",
                    (app["name"], app["description"])
                )
            db.commit()
        
        return {"message": "Applications imported successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/servers/upload")
async def upload_servers_csv(file: UploadFile = File(...)):
    try:
        content = await file.read()
        data = json.loads(content)
        
        if not isinstance(data, dict) or 'data' not in data:
            return JSONResponse(
                status_code=400,
                content={"error": "Invalid data format"}
            )
        
        servers = []
        for i, row in enumerate(data['data'], 1):
            try:
                server = {
                    "name": row['name'],
                    "hostname": row['hostname'],
                    "port": int(row['port']),
                    "type": row['type'],
                    "owner_name": row.get('owner_name', '')
                }
                if not all([server['name'], server['hostname'], server['type']]):
                    return JSONResponse(
                        status_code=400,
                        content={"error": f"Row {i}: Empty required fields"}
                    )
                servers.append(server)
            except Exception as e:
                return JSONResponse(
                    status_code=400,
                    content={"error": f"Row {i}: {str(e)}"}
                )
        
        with get_db() as db:
            for server in servers:
                db.execute(
                    "INSERT INTO servers (name, hostname, port, type, owner_name) VALUES (?, ?, ?, ?, ?)",
                    (server["name"], server["hostname"], server["port"], server["type"], server["owner_name"])
                )
            db.commit()
        
        return {"message": f"Imported {len(servers)} servers"}
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.post("/applications/upload")
async def upload_applications_csv(file: UploadFile = File(...)):
    try:
        content = await file.read()
        data = json.loads(content)
        
        if not isinstance(data, dict) or 'data' not in data:
            return JSONResponse(
                status_code=400,
                content={"error": "Invalid data format"}
            )
        
        apps = []
        for i, row in enumerate(data['data'], 1):
            try:
                app = {
                    "name": row['name'],
                    "description": row.get('description', '')
                }
                if not app['name']:
                    return JSONResponse(
                        status_code=400,
                        content={"error": f"Row {i}: Name cannot be empty"}
                    )
                apps.append(app)
            except Exception as e:
                return JSONResponse(
                    status_code=400,
                    content={"error": f"Row {i}: {str(e)}"}
                )
        
        with get_db() as db:
            for app in apps:
                db.execute(
                    "INSERT INTO applications (name, description) VALUES (?, ?)",
                    (app["name"], app["description"])
                )
            db.commit()
        
        return {"message": f"Imported {len(apps)} applications"}
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

if __name__ == "__main__":
    import uvicorn
    from pathlib import Path
    import os
    
    # Get the directory containing the script
    script_dir = Path(__file__).parent.absolute()
    os.chdir(script_dir)
    
    # Initialize database
    init_db()
    
    # Run the server
    uvicorn.run("main:app", host="0.0.0.0", port=3000, reload=True)
