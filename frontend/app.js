const app = Vue.createApp({
    data() {
        return {
            servers: [],
            applications: [],
            activeView: 'servers',
            showImportModal: false,
            importType: null,
            importData: null
        }
    },
    methods: {
        async handleFileUpload(event) {
            const file = event.target.files[0];
            if (!file) return;

            try {
                const content = await file.text();
                const lines = content.split('\n');
                const headers = lines[0].split(',').map(h => h.trim());
                const data = lines.slice(1)
                    .filter(line => line.trim())
                    .map(line => {
                        const values = line.split(',').map(v => v.trim());
                        const row = {};
                        headers.forEach((header, index) => {
                            if (values[index]) {
                                row[header] = values[index];
                            }
                        });
                        return row;
                    });

                const endpoint = this.activeView === 'servers' ? 'servers' : 'applications';
                const response = await fetch(`http://192.168.68.56:3000/${endpoint}/import`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ [endpoint]: data })
                });

                if (!response.ok) {
                    throw new Error('Import failed');
                }

                await this.fetchData();
                this.showImportModal = false;
                alert('Import successful');
            } catch (error) {
                console.error('Import error:', error);
                alert(error.message);
            }
        },
        async fetchData() {
            try {
                const endpoint = this.activeView === 'servers' ? 'servers' : 'applications';
                const response = await fetch(`http://192.168.68.56:3000/${endpoint}`);
                const data = await response.json();
                if (this.activeView === 'servers') {
                    this.servers = data;
                } else {
                    this.applications = data;
                }
            } catch (error) {
                console.error('Fetch error:', error);
                alert('Failed to fetch data');
            }
        }
    },
    mounted() {
        this.fetchData();
    },
    watch: {
        activeView() {
            this.fetchData();
        }
    },
    template: `
        <div class="p-4">
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
                <button @click="showImportModal = true" 
                        class="px-4 py-2 bg-green-500 text-white rounded-lg">
                    Import {{ activeView === 'servers' ? 'Servers' : 'Applications' }}
                </button>
            </div>

            <!-- Servers Table -->
            <div v-if="activeView === 'servers'" class="bg-white rounded-lg p-4">
                <table class="min-w-full">
                    <thead>
                        <tr>
                            <th class="text-left p-2">Name</th>
                            <th class="text-left p-2">Hostname</th>
                            <th class="text-left p-2">Port</th>
                            <th class="text-left p-2">Type</th>
                            <th class="text-left p-2">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="server in servers" :key="server.id" class="border-t">
                            <td class="p-2">{{ server.name }}</td>
                            <td class="p-2">{{ server.hostname }}</td>
                            <td class="p-2">{{ server.port }}</td>
                            <td class="p-2">{{ server.type }}</td>
                            <td class="p-2">
                                <span :class="['px-2 py-1 rounded-full text-sm', 
                                    server.status === 'online' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800']">
                                    {{ server.status }}
                                </span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- Applications Table -->
            <div v-if="activeView === 'applications'" class="bg-white rounded-lg p-4">
                <table class="min-w-full">
                    <thead>
                        <tr>
                            <th class="text-left p-2">Name</th>
                            <th class="text-left p-2">Description</th>
                            <th class="text-left p-2">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="app in applications" :key="app.id" class="border-t">
                            <td class="p-2">{{ app.name }}</td>
                            <td class="p-2">{{ app.description }}</td>
                            <td class="p-2">
                                <span :class="['px-2 py-1 rounded-full text-sm', 
                                    app.status === 'online' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800']">
                                    {{ app.status }}
                                </span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- Import Modal -->
            <div v-if="showImportModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                <div class="bg-white p-6 rounded-lg w-96">
                    <h2 class="text-xl font-bold mb-4">Import {{ activeView === 'servers' ? 'Servers' : 'Applications' }}</h2>
                    <input type="file" @change="handleFileUpload" accept=".csv" class="mb-4">
                    <div class="flex justify-end space-x-3">
                        <button @click="showImportModal = false" class="px-4 py-2 bg-gray-200 rounded-lg">Cancel</button>
                    </div>
                </div>
            </div>
        </div>
    `
}).mount('#app');
