// Action buttons component
export const ActionButtons = {
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
}
