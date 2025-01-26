const API_BASE_URL = 'http://0.0.0.0:3000';

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
            sampleCsvUrl: 'template.csv'
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
                    method: 'DELETE',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    }
                })
                
                const data = await response.json()
                
                if (!response.ok) {
                    throw new Error(data.detail || 'Failed to delete server')
                }
                
                // Remove from local state
                this.servers = this.servers.filter(s => s.id !== serverId)
                this.filterItems()
                this.showSuccess('Server deleted successfully')
            } catch (error) {
                this.showError('Error deleting server: ' + error.message)
            }
        },
        async deleteApplication(id) {
            try {
                const response = await fetch(`${API_BASE_URL}/applications/${id}`, {
                    method: 'DELETE',
                    headers: { 
                        'Accept': 'application/json',
                        'Content-Type': 'application/json' 
                    }
                });

                const data = await response.json();
                if (!response.ok) throw new Error(data.detail || 'Failed to delete application');

                // Remove from local state
                this.applications = this.applications.filter(a => a.id !== id);
                this.filterItems();
                this.showSuccess('Application deleted successfully');
            } catch (error) {
                this.showError('Error deleting application: ' + error.message);
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
        async updateServer() {
            try {
                const response = await fetch(`${API_BASE_URL}/servers/${this.editingServer.id}`, {
                    method: 'PUT',
                    headers: { 
                        'Accept': 'application/json',
                        'Content-Type': 'application/json' 
                    },
                    body: JSON.stringify(this.editingServer)
                });

                if (!response.ok) throw new Error('Failed to update server');
                await this.fetchServers();
                this.showEditServerModal = false;
                this.editingServer = null;
            } catch (error) {
                this.showError(error.message);
            }
        },
        openEditModal(server) {
            this.editingServer = { ...server };
            this.showEditServerModal = true;
        },
        async editApplication(app) {
            this.editingApp = { ...app };
            this.showEditAppModal = true;
        },
        async saveApplication() {
            try {
                const response = await fetch(`${API_BASE_URL}/applications/${this.editingApp.id}`, {
                    method: 'PUT',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: this.editingApp.name,
                        description: this.editingApp.description
                    })
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.detail || 'Failed to update application');
                }

                await this.fetchApplications();
                this.showSuccess('Application updated successfully');
                this.showEditAppModal = false;
                this.editingApp = null;
            } catch (error) {
                this.showError('Error updating application: ' + error.message);
            }
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
                        'Accept': 'application/json',
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
                    method: 'DELETE',
                    headers: { 'Accept': 'application/json' }
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
                    method: 'DELETE',
                    headers: { 'Accept': 'application/json' }
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
            if (file) {
                try {
                    const formData = new FormData();
                    formData.append('file', file);

                    const response = await fetch(`${API_BASE_URL}/servers/upload`, {
                        method: 'POST',
                        body: formData
                    });

                    if (!response.ok) throw new Error('Failed to upload file');
                    
                    const result = await response.json();
                    this.showMessage(result.message);
                    await this.fetchData();
                    this.showImportServerModal = false;
                } catch (error) {
                    this.showMessage('Error uploading file: ' + error.message, true);
                }
            }
        },

        async handleAppFileUpload(event) {
            const file = event.target.files[0];
            if (file) {
                try {
                    const formData = new FormData();
                    formData.append('file', file);

                    const response = await fetch(`${API_BASE_URL}/applications/upload`, {
                        method: 'POST',
                        body: formData
                    });

                    if (!response.ok) throw new Error('Failed to upload file');
                    
                    const result = await response.json();
                    this.showMessage(result.message);
                    await this.fetchData();
                    this.showImportAppModal = false;
                } catch (error) {
                    this.showMessage('Error uploading file: ' + error.message, true);
                }
            }
        },
    },
    async mounted() {
        await this.fetchApplications()
        await this.fetchServers()
    }
}).mount('#app')
