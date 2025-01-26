const { createApp } = Vue

const API_BASE_URL = `http://${window.location.hostname}:3000`

createApp({
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
        }
    },
    watch: {
        'newServer.type'(newType) {
            if (!this.newServer.port || this.newServer.port === '') {
                this.newServer.port = this.serverTypes[newType]?.defaultPort || '';
            }
        },
        darkMode(newVal) {
            localStorage.setItem('darkMode', newVal);
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
                const response = await fetch(`${API_BASE_URL}/servers`)
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`)
                }
                const data = await response.json()
                this.servers = data
                this.filterItems()
            } catch (error) {
                console.error('Error fetching servers:', error)
                this.showError('Failed to load servers: ' + error.message)
            }
        },
        async fetchApplications() {
            try {
                const response = await fetch(`${API_BASE_URL}/applications`)
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`)
                }
                const data = await response.json()
                this.applications = data
                this.filterItems()
            } catch (error) {
                console.error('Error fetching applications:', error)
                this.showError('Failed to load applications: ' + error.message)
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
                    headers: { 'Content-Type': 'application/json' }
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
                    headers: { 'Content-Type': 'application/json' },
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
                    headers: { 'Content-Type': 'application/json' }
                });

                if (!response.ok) throw new Error('Failed to test server');
                const result = await response.json();
                
                // Update local state
                server.status = result.status;
                server.test_response = result.message;
                this.showSuccess('Server test completed');
            } catch (error) {
                this.showError('Error testing server: ' + error.message);
            }
        },
        async testAllServers() {
            try {
                const response = await fetch(`${API_BASE_URL}/servers/test-all`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
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
                    headers: { 'Content-Type': 'application/json' }
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
                    headers: { 'Content-Type': 'application/json' }
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
    },
    async mounted() {
        await this.fetchApplications()
        await this.fetchServers()
    }
}).mount('#app')
