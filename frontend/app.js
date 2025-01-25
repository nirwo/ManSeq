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
            errorMessage: '',
            successMessage: '',
            sampleCsvUrl: 'template.csv'
        }
    },
    methods: {
        getServersByApp(appId) {
            if (!appId) {
                return this.servers.filter(server => !server.application_id)
            }
            return this.servers.filter(server => server.application_id === appId)
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
