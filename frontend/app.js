const { createApp } = Vue

// Use current origin's hostname for API
const API_BASE_URL = `http://${window.location.hostname}:3000`

createApp({
    data() {
        return {
            applications: [],
            servers: [],
            activeView: 'servers',
            showNewServerModal: false,
            searchQuery: '',
            filteredServers: [],
            filteredApplications: [],
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
        }
    },
    methods: {
        filterItems() {
            const query = this.searchQuery.toLowerCase()
            
            // Filter servers
            this.filteredServers = this.servers.filter(server => 
                server.name.toLowerCase().includes(query) ||
                server.type.toLowerCase().includes(query) ||
                server.owner_name.toLowerCase().includes(query) ||
                server.hostname.toLowerCase().includes(query) ||
                (server.shutdown_status && server.shutdown_status.toLowerCase().includes(query))
            )
            
            // Filter applications
            this.filteredApplications = this.applications.filter(app =>
                app.name.toLowerCase().includes(query) ||
                app.description.toLowerCase().includes(query)
            )
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
                if (!response.ok) throw new Error('Failed to fetch servers')
                const data = await response.json()
                this.servers = data.servers || []
                this.filterItems()
            } catch (error) {
                this.showError('Error loading servers: ' + error.message)
            }
        },
        async fetchApplications() {
            try {
                const response = await fetch(`${API_BASE_URL}/applications`)
                if (!response.ok) throw new Error('Failed to fetch applications')
                const data = await response.json()
                this.applications = data.applications || []
                this.filterItems()
            } catch (error) {
                this.showError('Error loading applications: ' + error.message)
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
        }
    },
    async mounted() {
        await this.fetchApplications()
        await this.fetchServers()
    }
}).mount('#app')
