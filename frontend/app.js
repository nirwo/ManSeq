const { createApp } = Vue

// Use current origin's hostname for API
const API_BASE_URL = `http://${window.location.hostname}:3000`

createApp({
    data() {
        return {
            currentView: 'servers',
            servers: [],
            applications: [],
            showNewServerModal: false,
            editingServer: null,
            errorMessage: '',
            successMessage: '',
            newServer: {
                name: '',
                type: 'WEB',
                status: 'Pending',
                owner_name: '',
                owner_contact: '',
                hostname: '',
                port: 80,
                application_id: null
            },
            newApp: {
                name: '',
                description: ''
            },
            sampleCsvUrl: 'template.csv'
        }
    },
    computed: {
        uniqueOwners() {
            const ownerMap = new Map();
            
            this.servers.forEach(server => {
                if (!server.owner_name) return;
                
                if (!ownerMap.has(server.owner_name)) {
                    ownerMap.set(server.owner_name, {
                        name: server.owner_name,
                        contact: server.owner_contact,
                        servers: []
                    });
                }
                
                ownerMap.get(server.owner_name).servers.push(server);
            });
            
            return Array.from(ownerMap.values());
        }
    },
    methods: {
        showError(message) {
            this.errorMessage = message
            setTimeout(() => this.errorMessage = '', 5000)
        },
        showSuccess(message) {
            this.successMessage = message
            setTimeout(() => this.successMessage = '', 5000)
        },
        async fetchServers() {
            try {
                const response = await fetch(`${API_BASE_URL}/servers`)
                if (!response.ok) throw new Error('Failed to fetch servers')
                this.servers = await response.json()
            } catch (error) {
                this.showError('Error loading servers: ' + error.message)
            }
        },
        async fetchApplications() {
            try {
                const response = await fetch(`${API_BASE_URL}/applications`)
                if (!response.ok) throw new Error('Failed to fetch applications')
                this.applications = await response.json()
            } catch (error) {
                this.showError('Error loading applications: ' + error.message)
            }
        },
        getServersByApp(appId) {
            if (!appId) {
                return this.servers.filter(server => !server.application_id)
            }
            return this.servers.filter(server => server.application_id === appId)
        },
        getAppName(appId) {
            if (!appId) return 'No Application'
            const app = this.applications.find(a => a.id === appId)
            return app ? app.name : 'Unknown Application'
        },
        async createApplication() {
            if (!this.newApp.name) {
                this.showError('Application name is required')
                return
            }
            
            try {
                const response = await fetch(`${API_BASE_URL}/applications`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(this.newApp)
                })
                
                if (!response.ok) throw new Error('Failed to create application')
                
                await this.fetchApplications()
                this.newApp.name = ''
                this.newApp.description = ''
                this.showSuccess('Application created successfully')
            } catch (error) {
                this.showError('Error creating application: ' + error.message)
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
        editServer(server) {
            this.editingServer = server
            this.newServer = { 
                name: server.name,
                type: server.type,
                owner_name: server.owner_name,
                owner_contact: server.owner_contact,
                hostname: server.hostname || '',
                port: server.port || 80,
                application_id: server.application_id
            }
            this.showNewServerModal = true
        },
        async saveServer() {
            if (!this.newServer.name) {
                this.showError('Server name is required')
                return
            }

            const url = this.editingServer
                ? `${API_BASE_URL}/servers/${this.editingServer.id}`
                : `${API_BASE_URL}/servers`
            
            const method = this.editingServer ? 'PUT' : 'POST'
            
            try {
                const response = await fetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(this.newServer)
                })

                if (!response.ok) throw new Error('Failed to save server')

                await this.fetchServers()
                this.showNewServerModal = false
                this.editingServer = null
                this.newServer = {
                    name: '',
                    type: 'WEB',
                    status: 'Pending',
                    owner_name: '',
                    owner_contact: '',
                    hostname: '',
                    port: 80,
                    application_id: null
                }
                this.showSuccess('Server saved successfully')
            } catch (error) {
                this.showError('Error saving server: ' + error.message)
            }
        },
        async deleteServer(id) {
            if (!confirm('Are you sure you want to delete this server?')) return
            
            try {
                const response = await fetch(`${API_BASE_URL}/servers/${id}`, {
                    method: 'DELETE'
                })

                if (!response.ok) throw new Error('Failed to delete server')

                await this.fetchServers()
                this.showSuccess('Server deleted successfully')
            } catch (error) {
                this.showError('Error deleting server: ' + error.message)
            }
        },
        async deleteApplication(id) {
            if (!confirm('Are you sure you want to delete this application?')) return
            
            try {
                const response = await fetch(`${API_BASE_URL}/applications/${id}`, {
                    method: 'DELETE'
                })

                if (!response.ok) throw new Error('Failed to delete application')

                await this.fetchApplications()
                await this.fetchServers()
                this.showSuccess('Application deleted successfully')
            } catch (error) {
                this.showError('Error deleting application: ' + error.message)
            }
        },
        getStatusClass(status) {
            status = status.toLowerCase()
            return {
                'online': 'status-online',
                'offline': 'status-offline',
                'error': 'status-error',
                'pending': 'status-pending',
                'unknown': 'status-unknown'
            }[status] || 'status-unknown'
        }
    },
    async mounted() {
        await this.fetchApplications()
        await this.fetchServers()
        
        // Refresh data every 30 seconds
        setInterval(async () => {
            await this.fetchServers()
        }, 30000)
    }
}).mount('#app')
