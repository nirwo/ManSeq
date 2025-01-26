from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import sqlite3
import os
import asyncio
import aiosqlite
import platform
import subprocess
import json

app = FastAPI()

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
        if platform.system().lower() == "windows":
            cmd = ["ping", "-n", "1", "-w", "1000", hostname]
        else:
            cmd = ["ping", "-c", "1", "-W", "1", hostname]
        
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()
        
        if proc.returncode == 0:
            return {"status": "online", "response": stdout.decode()}
        else:
            return {"status": "offline", "response": stderr.decode()}
    except Exception as e:
        return {"status": "error", "response": str(e)}

async def test_port(hostname: str, port: int) -> dict:
    try:
        future = asyncio.open_connection(hostname, port)
        reader, writer = await asyncio.wait_for(future, timeout=1.0)
        writer.close()
        await writer.wait_closed()
        return {"status": "online", "response": "Port is open"}
    except Exception as e:
        return {"status": "offline", "response": str(e)}

async def update_server_status(server_id: int, status: str, test_response: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            'UPDATE servers SET status = ?, test_response = ? WHERE id = ?',
            (status, test_response, server_id)
        )
        await db.commit()

async def update_application_status(app_id: int, status: str, test_response: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            'UPDATE applications SET status = ?, test_response = ? WHERE id = ?',
            (status, test_response, app_id)
        )
        await db.commit()

async def update_all_statuses():
    while True:
        try:
            async with aiosqlite.connect(DB_PATH) as db:
                db.row_factory = sqlite3.Row
                cursor = await db.execute('SELECT id, hostname, port FROM servers')
                servers = await cursor.fetchall()
                
                for server in servers:
                    ping_result = await ping_host(server['hostname'])
                    port_result = await test_port(server['hostname'], server['port'])
                    
                    status = 'online' if ping_result['status'] == 'online' and port_result['status'] == 'online' else 'offline'
                    test_response = json.dumps({
                        'ping': ping_result,
                        'port': port_result
                    })
                    
                    await update_server_status(server['id'], status, test_response)
                
                cursor = await db.execute('SELECT id, name FROM applications')
                apps = await cursor.fetchall()
                
                for app in apps:
                    # For now, just mark all applications as online
                    await update_application_status(app['id'], 'online', 'Application status check not implemented')
        except Exception as e:
            print(f"Error updating statuses: {e}")
        finally:
            if 'db' in locals():
                await db.close()
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
        ping_result = await ping_host(server['hostname'])
        port_result = await test_port(server['hostname'], int(server['port']))
        
        return {
            'status': 'online' if ping_result['status'] == 'online' and port_result['status'] == 'online' else 'offline',
            'ping': ping_result,
            'port': port_result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/servers/validate")
async def validate_server(server: ServerValidation):
    try:
        # Test connection
        ping_result = await ping_host(server.hostname)
        if ping_result['status'] != 'online':
            return {"valid": False, "error": f"Failed to ping host: {ping_result['response']}"}
        
        # Test port
        port_result = await test_port(server.hostname, server.port)
        if port_result['status'] != 'online':
            return {"valid": False, "error": f"Failed to connect to port: {port_result['response']}"}
        
        return {"valid": True}
    except Exception as e:
        return {"valid": False, "error": str(e)}

@app.get("/servers/{server_id}")
async def get_server(server_id: int):
    try:
        async with aiosqlite.connect(DB_PATH) as db:
            db.row_factory = sqlite3.Row
            cursor = await db.execute('SELECT * FROM servers WHERE id = ?', (server_id,))
            server = await cursor.fetchone()
            
            if server is None:
                raise HTTPException(status_code=404, detail="Server not found")
            
            return dict(server)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/servers/{server_id}")
async def update_server(server_id: int, server_data: dict):
    try:
        async with aiosqlite.connect(DB_PATH) as db:
            # Check if server exists
            cursor = await db.execute('SELECT id FROM servers WHERE id = ?', (server_id,))
            if await cursor.fetchone() is None:
                raise HTTPException(status_code=404, detail="Server not found")
            
            # Update server
            await db.execute('''
                UPDATE servers 
                SET name = ?, hostname = ?, port = ?, type = ?, owner_name = ?
                WHERE id = ?
            ''', (
                server_data['name'],
                server_data['hostname'],
                server_data['port'],
                server_data['type'],
                server_data.get('owner_name'),
                server_id
            ))
            await db.commit()
            
            return {"message": "Server updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/servers/{server_id}")
async def delete_server(server_id: int):
    try:
        async with aiosqlite.connect(DB_PATH) as db:
            # Check if server exists
            cursor = await db.execute('SELECT id FROM servers WHERE id = ?', (server_id,))
            if await cursor.fetchone() is None:
                raise HTTPException(status_code=404, detail="Server not found")
            
            # Delete server
            await db.execute('DELETE FROM servers WHERE id = ?', (server_id,))
            await db.commit()
            
            return {"message": "Server deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
    try:
        async with aiosqlite.connect(DB_PATH) as db:
            cursor = await db.execute('''
                INSERT INTO applications (name, description)
                VALUES (?, ?)
            ''', (app_data['name'], app_data.get('description')))
            await db.commit()
            
            app_id = cursor.lastrowid
            return {"id": app_id, "message": "Application created successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/applications/import")
async def import_applications(import_data: dict):
    try:
        if not import_data or 'applications' not in import_data:
            raise HTTPException(status_code=400, detail="Invalid import data format")
        
        async with aiosqlite.connect(DB_PATH) as db:
            for app in import_data['applications']:
                if not all(k in app for k in ['name']):
                    raise HTTPException(status_code=400, detail=f"Missing required fields for application: {app}")
                
                await db.execute(
                    'INSERT INTO applications (name, description, status) VALUES (?, ?, ?)',
                    (app['name'], app.get('description', ''), 'online')
                )
            await db.commit()
        return {"message": "Applications imported successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/servers")
async def get_servers():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = sqlite3.Row
        cursor = await db.execute('SELECT * FROM servers')
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]

@app.post("/servers")
async def create_server(server_data: dict):
    try:
        async with aiosqlite.connect(DB_PATH) as db:
            cursor = await db.execute('''
                INSERT INTO servers (name, hostname, port, type, owner_name)
                VALUES (?, ?, ?, ?, ?)
            ''', (
                server_data['name'],
                server_data['hostname'],
                server_data['port'],
                server_data['type'],
                server_data.get('owner_name')
            ))
            await db.commit()
            
            server_id = cursor.lastrowid
            return {"id": server_id, "message": "Server created successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/servers/import")
async def import_servers(import_data: dict):
    try:
        if not import_data or 'servers' not in import_data:
            raise HTTPException(status_code=400, detail="Invalid import data format")
        
        async with aiosqlite.connect(DB_PATH) as db:
            for server in import_data['servers']:
                if not all(k in server for k in ['name', 'hostname', 'port', 'type']):
                    raise HTTPException(status_code=400, detail=f"Missing required fields for server: {server}")
                
                # Validate server connection before import
                validation = await validate_server(ServerValidation(
                    hostname=server['hostname'],
                    port=int(server['port']),
                    type=server['type']
                ))
                
                if not validation['valid']:
                    server['status'] = 'offline'
                    server['test_response'] = validation.get('error', 'Validation failed')
                else:
                    server['status'] = 'online'
                    server['test_response'] = 'Server validated successfully'
                
                await db.execute(
                    'INSERT INTO servers (name, hostname, port, type, status, test_response) VALUES (?, ?, ?, ?, ?, ?)',
                    (server['name'], server['hostname'], int(server['port']), server['type'], server['status'], server['test_response'])
                )
            await db.commit()
        return {"message": "Servers imported successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3000)
