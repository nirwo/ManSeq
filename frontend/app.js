import { Vue } from 'vue';
import { ImportModals } from './components/import-modals.js';
import { ActionButtons } from './components/action-buttons.js';

const API_BASE_URL = `http://${window.location.hostname}:3000`;

const { createApp } = Vue;

const ImportModals = {
    template: `
        <!-- Import Server Modal -->
        <div v-if="showImportServerModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
            <div class="bg-white dark:bg-gray-800 p-6 rounded-lg w-[500px]">
                <h2 class="text-xl font-bold mb-4 text-gray-900 dark:text-white">Import Servers</h2>
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Upload CSV File</label>
                        <input type="file" @change="$emit('server-file-upload', $event)" accept=".csv" class="mt-1 block w-full">
                    </div>
                </div>
                <div class="mt-6 flex justify-end space-x-3">
                    <button @click="$emit('close-server-modal')" class="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600">
                        Cancel
                    </button>
                </div>
            </div>
        </div>

        <!-- Import Application Modal -->
        <div v-if="showImportAppModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
            <div class="bg-white dark:bg-gray-800 p-6 rounded-lg w-[500px]">
                <h2 class="text-xl font-bold mb-4 text-gray-900 dark:text-white">Import Applications</h2>
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Upload CSV File</label>
                        <input type="file" @change="$emit('app-file-upload', $event)" accept=".csv" class="mt-1 block w-full">
                    </div>
                </div>
                <div class="mt-6 flex justify-end space-x-3">
                    <button @click="$emit('close-app-modal')" class="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600">
                        Cancel
                    </button>
                </div>
            </div>
        </div>

        <!-- Column Mapping Modal -->
        <div v-if="showColumnMapModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
            <div class="bg-white dark:bg-gray-800 p-6 rounded-lg w-[600px]">
                <h2 class="text-xl font-bold mb-4 text-gray-900 dark:text-white">Map CSV Columns</h2>
                <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">Please map your CSV columns to the required fields</p>
                
                <div class="space-y-4">
                    <div v-for="field in requiredFields[importType]" :key="field.name" class="flex items-center space-x-4">
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 w-1/3">
                            {{ field.label }}
                            <span v-if="field.required" class="text-red-500">*</span>
                        </label>
                        <select v-model="columnMapping[field.name]" 
                                class="mt-1 block w-2/3 rounded-md border dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                            <option value="">-- Select Column --</option>
                            <option v-for="col in availableColumns" :key="col" :value="col">{{ col }}</option>
                        </select>
                    </div>
                </div>

                <div class="mt-6 flex justify-end space-x-3">
                    <button @click="$emit('cancel-mapping')" 
                            class="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600">
                        Cancel
                    </button>
                    <button @click="$emit('confirm-mapping')" 
                            class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
                        Import
                    </button>
                </div>
            </div>
        </div>
    `,
    props: {
        showImportServerModal: Boolean,
        showImportAppModal: Boolean,
        showColumnMapModal: Boolean,
        requiredFields: Object,
        importType: String,
        availableColumns: Array,
        columnMapping: Object
    },
    emits: [
        'server-file-upload',
        'app-file-upload',
        'close-server-modal',
        'close-app-modal',
        'cancel-mapping',
        'confirm-mapping'
    ]
};

const ActionButtons = {
    template: `
        <div class="mb-4 flex justify-between items-center">
            <div class="flex space-x-4">
                <button @click="$emit('view-change', 'servers')" 
                        :class="['px-4 py-2 rounded-lg', activeView === 'servers' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-white']">
                    Servers
                </button>
                <button @click="$emit('view-change', 'applications')" 
                        :class="['px-4 py-2 rounded-lg', activeView === 'applications' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-white']">
                    Applications
                </button>
            </div>
            <div class="flex space-x-4">
                <button v-if="activeView === 'servers'" @click="$emit('show-import-server')"
                        class="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600">
                    Import Servers
                </button>
                <button v-if="activeView === 'applications'" @click="$emit('show-import-app')"
                        class="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600">
                    Import Applications
                </button>
            </div>
        </div>
    `,
    props: {
        activeView: String
    },
    emits: ['view-change', 'show-import-server', 'show-import-app']
};

export const app = createApp({
    components: {
        'import-modals': ImportModals,
        'action-buttons': ActionButtons
    },
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
        }
    },
    mounted() {
        this.fetchServers();
        this.fetchApplications();
    }
}).mount('#app');
