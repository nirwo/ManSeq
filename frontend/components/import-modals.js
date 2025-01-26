// Import modals component
export const ImportModals = {
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
}
