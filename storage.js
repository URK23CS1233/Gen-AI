// Storage management for AI Chat Assistant
class StorageManager {
    constructor() {
        this.storageKeys = {
            CHAT_HISTORY: 'chatHistory',
            CONVERSATION_SESSIONS: 'conversationSessions',
            USER_PREFERENCES: 'userPreferences',
            ANALYTICS_DATA: 'analyticsData',
            CACHED_RESPONSES: 'cachedResponses'
        };
        
        this.maxHistorySize = 1000; // Maximum number of messages to store
        this.maxSessions = 50; // Maximum number of conversation sessions
        this.cacheExpiryHours = 24; // Cache expiry in hours
        
        this.initializeStorage();
    }
    
    async initializeStorage() {
        try {
            // Check if storage is available
            await chrome.storage.local.get('test');
            console.log('Storage initialized successfully');
        } catch (error) {
            console.error('Storage initialization failed:', error);
        }
    }
    
    // Chat History Management
    async saveChatHistory(messages, sessionId = 'default') {
        try {
            const timestamp = Date.now();
            const chatData = {
                sessionId,
                messages: messages.slice(-this.maxHistorySize),
                lastUpdated: timestamp,
                messageCount: messages.length
            };
            
            // Save to local storage for quick access
            await chrome.storage.local.set({
                [this.storageKeys.CHAT_HISTORY]: chatData
            });
            
            // Also save to session storage for persistence
            await this.saveConversationSession(sessionId, messages, timestamp);
            
            return true;
        } catch (error) {
            console.error('Failed to save chat history:', error);
            return false;
        }
    }
    
    async loadChatHistory(sessionId = 'default') {
        try {
            const result = await chrome.storage.local.get(this.storageKeys.CHAT_HISTORY);
            const chatData = result[this.storageKeys.CHAT_HISTORY];
            
            if (chatData && chatData.sessionId === sessionId) {
                return {
                    messages: chatData.messages || [],
                    lastUpdated: chatData.lastUpdated,
                    messageCount: chatData.messageCount
                };
            }
            
            // If current session not found, try to load from saved sessions
            return await this.loadConversationSession(sessionId);
        } catch (error) {
            console.error('Failed to load chat history:', error);
            return { messages: [], lastUpdated: null, messageCount: 0 };
        }
    }
    
    // Conversation Sessions Management
    async saveConversationSession(sessionId, messages, timestamp = Date.now()) {
        try {
            const sessions = await this.getConversationSessions();
            
            // Create or update session
            const sessionData = {
                id: sessionId,
                title: this.generateSessionTitle(messages),
                messages: messages.slice(-this.maxHistorySize),
                createdAt: sessions[sessionId]?.createdAt || timestamp,
                updatedAt: timestamp,
                messageCount: messages.length
            };
            
            sessions[sessionId] = sessionData;
            
            // Limit the number of sessions
            const sessionIds = Object.keys(sessions)
                .sort((a, b) => sessions[b].updatedAt - sessions[a].updatedAt)
                .slice(0, this.maxSessions);
            
            const limitedSessions = {};
            sessionIds.forEach(id => {
                limitedSessions[id] = sessions[id];
            });
            
            await chrome.storage.sync.set({
                [this.storageKeys.CONVERSATION_SESSIONS]: limitedSessions
            });
            
            return true;
        } catch (error) {
            console.error('Failed to save conversation session:', error);
            return false;
        }
    }
    
    async loadConversationSession(sessionId) {
        try {
            const sessions = await this.getConversationSessions();
            const session = sessions[sessionId];
            
            if (session) {
                return {
                    messages: session.messages || [],
                    lastUpdated: session.updatedAt,
                    messageCount: session.messageCount,
                    title: session.title
                };
            }
            
            return { messages: [], lastUpdated: null, messageCount: 0 };
        } catch (error) {
            console.error('Failed to load conversation session:', error);
            return { messages: [], lastUpdated: null, messageCount: 0 };
        }
    }
    
    async getConversationSessions() {
        try {
            const result = await chrome.storage.sync.get(this.storageKeys.CONVERSATION_SESSIONS);
            return result[this.storageKeys.CONVERSATION_SESSIONS] || {};
        } catch (error) {
            console.error('Failed to get conversation sessions:', error);
            return {};
        }
    }
    
    async deleteConversationSession(sessionId) {
        try {
            const sessions = await this.getConversationSessions();
            delete sessions[sessionId];
            
            await chrome.storage.sync.set({
                [this.storageKeys.CONVERSATION_SESSIONS]: sessions
            });
            
            return true;
        } catch (error) {
            console.error('Failed to delete conversation session:', error);
            return false;
        }
    }
    
    // Generate a title for a conversation session
    generateSessionTitle(messages) {
        if (!messages || messages.length === 0) {
            return 'New Conversation';
        }
        
        // Find the first user message
        const firstUserMessage = messages.find(msg => msg.isUser);
        if (firstUserMessage) {
            let title = firstUserMessage.content.substring(0, 50);
            if (firstUserMessage.content.length > 50) {
                title += '...';
            }
            return title;
        }
        
        return `Conversation ${new Date().toLocaleDateString()}`;
    }
    
    // Cache Management
    async cacheResponse(key, response, expiryHours = null) {
        try {
            const expiry = expiryHours || this.cacheExpiryHours;
            const cacheData = {
                response,
                timestamp: Date.now(),
                expiresAt: Date.now() + (expiry * 60 * 60 * 1000)
            };
            
            const cache = await this.getCachedResponses();
            cache[key] = cacheData;
            
            await chrome.storage.local.set({
                [this.storageKeys.CACHED_RESPONSES]: cache
            });
            
            return true;
        } catch (error) {
            console.error('Failed to cache response:', error);
            return false;
        }
    }
    
    async getCachedResponse(key) {
        try {
            const cache = await this.getCachedResponses();
            const cached = cache[key];
            
            if (cached && cached.expiresAt > Date.now()) {
                return cached.response;
            }
            
            // Clean up expired cache entry
            if (cached && cached.expiresAt <= Date.now()) {
                delete cache[key];
                await chrome.storage.local.set({
                    [this.storageKeys.CACHED_RESPONSES]: cache
                });
            }
            
            return null;
        } catch (error) {
            console.error('Failed to get cached response:', error);
            return null;
        }
    }
    
    async getCachedResponses() {
        try {
            const result = await chrome.storage.local.get(this.storageKeys.CACHED_RESPONSES);
            return result[this.storageKeys.CACHED_RESPONSES] || {};
        } catch (error) {
            console.error('Failed to get cached responses:', error);
            return {};
        }
    }
    
    async clearExpiredCache() {
        try {
            const cache = await this.getCachedResponses();
            const now = Date.now();
            let hasChanges = false;
            
            Object.keys(cache).forEach(key => {
                if (cache[key].expiresAt <= now) {
                    delete cache[key];
                    hasChanges = true;
                }
            });
            
            if (hasChanges) {
                await chrome.storage.local.set({
                    [this.storageKeys.CACHED_RESPONSES]: cache
                });
            }
            
            return true;
        } catch (error) {
            console.error('Failed to clear expired cache:', error);
            return false;
        }
    }
    
    // Analytics and Usage Data
    async saveAnalyticsData(eventType, data) {
        if (!window.config?.get('analyticsEnabled')) {
            return false;
        }
        
        try {
            const analytics = await this.getAnalyticsData();
            const timestamp = Date.now();
            
            if (!analytics[eventType]) {
                analytics[eventType] = [];
            }
            
            analytics[eventType].push({
                ...data,
                timestamp,
                date: new Date().toISOString().split('T')[0]
            });
            
            // Keep only last 1000 events per type
            analytics[eventType] = analytics[eventType].slice(-1000);
            
            await chrome.storage.local.set({
                [this.storageKeys.ANALYTICS_DATA]: analytics
            });
            
            return true;
        } catch (error) {
            console.error('Failed to save analytics data:', error);
            return false;
        }
    }
    
    async getAnalyticsData() {
        try {
            const result = await chrome.storage.local.get(this.storageKeys.ANALYTICS_DATA);
            return result[this.storageKeys.ANALYTICS_DATA] || {};
        } catch (error) {
            console.error('Failed to get analytics data:', error);
            return {};
        }
    }
    
    // Data Export/Import
    async exportAllData() {
        try {
            const [chatHistory, sessions, preferences, analytics] = await Promise.all([
                chrome.storage.local.get(this.storageKeys.CHAT_HISTORY),
                chrome.storage.sync.get(this.storageKeys.CONVERSATION_SESSIONS),
                chrome.storage.sync.get(),
                chrome.storage.local.get(this.storageKeys.ANALYTICS_DATA)
            ]);
            
            const exportData = {
                version: '2.0.0',
                timestamp: new Date().toISOString(),
                data: {
                    chatHistory: chatHistory[this.storageKeys.CHAT_HISTORY],
                    sessions: sessions[this.storageKeys.CONVERSATION_SESSIONS],
                    preferences: preferences,
                    analytics: analytics[this.storageKeys.ANALYTICS_DATA]
                }
            };
            
            const blob = new Blob([JSON.stringify(exportData, null, 2)], {
                type: 'application/json'
            });
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ai-chat-data-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            
            return true;
        } catch (error) {
            console.error('Failed to export data:', error);
            return false;
        }
    }
    
    async importData(file) {
        try {
            const text = await file.text();
            const importData = JSON.parse(text);
            
            if (!importData.data || !importData.version) {
                throw new Error('Invalid import file format');
            }
            
            const { data } = importData;
            
            // Import data selectively
            const promises = [];
            
            if (data.chatHistory) {
                promises.push(chrome.storage.local.set({
                    [this.storageKeys.CHAT_HISTORY]: data.chatHistory
                }));
            }
            
            if (data.sessions) {
                promises.push(chrome.storage.sync.set({
                    [this.storageKeys.CONVERSATION_SESSIONS]: data.sessions
                }));
            }
            
            if (data.preferences) {
                // Only import settings, not all sync data
                const settingsKeys = Object.keys(window.config.defaults);
                const settingsToImport = {};
                
                settingsKeys.forEach(key => {
                    if (data.preferences[key] !== undefined) {
                        settingsToImport[key] = data.preferences[key];
                    }
                });
                
                promises.push(chrome.storage.sync.set(settingsToImport));
            }
            
            await Promise.all(promises);
            return true;
        } catch (error) {
            console.error('Failed to import data:', error);
            return false;
        }
    }
    
    // Storage Management
    async getStorageUsage() {
        try {
            const localUsage = await chrome.storage.local.getBytesInUse();
            const syncUsage = await chrome.storage.sync.getBytesInUse();
            
            return {
                local: {
                    used: localUsage,
                    quota: chrome.storage.local.QUOTA_BYTES,
                    percentage: (localUsage / chrome.storage.local.QUOTA_BYTES) * 100
                },
                sync: {
                    used: syncUsage,
                    quota: chrome.storage.sync.QUOTA_BYTES,
                    percentage: (syncUsage / chrome.storage.sync.QUOTA_BYTES) * 100
                }
            };
        } catch (error) {
            console.error('Failed to get storage usage:', error);
            return {
                local: { used: 0, quota: 0, percentage: 0 },
                sync: { used: 0, quota: 0, percentage: 0 }
            };
        }
    }
    
    async clearAllData(keepSettings = true) {
        try {
            // Clear local storage
            await chrome.storage.local.clear();
            
            if (!keepSettings) {
                // Clear sync storage
                await chrome.storage.sync.clear();
            } else {
                // Clear only data, keep settings
                const sessions = await chrome.storage.sync.get(this.storageKeys.CONVERSATION_SESSIONS);
                if (sessions[this.storageKeys.CONVERSATION_SESSIONS]) {
                    await chrome.storage.sync.remove(this.storageKeys.CONVERSATION_SESSIONS);
                }
            }
            
            return true;
        } catch (error) {
            console.error('Failed to clear data:', error);
            return false;
        }
    }
    
    async optimizeStorage() {
        try {
            // Clean expired cache
            await this.clearExpiredCache();
            
            // Limit conversation sessions
            const sessions = await this.getConversationSessions();
            const sortedSessions = Object.entries(sessions)
                .sort(([,a], [,b]) => b.updatedAt - a.updatedAt)
                .slice(0, this.maxSessions);
            
            const optimizedSessions = Object.fromEntries(sortedSessions);
            await chrome.storage.sync.set({
                [this.storageKeys.CONVERSATION_SESSIONS]: optimizedSessions
            });
            
            // Limit analytics data
            const analytics = await this.getAnalyticsData();
            Object.keys(analytics).forEach(eventType => {
                analytics[eventType] = analytics[eventType].slice(-500);
            });
            
            await chrome.storage.local.set({
                [this.storageKeys.ANALYTICS_DATA]: analytics
            });
            
            return true;
        } catch (error) {
            console.error('Failed to optimize storage:', error);
            return false;
        }
    }
    
    // Backup and Restore
    async createBackup() {
        try {
            const exportData = await this.exportAllData();
            const backupKey = `backup_${Date.now()}`;
            
            await chrome.storage.local.set({
                [backupKey]: {
                    data: exportData,
                    createdAt: Date.now(),
                    type: 'auto_backup'
                }
            });
            
            // Keep only last 5 backups
            const allData = await chrome.storage.local.get();
            const backupKeys = Object.keys(allData)
                .filter(key => key.startsWith('backup_'))
                .sort()
                .slice(0, -5);
            
            if (backupKeys.length > 0) {
                await chrome.storage.local.remove(backupKeys);
            }
            
            return backupKey;
        } catch (error) {
            console.error('Failed to create backup:', error);
            return null;
        }
    }
    
    async getBackups() {
        try {
            const allData = await chrome.storage.local.get();
            const backups = Object.entries(allData)
                .filter(([key]) => key.startsWith('backup_'))
                .map(([key, value]) => ({
                    id: key,
                    ...value
                }))
                .sort((a, b) => b.createdAt - a.createdAt);
            
            return backups;
        } catch (error) {
            console.error('Failed to get backups:', error);
            return [];
        }
    }
    
    async restoreFromBackup(backupId) {
        try {
            const backup = await chrome.storage.local.get(backupId);
            if (!backup[backupId]) {
                throw new Error('Backup not found');
            }
            
            const backupData = backup[backupId].data;
            return await this.importData(new Blob([JSON.stringify(backupData)]));
        } catch (error) {
            console.error('Failed to restore from backup:', error);
            return false;
        }
    }
}

// Create global storage manager instance
window.storageManager = new StorageManager();

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StorageManager;
}