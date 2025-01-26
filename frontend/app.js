const API_BASE_URL = `http://${window.location.hostname}:3000`;

const app = Vue.createApp({
    data() {
        return {
            servers: [],
            applications: [],
            showImportServerModal: false,
            showImportAppModal: false,
            showColumnMapModal: false,
            activeView: 'servers',
            message: '',
            messageType: '',
            availableColumns: [],
            csvData: null,
            importType: null,
            columnMapping: {},
            requiredFields: {
                server: ['name', 'hostname', 'port', 'type'],
                application: ['name', 'description']
            }
        }
    },
    methods: {
        showMessage(msg, isError = false) {
            console.log('Message:', msg, 'Error:', isError);
            this.message = msg;
            this.messageType = isError ? 'error' : 'success';
            setTimeout(() => {
                this.message = '';
                this.messageType = '';
            }, 3000);
        },
        async handleFileUpload(event, type) {
            const file = event.target.files[0];
            if (!file) return;

            try {
                console.log('Handling file upload for type:', type);
                const content = await file.text();
                const lines = content.split('\n');
                if (lines.length < 2) {
                    throw new Error('CSV file is empty');
                }

                const headers = lines[0].trim().split(',').map(h => h.trim());
                console.log('CSV Headers:', headers);
                this.availableColumns = headers;
                this.csvData = lines.slice(1);
                this.importType = type;
                this.columnMapping = {};
                
                // Auto-map columns if names match
                headers.forEach(header => {
                    const normalizedHeader = header.toLowerCase().trim();
                    if (this.requiredFields[type].includes(normalizedHeader)) {
                        this.columnMapping[normalizedHeader] = header;
                    }
                });

                console.log('Column mapping:', this.columnMapping);
                this.showColumnMapModal = true;
                if (type === 'server') {
                    this.showImportServerModal = false;
                } else {
                    this.showImportAppModal = false;
                }
            } catch (error) {
                console.error('File upload error:', error);
                this.showMessage(error.message, true);
            }
        },
        async confirmImport() {
            try {
                console.log('Starting import confirmation');
                const fields = this.requiredFields[this.importType];
                const missingRequired = fields.filter(f => !this.columnMapping[f]);
                if (missingRequired.length > 0) {
                    throw new Error(`Please map required fields: ${missingRequired.join(', ')}`);
                }

                const mappedData = this.csvData
                    .filter(line => line.trim())
                    .map(line => {
                        const values = line.split(',').map(v => v.trim());
                        const row = {};
                        fields.forEach(field => {
                            if (this.columnMapping[field]) {
                                const colIndex = this.availableColumns.indexOf(this.columnMapping[field]);
                                if (colIndex !== -1) {
                                    const value = values[colIndex] || '';
                                    row[field] = field === 'port' ? parseInt(value, 10) : value;
                                }
                            }
                        });
                        return row;
                    })
                    .filter(row => Object.keys(row).length === fields.length);

                console.log('Mapped data:', mappedData);

                const endpoint = this.importType === 'server' ? 'servers' : 'applications';
                const url = `${API_BASE_URL}/${endpoint}/import`;
                console.log('Sending import request to:', url);
                
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        data: mappedData
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    console.error('Import failed:', errorData);
                    throw new Error(errorData.detail || 'Import failed');
                }

                console.log('Import successful');
                this.showMessage('Import successful');
                this.showColumnMapModal = false;
                this.resetImport();
                
                if (this.importType === 'server') {
                    await this.fetchServers();
                } else {
                    await this.fetchApplications();
                }
            } catch (error) {
                console.error('Import confirmation error:', error);
                this.showMessage(error.message, true);
            }
        },
        resetImport() {
            this.columnMapping = {};
            this.availableColumns = [];
            this.csvData = null;
            this.importType = null;
            this.showImportServerModal = false;
            this.showImportAppModal = false;
            this.showColumnMapModal = false;
        },
        async fetchServers() {
            try {
                console.log('Fetching servers');
                const response = await fetch(`${API_BASE_URL}/servers`);
                if (!response.ok) {
                    const errorData = await response.json();
                    console.error('Failed to fetch servers:', errorData);
                    throw new Error(errorData.detail || 'Failed to fetch servers');
                }
                this.servers = await response.json();
                console.log('Fetched servers:', this.servers);
            } catch (error) {
                console.error('Fetch servers error:', error);
                this.showMessage(error.message, true);
            }
        },
        async fetchApplications() {
            try {
                console.log('Fetching applications');
                const response = await fetch(`${API_BASE_URL}/applications`);
                if (!response.ok) {
                    const errorData = await response.json();
                    console.error('Failed to fetch applications:', errorData);
                    throw new Error(errorData.detail || 'Failed to fetch applications');
                }
                this.applications = await response.json();
                console.log('Fetched applications:', this.applications);
            } catch (error) {
                console.error('Fetch applications error:', error);
                this.showMessage(error.message, true);
            }
        }
    },
    mounted() {
        console.log('App mounted, fetching initial data');
        this.fetchServers();
        this.fetchApplications();
    },
    template: `
        <div class="p-4">
            <!-- Message Toast -->
            <div v-if="message" :class="['fixed top-4 right-4 p-4 rounded-lg', messageType === 'error' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800']">
                {{ message }}
            </div>

            <!-- Navigation -->
            <div class="mb-4 flex justify-between items-center">
                <div class="flex space-x-4">
                    <button @click="activeView = 'servers'" 
                            :class="['px-4 py-2 rounded-lg', activeView === 'servers' ? 'bg-blue-500 text-white' : 'bg-gray-200']">
                        Servers
                    </button>
                    <button @click="activeView = 'applications'" 
                            :class="['px-4 py-2 rounded-lg', activeView === 'applications' ? 'bg-blue-500 text-white' : 'bg-gray-200']">
                        Applications
                    </button>
                </div>
                <div>
                    <button v-if="activeView === 'servers'" 
                            @click="showImportServerModal = true"
                            class="px-4 py-2 bg-green-500 text-white rounded-lg">
                        Import Servers
                    </button>
                    <button v-if="activeView === 'applications'" 
                            @click="showImportAppModal = true"
                            class="px-4 py-2 bg-green-500 text-white rounded-lg">
                        Import Applications
                    </button>
                </div>
            </div>

            <!-- Debug Info -->
            <div class="mb-4 p-4 bg-gray-100 rounded">
                <p>Active View: {{ activeView }}</p>
                <p>Server Count: {{ servers.length }}</p>
                <p>Application Count: {{ applications.length }}</p>
            </div>

            <!-- Servers Table -->
            <div v-if="activeView === 'servers'" class="bg-white rounded-lg p-4">
                <h2 class="text-xl font-bold mb-4">Servers ({{ servers.length }})</h2>
                <table class="min-w-full">
                    <thead>
                        <tr>
                            <th class="text-left p-2">Name</th>
                            <th class="text-left p-2">Hostname</th>
                            <th class="text-left p-2">Port</th>
                            <th class="text-left p-2">Type</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="server in servers" :key="server.id" class="border-t">
                            <td class="p-2">{{ server.name }}</td>
                            <td class="p-2">{{ server.hostname }}</td>
                            <td class="p-2">{{ server.port }}</td>
                            <td class="p-2">{{ server.type }}</td>
                        </tr>
                        <tr v-if="servers.length === 0">
                            <td colspan="4" class="p-4 text-center text-gray-500">No servers found</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- Applications Table -->
            <div v-if="activeView === 'applications'" class="bg-white rounded-lg p-4">
                <h2 class="text-xl font-bold mb-4">Applications ({{ applications.length }})</h2>
                <table class="min-w-full">
                    <thead>
                        <tr>
                            <th class="text-left p-2">Name</th>
                            <th class="text-left p-2">Description</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="app in applications" :key="app.id" class="border-t">
                            <td class="p-2">{{ app.name }}</td>
                            <td class="p-2">{{ app.description }}</td>
                        </tr>
                        <tr v-if="applications.length === 0">
                            <td colspan="2" class="p-4 text-center text-gray-500">No applications found</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- Import Server Modal -->
            <div v-if="showImportServerModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                <div class="bg-white p-6 rounded-lg w-96">
                    <h2 class="text-xl font-bold mb-4">Import Servers</h2>
                    <input type="file" @change="handleFileUpload($event, 'server')" accept=".csv" class="mb-4">
                    <div class="flex justify-end">
                        <button @click="showImportServerModal = false" class="px-4 py-2 bg-gray-200 rounded-lg">Cancel</button>
                    </div>
                </div>
            </div>

            <!-- Import Application Modal -->
            <div v-if="showImportAppModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                <div class="bg-white p-6 rounded-lg w-96">
                    <h2 class="text-xl font-bold mb-4">Import Applications</h2>
                    <input type="file" @change="handleFileUpload($event, 'application')" accept=".csv" class="mb-4">
                    <div class="flex justify-end">
                        <button @click="showImportAppModal = false" class="px-4 py-2 bg-gray-200 rounded-lg">Cancel</button>
                    </div>
                </div>
            </div>

            <!-- Column Mapping Modal -->
            <div v-if="showColumnMapModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                <div class="bg-white p-6 rounded-lg w-[500px]">
                    <h2 class="text-xl font-bold mb-4">Map CSV Columns</h2>
                    <div class="space-y-4">
                        <div v-for="field in requiredFields[importType]" :key="field" class="flex items-center space-x-4">
                            <label class="w-1/3">{{ field }}</label>
                            <select v-model="columnMapping[field]" class="w-2/3 p-2 border rounded">
                                <option value="">Select Column</option>
                                <option v-for="col in availableColumns" :key="col" :value="col">{{ col }}</option>
                            </select>
                        </div>
                    </div>
                    <div class="mt-6 flex justify-end space-x-3">
                        <button @click="showColumnMapModal = false" class="px-4 py-2 bg-gray-200 rounded-lg">Cancel</button>
                        <button @click="confirmImport" class="px-4 py-2 bg-blue-500 text-white rounded-lg">Import</button>
                    </div>
                </div>
            </div>
        </div>
    `
}).mount('#app');
