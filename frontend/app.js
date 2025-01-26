const API_BASE_URL = 'http://192.168.68.56:3000';

const { createApp } = Vue

const app = createApp({
    data() {
        return {
            darkMode: localStorage.getItem('darkMode') === 'true',
            applications: [],
            servers: [],
            filteredServers: [],
            filteredApplications: [],
            activeView: 'servers',
            showNewServerModal: false,
            showEditServerModal: false,
            showEditAppModal: false,
            showBulkModal: false,
            showImportServerModal: false,
            showImportAppModal: false,
            showColumnMapModal: false,
            selectedServers: [],
            bulkAction: {
                type: null,
                shutdown_status: null,
                application_id: null
            },
            editingServer: null,
            editingApp: null,
            searchQuery: '',
            serverTypes: {
                'http': { name: 'HTTP', defaultPort: 80 },
                'https': { name: 'HTTPS', defaultPort: 443 },
                'mysql': { name: 'MySQL', defaultPort: 3306 },
                'postgresql': { name: 'PostgreSQL', defaultPort: 5432 },
                'mongodb': { name: 'MongoDB', defaultPort: 27017 },
                'redis': { name: 'Redis', defaultPort: 6379 },
                'tomcat': { name: 'Tomcat', defaultPort: 8080 },
                'nodejs': { name: 'Node.js', defaultPort: 3000 },
                'python': { name: 'Python', defaultPort: 8000 },
                'mail': { name: 'Mail', defaultPort: 25 },
                'ftp': { name: 'FTP', defaultPort: 21 },
                'ssh': { name: 'SSH', defaultPort: 22 },
                'dns': { name: 'DNS', defaultPort: 53 },
                'tcp': { name: 'TCP', defaultPort: 1234 }
            },
            newServer: {
                name: '',
                type: 'http',
                status: 'Pending',
                owner_name: '',
                owner_contact: '',
                hostname: '',
                port: 80,
                application_id: null
            },
            editServer: {
                id: null,
                name: '',
                type: 'http',
                owner_name: '',
                owner_contact: '',
                hostname: '',
                port: 80,
                application_id: null
            },
            importData: '',
            errorMessage: '',
            successMessage: '',
            sampleCsvUrl: 'template.csv',
            columnMapping: {},
            availableColumns: [],
            csvData: null,
            importType: null, // 'server' or 'application'
            requiredFields: {
                server: [
                    { name: 'name', label: 'Name', required: true },
                    { name: 'hostname', label: 'Hostname', required: true },
                    { name: 'port', label: 'Port', required: true },
                    { name: 'type', label: 'Type', required: true },
                    { name: 'owner_name', label: 'Owner Name', required: false }
                ],
                application: [
                    { name: 'name', label: 'Name', required: true },
                    { name: 'description', label: 'Description', required: false }
                ]
            },
            stats: {
                servers: {
                    total: 0,
                    completed: 0,
                    inProgress: 0
                },
                applications: {
                    total: 0,
                    completed: 0,
                    inProgress: 0
                }
            },
        }
    },
    computed: {
        serverStats() {
            const total = this.servers.length
            const online = this.servers.filter(s => s.status.toLowerCase() === 'online').length
            const offline = this.servers.filter(s => s.status.toLowerCase() === 'offline').length
            const issues = this.servers.filter(s => s.status.toLowerCase() === 'error').length
            const pending = this.servers.filter(s => s.status.toLowerCase() === 'pending').length
            
            return {
                total,
                online,
                offline,
                issues,
                pending
            }
        },
        defaultPort() {
            return this.serverTypes[this.newServer.type]?.defaultPort || '';
        },
        filteredServers() {
            if (!this.searchQuery) return this.servers;
            const query = this.searchQuery.toLowerCase();
            return this.servers.filter(server => {
                return server.name.toLowerCase().includes(query) ||
                       server.hostname.toLowerCase().includes(query) ||
                       server.owner_name?.toLowerCase().includes(query) ||
                       this.serverTypes[server.type]?.name.toLowerCase().includes(query);
            });
        }
    },
    watch: {
        darkMode: {
            handler(newVal) {
                localStorage.setItem('darkMode', newVal);
                if (newVal) {
                    document.documentElement.classList.add('dark');
                } else {
                    document.documentElement.classList.remove('dark');
                }
            },
            immediate: true
        },
        'newServer.type'(newType) {
            if (!this.newServer.port || this.newServer.port === '') {
                this.newServer.port = this.serverTypes[newType]?.defaultPort || '';
            }
        }
    },
    created() {
        this.loadData()
        // Initialize dark mode
        if (localStorage.getItem('darkMode') === 'true') {
            document.documentElement.classList.add('dark')
        }
    },
    methods: {
        showMessage(message, isError = false) {
            if (isError) {
                this.errorMessage = message;
                setTimeout(() => this.errorMessage = '', 3000);
            } else {
                this.successMessage = message;
                setTimeout(() => this.successMessage = '', 3000);
            }
        },
        async loadData() {
            try {
                const headers = {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                };

                const [serversRes, appsRes] = await Promise.all([
                    fetch(`${API_BASE_URL}/servers`, { headers }),
                    fetch(`${API_BASE_URL}/applications`, { headers })
                ]);
                
                if (!serversRes.ok || !appsRes.ok) {
                    throw new Error('Server returned an error response');
                }
                
                const [servers, applications] = await Promise.all([
                    serversRes.json(),
                    appsRes.json()
                ]);
                
                this.servers = servers;
                this.applications = applications;
                this.errorMessage = '';
            } catch (error) {
                console.error('Error fetching data:', error);
                this.showMessage('Failed to connect to server', true);
            }
        },
        toggleServerSelection(serverId) {
            const index = this.selectedServers.indexOf(serverId)
            if (index === -1) {
                this.selectedServers.push(serverId)
            } else {
                this.selectedServers.splice(index, 1)
            }
        },
        selectAllServers() {
            const serverList = this.searchQuery ? this.filteredServers : this.servers
            if (this.selectedServers.length === serverList.length) {
                this.selectedServers = []
            } else {
                this.selectedServers = serverList.map(s => s.id)
            }
        },
        clearSelection() {
            this.selectedServers = []
        },
        async applyBulkAction() {
            if (!this.selectedServers.length) {
                this.showError('No servers selected')
                return
            }

            try {
                const response = await fetch(`${API_BASE_URL}/servers/bulk-update`, {
                    method: 'PUT',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        server_ids: this.selectedServers,
                        updates: {
                            type: this.bulkAction.type || undefined,
                            shutdown_status: this.bulkAction.shutdown_status || undefined,
                            application_id: this.bulkAction.application_id === 'null' ? null : 
                                         this.bulkAction.application_id || undefined
                        }
                    })
                })

                if (!response.ok) {
                    const error = await response.json()
                    throw new Error(error.detail || 'Failed to update servers')
                }

                await this.fetchServers()
                this.showSuccess('Bulk update successful')
                this.selectedServers = []
                this.showBulkModal = false
                this.bulkAction = {
                    type: null,
                    shutdown_status: null,
                    application_id: null
                }
            } catch (error) {
                this.showError('Error updating servers: ' + error.message)
            }
        },
        filterItems() {
            if (!this.searchQuery) {
                this.filteredServers = this.servers;
                return;
            }
            
            const query = this.searchQuery.toLowerCase();
            
            if (this.activeView === 'servers') {
                this.filteredServers = this.servers.filter(server => {
                    const appName = this.getAppName(server.application_id) || '';
                    return (
                        (server.name || '').toLowerCase().includes(query) ||
                        (server.type || '').toLowerCase().includes(query) ||
                        (server.owner_name || '').toLowerCase().includes(query) ||
                        (server.hostname || '').toLowerCase().includes(query) ||
                        appName.toLowerCase().includes(query)
                    );
                });
            }
        },
        async handleFileUpload(event) {
            const file = event.target.files[0]
            if (!file) return

            const formData = new FormData()
            formData.append('file', file)

            try {
                const response = await fetch(`${API_BASE_URL}/servers/import-csv`, {
                    method: 'POST',
                    body: formData
                })

                if (!response.ok) throw new Error('Failed to import CSV')

                await this.fetchServers()
                event.target.value = ''
                this.showSuccess('CSV imported successfully')
            } catch (error) {
                this.showError('Error importing CSV: ' + error.message)
            }
        },
        getServersByApp(appId) {
            const serverList = this.searchQuery ? this.filteredServers : this.servers
            if (!appId) {
                return serverList.filter(server => !server.application_id)
            }
            return serverList.filter(server => server.application_id === appId)
        },
        getAppName(appId) {
            if (!appId) return 'No Application'
            const app = this.applications.find(a => a.id === appId)
            return app ? app.name : 'Unknown'
        },
        async fetchServers() {
            try {
                const headers = {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                };

                const response = await fetch(`${API_BASE_URL}/servers`, { headers });
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                this.servers = data;
                this.filterItems();
                
                // Update stats
                this.stats.servers.total = this.servers.length;
                this.stats.servers.completed = this.servers.filter(s => s.status === 'completed').length;
                this.stats.servers.inProgress = this.servers.filter(s => s.status === 'in_progress').length;
            } catch (error) {
                console.error('Error fetching servers:', error);
                this.showError('Failed to load servers: ' + error.message);
            }
        },
        async fetchApplications() {
            try {
                const headers = {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                };

                const response = await fetch(`${API_BASE_URL}/applications`, { headers });
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                this.applications = data;
                this.filterItems();
                
                // Update stats
                this.stats.applications.total = this.applications.length;
                this.stats.applications.completed = this.applications.filter(a => a.status === 'completed').length;
                this.stats.applications.inProgress = this.applications.filter(a => a.status === 'in_progress').length;
            } catch (error) {
                console.error('Error fetching applications:', error);
                this.showError('Failed to load applications: ' + error.message);
            }
        },
        getDefaultPort(type) {
            const typeConfig = this.serverTypes[type] || this.serverTypes['http']
            return typeConfig.defaultPort || null
        },
        updateServerPort() {
            const defaultPort = this.getDefaultPort(this.newServer.type)
            if (defaultPort) {
                this.newServer.port = defaultPort
            }
        },
        async updateShutdownStatus(server) {
            try {
                const response = await fetch(`${API_BASE_URL}/servers/${server.id}`, {
                    method: 'PUT',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        shutdown_status: server.shutdown_status
                    })
                })
                
                if (!response.ok) {
                    const error = await response.json()
                    throw new Error(error.detail || 'Failed to update status')
                }
                
                this.showSuccess('Status updated successfully')
            } catch (error) {
                this.showError('Error updating status: ' + error.message)
                await this.fetchServers()
            }
        },
        async deleteServer(serverId) {
            try {
                const response = await fetch(`${API_BASE_URL}/servers/${serverId}`, {
                    method: 'DELETE'
                });

                if (!response.ok) {
                    throw new Error('Failed to delete server');
                }

                this.showMessage('Server deleted successfully');
                await this.fetchServers();
            } catch (error) {
                this.showMessage('Error: ' + error.message, true);
            }
        },
        async deleteApplication(appId) {
            try {
                const response = await fetch(`${API_BASE_URL}/applications/${appId}`, {
                    method: 'DELETE'
                });

                if (!response.ok) {
                    throw new Error('Failed to delete application');
                }

                this.showMessage('Application deleted successfully');
                await this.fetchApplications();
            } catch (error) {
                this.showMessage('Error: ' + error.message, true);
            }
        },
        async updateServer(server) {
            try {
                const response = await fetch(`${API_BASE_URL}/servers/${server.id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(server)
                });

                if (!response.ok) {
                    throw new Error('Failed to update server');
                }

                this.showMessage('Server updated successfully');
                await this.fetchServers();
            } catch (error) {
                this.showMessage('Error: ' + error.message, true);
            }
        },
        async updateApplication(app) {
            try {
                const response = await fetch(`${API_BASE_URL}/applications/${app.id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(app)
                });

                if (!response.ok) {
                    throw new Error('Failed to update application');
                }

                this.showMessage('Application updated successfully');
                await this.fetchApplications();
            } catch (error) {
                this.showMessage('Error: ' + error.message, true);
            }
        },
        getStatusClass(status) {
            return {
                'online': 'status-online',
                'offline': 'status-offline',
                'error': 'status-error',
                'pending': 'status-pending',
                'unknown': 'status-unknown'
            }[status.toLowerCase()] || 'status-unknown'
        },
        showError(message) {
            this.errorMessage = message
            setTimeout(() => this.errorMessage = '', 5000)
        },
        showSuccess(message) {
            this.successMessage = message
            setTimeout(() => this.successMessage = '', 5000)
        },
        async testServer(server) {
            try {
                const response = await fetch(`${API_BASE_URL}/servers/${server.id}/test`, {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    }
                });
                
                if (!response.ok) throw new Error('Server test failed');
                
                const result = await response.json();
                await this.fetchData();
                this.successMessage = `Server ${server.name} tested`;
                setTimeout(() => this.successMessage = '', 3000);
            } catch (error) {
                this.errorMessage = `Failed to test server: ${error.message}`;
                setTimeout(() => this.errorMessage = '', 3000);
            }
        },
        async testAllServers() {
            try {
                const response = await fetch(`${API_BASE_URL}/servers/test-all`, {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) throw new Error('Failed to test servers');
                const data = await response.json();
                
                // Update local state
                data.results.forEach(result => {
                    const server = this.servers.find(s => s.id === result.id);
                    if (server) {
                        server.status = result.result.status;
                        server.test_response = result.result.message;
                    }
                });
                this.showSuccess('All servers tested successfully');
            } catch (error) {
                this.showError('Error testing servers: ' + error.message);
            }
        },
        async testApplication(app) {
            try {
                const response = await fetch(`${API_BASE_URL}/applications/${app.id}/test`, {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) throw new Error('Failed to test application');
                const result = await response.json();
                
                // Update local state
                app.status = result.status;
                app.test_response = result.message;
                
                // Update associated servers
                if (result.server_results) {
                    const servers = this.servers.filter(s => s.application_id === app.id);
                    result.server_results.forEach((res, idx) => {
                        if (servers[idx]) {
                            servers[idx].status = res.status;
                            servers[idx].test_response = res.message;
                        }
                    });
                }
                
                this.showSuccess('Application test completed');
            } catch (error) {
                this.showError('Error testing application: ' + error.message);
            }
        },
        async testAllApplications() {
            try {
                const response = await fetch(`${API_BASE_URL}/applications/test-all`, {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) throw new Error('Failed to test applications');
                const data = await response.json();
                
                // Update local state
                data.results.forEach(result => {
                    const app = this.applications.find(a => a.id === result.id);
                    if (app) {
                        app.status = result.result.status;
                        app.test_response = result.result.message;
                    }
                });
                
                this.showSuccess('All applications tested successfully');
            } catch (error) {
                this.showError('Error testing applications: ' + error.message);
            }
        },
        async editServer(server) {
            this.editingServer = { ...server };
            this.showEditServerModal = true;
        },
        async saveServer() {
            try {
                const response = await fetch(`${API_BASE_URL}/servers/${this.editingServer.id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(this.editingServer)
                });

                if (!response.ok) throw new Error('Failed to update server');
                
                await this.fetchData();
                this.showEditServerModal = false;
                this.showMessage('Server updated successfully');
            } catch (error) {
                this.showMessage('Failed to update server: ' + error.message, true);
            }
        },
        async deleteServer(id) {
            if (!confirm('Are you sure you want to delete this server?')) return;
            
            try {
                const response = await fetch(`${API_BASE_URL}/servers/${id}`, {
                    method: 'DELETE'
                });
                
                if (!response.ok) throw new Error('Failed to delete server');
                
                await this.fetchData();
                this.showMessage('Server deleted successfully');
            } catch (error) {
                this.showMessage('Failed to delete server: ' + error.message, true);
            }
        },
        async deleteApplication(id) {
            if (!confirm('Are you sure you want to delete this application?')) return;
            
            try {
                const response = await fetch(`${API_BASE_URL}/applications/${id}`, {
                    method: 'DELETE'
                });
                
                if (!response.ok) throw new Error('Failed to delete application');
                
                await this.fetchData();
                this.showMessage('Application deleted successfully');
            } catch (error) {
                this.showMessage('Failed to delete application: ' + error.message, true);
            }
        },
        async testServer(server) {
            try {
                const response = await fetch(`${API_BASE_URL}/servers/${server.id}/test`, {
                    method: 'POST',
                    headers: { 'Accept': 'application/json' }
                });
                
                if (!response.ok) throw new Error('Server test failed');
                
                await this.fetchData();
                this.showMessage(`Server ${server.name} tested successfully`);
            } catch (error) {
                this.showMessage('Failed to test server: ' + error.message, true);
            }
        },
        async testAllServers() {
            try {
                const response = await fetch(`${API_BASE_URL}/servers/test-all`, {
                    method: 'POST',
                    headers: { 'Accept': 'application/json' }
                });
                
                if (!response.ok) throw new Error('Failed to test servers');
                
                await this.fetchData();
                this.showMessage('All servers tested successfully');
            } catch (error) {
                this.showMessage('Failed to test servers: ' + error.message, true);
            }
        },
        async testApplication(app) {
            try {
                const response = await fetch(`${API_BASE_URL}/applications/${app.id}/test`, {
                    method: 'POST',
                    headers: { 'Accept': 'application/json' }
                });
                
                if (!response.ok) throw new Error('Application test failed');
                
                await this.fetchData();
                this.showMessage(`Application ${app.name} tested successfully`);
            } catch (error) {
                this.showMessage('Failed to test application: ' + error.message, true);
            }
        },
        async testAllApplications() {
            try {
                const response = await fetch(`${API_BASE_URL}/applications/test-all`, {
                    method: 'POST',
                    headers: { 'Accept': 'application/json' }
                });
                
                if (!response.ok) throw new Error('Failed to test applications');
                
                await this.fetchData();
                this.showMessage('All applications tested successfully');
            } catch (error) {
                this.showMessage('Failed to test applications: ' + error.message, true);
            }
        },
        async importServers() {
            try {
                const lines = this.importData.trim().split('\n');
                const servers = lines.map(line => {
                    const [name, hostname, port, type, owner_name] = line.split(',').map(s => s.trim());
                    return { name, hostname, port: parseInt(port), type, owner_name };
                });

                const response = await fetch(`${API_BASE_URL}/servers/import`, {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ servers })
                });

                if (!response.ok) throw new Error('Failed to import servers');
                
                await this.fetchData();
                this.showImportServerModal = false;
                this.importData = '';
                this.showMessage('Servers imported successfully');
            } catch (error) {
                this.showMessage('Failed to import servers: ' + error.message, true);
            }
        },
        async importApplications() {
            try {
                const lines = this.importData.trim().split('\n');
                const applications = lines.map(line => {
                    const [name, description] = line.split(',').map(s => s.trim());
                    return { name, description };
                });

                const response = await fetch(`${API_BASE_URL}/applications/import`, {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ applications })
                });

                if (!response.ok) throw new Error('Failed to import applications');
                
                await this.fetchData();
                this.showImportAppModal = false;
                this.importData = '';
                this.showMessage('Applications imported successfully');
            } catch (error) {
                this.showMessage('Failed to import applications: ' + error.message, true);
            }
        },
        async handleServerFileUpload(event) {
            const file = event.target.files[0];
            if (!file) return

            const formData = new FormData()
            formData.append('file', file)

            try {
                const response = await fetch(`${API_BASE_URL}/servers/import-csv`, {
                    method: 'POST',
                    body: formData
                })

                if (!response.ok) throw new Error('Failed to import CSV')

                await this.fetchServers()
                event.target.value = ''
                this.showSuccess('CSV imported successfully')
            } catch (error) {
                this.showError('Error importing CSV: ' + error.message)
            }
        },
        async handleAppFileUpload(event) {
            const file = event.target.files[0];
            if (file) {
                try {
                    if (!file.name.endsWith('.csv')) {
                        throw new Error('Please upload a CSV file');
                    }

                    const content = await file.text();
                    const lines = content.split('\n');
                    if (lines.length < 2) {
                        throw new Error('CSV file is empty');
                    }

                    const headers = lines[0].trim().split(',');
                    this.availableColumns = headers;
                    this.csvData = lines.slice(1);
                    this.importType = 'server';
                    this.columnMapping = {};
                    
                    // Auto-map columns if names match
                    headers.forEach(header => {
                        const normalizedHeader = header.toLowerCase().trim();
                        if (this.requiredFields.server.some(field => field.name === normalizedHeader)) {
                            this.columnMapping[normalizedHeader] = header;
                        }
                    });

                    this.showColumnMapModal = true;
                    this.showImportServerModal = false;
                } catch (error) {
                    this.showMessage('Error: ' + error.message, true);
                }
            }
        },

        async confirmMapping() {
            try {
                const fields = this.requiredFields[this.importType];
                const missingRequired = fields.filter(f => f.required && !this.columnMapping[f.name]);
                if (missingRequired.length > 0) {
                    throw new Error(`Please map required fields: ${missingRequired.map(f => f.label).join(', ')}`);
                }

                const mappedData = this.csvData
                    .filter(line => line.trim())  // Skip empty lines
                    .map(line => {
                        const values = line.split(',').map(v => v.trim());
                        const row = {};
                        fields.forEach(field => {
                            if (this.columnMapping[field.name]) {
                                const colIndex = this.availableColumns.indexOf(this.columnMapping[field.name]);
                                if (colIndex !== -1) {
                                    row[field.name] = values[colIndex] || '';
                                }
                            }
                        });
                        return row;
                    })
                    .filter(row => Object.keys(row).length > 0);

                const formData = new FormData();
                const jsonData = JSON.stringify({ data: mappedData, mapping: this.columnMapping });
                const blob = new Blob([jsonData], { type: 'application/json' });
                formData.append('file', blob, 'data.json');

                const endpoint = this.importType === 'server' ? 'servers' : 'applications';
                const response = await fetch(`${API_BASE_URL}/${endpoint}/upload`, {
                    method: 'POST',
                    body: formData
                });

                const result = await response.json();
                if (!response.ok) {
                    throw new Error(result.error || result.detail || 'Import failed');
                }

                this.showMessage(result.message);
                await this.fetchData();
                this.showColumnMapModal = false;
                this.resetImport();
            } catch (error) {
                this.showMessage('Error: ' + error.message, true);
            }
        },

        cancelMapping() {
            this.showColumnMapModal = false;
            this.resetImport();
        },

        resetImport() {
            this.columnMapping = {};
            this.availableColumns = [];
            this.csvData = null;
            this.importType = null;
        },
    },
    async mounted() {
        await this.fetchApplications()
        await this.fetchServers()
    }
}).mount('#app')
