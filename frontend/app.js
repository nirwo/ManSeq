const API_BASE_URL = `http://${window.location.hostname}:3000`;

const app = createApp({
    data() {
        return {
            servers: [],
            applications: [],
            showEditServerModal: false,
            showEditAppModal: false,
            showImportServerModal: false,
            showImportAppModal: false,
            showColumnMapModal: false,
            editingServer: null,
            editingApp: null,
            activeView: 'servers',
            message: '',
            messageType: '',
            availableColumns: [],
            csvData: null,
            importType: null,
            columnMapping: {},
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
                servers: { total: 0, completed: 0, inProgress: 0 },
                applications: { total: 0, completed: 0, inProgress: 0 }
            }
        }
    },
    methods: {
        showMessage(msg, isError = false) {
            this.message = msg;
            this.messageType = isError ? 'error' : 'success';
            setTimeout(() => {
                this.message = '';
                this.messageType = '';
            }, 3000);
        },
        getStatusClass(status) {
            return status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800';
        },
        async fetchServers() {
            try {
                const response = await fetch(`${API_BASE_URL}/servers`);
                if (!response.ok) throw new Error('Failed to fetch servers');
                this.servers = await response.json();
                this.updateStats();
            } catch (error) {
                this.showMessage(error.message, true);
            }
        },
        async fetchApplications() {
            try {
                const response = await fetch(`${API_BASE_URL}/applications`);
                if (!response.ok) throw new Error('Failed to fetch applications');
                this.applications = await response.json();
                this.updateStats();
            } catch (error) {
                this.showMessage(error.message, true);
            }
        },
        updateStats() {
            this.stats.servers.total = this.servers.length;
            this.stats.servers.completed = this.servers.filter(s => s.status === 'completed').length;
            this.stats.servers.inProgress = this.servers.filter(s => s.status === 'in_progress').length;

            this.stats.applications.total = this.applications.length;
            this.stats.applications.completed = this.applications.filter(a => a.status === 'completed').length;
            this.stats.applications.inProgress = this.applications.filter(a => a.status === 'in_progress').length;
        },
        editServer(server) {
            this.editingServer = JSON.parse(JSON.stringify(server));
            this.showEditServerModal = true;
        },
        editApplication(app) {
            this.editingApp = JSON.parse(JSON.stringify(app));
            this.showEditAppModal = true;
        },
        async saveServerEdit() {
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
                this.showMessage('Server updated successfully');
            } catch (error) {
                this.showMessage(error.message, true);
            }
        },
        async saveApplicationEdit() {
            try {
                const response = await fetch(`${API_BASE_URL}/applications/${this.editingApp.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(this.editingApp)
                });

                if (!response.ok) throw new Error('Failed to update application');

                await this.fetchApplications();
                this.showEditAppModal = false;
                this.editingApp = null;
                this.showMessage('Application updated successfully');
            } catch (error) {
                this.showMessage(error.message, true);
            }
        },
        async testServer(server) {
            try {
                this.showMessage('Testing server...');
                const response = await fetch(`${API_BASE_URL}/servers/${server.id}/test`, {
                    method: 'POST'
                });

                if (!response.ok) throw new Error('Failed to test server');

                const result = await response.json();
                this.showMessage(result.message);
                await this.fetchServers();
            } catch (error) {
                this.showMessage(error.message, true);
            }
        },
        async deleteServer(id) {
            if (!confirm('Delete this server?')) return;
            
            try {
                const response = await fetch(`${API_BASE_URL}/servers/${id}`, {
                    method: 'DELETE'
                });
                
                if (!response.ok) throw new Error('Failed to delete server');
                
                await this.fetchServers();
                this.showMessage('Server deleted');
            } catch (error) {
                this.showMessage(error.message, true);
            }
        },
        async deleteApplication(id) {
            if (!confirm('Delete this application?')) return;
            
            try {
                const response = await fetch(`${API_BASE_URL}/applications/${id}`, {
                    method: 'DELETE'
                });
                
                if (!response.ok) throw new Error('Failed to delete application');
                
                await this.fetchApplications();
                this.showMessage('Application deleted');
            } catch (error) {
                this.showMessage(error.message, true);
            }
        },
        async handleServerFileUpload(event) {
            const file = event.target.files[0];
            if (!file) return;

            if (!file.name.endsWith('.csv')) {
                this.showMessage('Please upload a CSV file', true);
                return;
            }

            try {
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
                this.showMessage(error.message, true);
            }
        },

        async handleAppFileUpload(event) {
            const file = event.target.files[0];
            if (!file) return;

            if (!file.name.endsWith('.csv')) {
                this.showMessage('Please upload a CSV file', true);
                return;
            }

            try {
                const content = await file.text();
                const lines = content.split('\n');
                if (lines.length < 2) {
                    throw new Error('CSV file is empty');
                }

                const headers = lines[0].trim().split(',');
                this.availableColumns = headers;
                this.csvData = lines.slice(1);
                this.importType = 'application';
                this.columnMapping = {};
                
                // Auto-map columns if names match
                headers.forEach(header => {
                    const normalizedHeader = header.toLowerCase().trim();
                    if (this.requiredFields.application.some(field => field.name === normalizedHeader)) {
                        this.columnMapping[normalizedHeader] = header;
                    }
                });

                this.showColumnMapModal = true;
                this.showImportAppModal = false;
            } catch (error) {
                this.showMessage(error.message, true);
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
                    .filter(line => line.trim())
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

                const endpoint = this.importType === 'server' ? 'servers' : 'applications';
                const response = await fetch(`${API_BASE_URL}/${endpoint}/import`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        data: mappedData
                    })
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.detail || 'Import failed');
                }

                this.showMessage('Import successful');
                this.showColumnMapModal = false;
                this.resetImport();
                
                if (this.importType === 'server') {
                    await this.fetchServers();
                } else {
                    await this.fetchApplications();
                }
            } catch (error) {
                this.showMessage(error.message, true);
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
            this.showImportServerModal = false;
            this.showImportAppModal = false;
        },
    },
    mounted() {
        this.fetchServers();
        this.fetchApplications();
    }
}).mount('#app');
