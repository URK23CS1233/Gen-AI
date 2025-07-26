// API management for AI Chat Assistant with DeepSeek support
class APIManager {
    constructor() {
        this.activeRequest = null;
        this.requestQueue = [];
        this.rateLimitTracker = new Map();
        this.errorRetryCount = new Map();
        this.maxRetries = 3;
        this.baseRetryDelay = 1000; // 1 second
        
        this.setupErrorHandling();
    }
    
    setupErrorHandling() {
        // Global error handler for unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            console.error('Unhandled promise rejection:', event.reason);
        });
    }
    
    async sendMessage(message, options = {}) {
        const config = window.config;
        const model = options.model || config.get('model');
        const provider = config.getModelInfo(model)?.provider;
        
        if (!provider) {
            throw new Error('Invalid model configuration');
        }
        
        // Check API key (skip for local DeepSeek if using 'local' placeholder)
        const apiKey = config.get('apiKey');
        if (provider !== 'deepseek' && (!apiKey || !config.isValidApiKey(apiKey))) {
            throw new Error('Invalid or missing API key');
        }
        
        // Check rate limits
        this.checkRateLimit(provider);
        
        // Create request parameters
        const requestParams = this.buildRequestParams(message, model, options);
        
        try {
            // Cancel any existing request if specified
            if (options.cancelPrevious && this.activeRequest) {
                this.activeRequest.abort();
            }
            
            // Create abort controller for this request
            const controller = new AbortController();
            this.activeRequest = controller;
            
            // Make the API request
            const response = await this.makeRequest(provider, requestParams, controller.signal);
            
            // Track successful request
            this.updateRateLimit(provider);
            this.errorRetryCount.delete(message);
            
            // Log analytics
            this.logAnalytics('message_sent', {
                model,
                provider,
                messageLength: message.length,
                success: true
            });
            
            return response;
            
        } catch (error) {
            this.handleRequestError(error, message, options);
            throw error;
        } finally {
            this.activeRequest = null;
        }
    }
    
    buildRequestParams(message, model, options) {
        const config = window.config;
        const provider = config.getModelInfo(model)?.provider;
        
        const baseParams = {
            model,
            temperature: options.temperature || config.get('temperature'),
            max_tokens: options.maxTokens || config.get('maxTokens')
        };
        
        switch (provider) {
            case 'openai':
                return this.buildOpenAIParams(message, baseParams, options);
            case 'google':
                return this.buildGoogleParams(message, baseParams, options);
            case 'anthropic':
                return this.buildAnthropicParams(message, baseParams, options);
            case 'deepseek':
                return this.buildDeepSeekParams(message, baseParams, options);
            default:
                throw new Error(`Unsupported provider: ${provider}`);
        }
    }
    
    buildOpenAIParams(message, baseParams, options) {
        const messages = this.buildMessageHistory(message, options.history);
        
        return {
            ...baseParams,
            messages,
            stream: options.stream || false,
            presence_penalty: options.presencePenalty || 0,
            frequency_penalty: options.frequencyPenalty || 0
        };
    }
    
    buildGoogleParams(message, baseParams, options) {
        const prompt = this.buildGooglePrompt(message, options.history);
        
        return {
            contents: [{
                parts: [{ text: prompt }]
            }],
            generationConfig: {
                temperature: baseParams.temperature,
                maxOutputTokens: baseParams.max_tokens,
                candidateCount: 1
            }
        };
    }
    
    buildAnthropicParams(message, baseParams, options) {
        const messages = this.buildMessageHistory(message, options.history, 'anthropic');
        
        return {
            model: baseParams.model,
            max_tokens: baseParams.max_tokens,
            temperature: baseParams.temperature,
            messages
        };
    }
    
    buildDeepSeekParams(message, baseParams, options) {
        const messages = this.buildMessageHistory(message, options.history, 'deepseek');
        
        return {
            model: 'deepseek-chat', // Use generic model name for local server
            max_tokens: baseParams.max_tokens,
            temperature: baseParams.temperature,
            messages,
            stream: false // Most local setups don't support streaming initially
        };
    }
    
    buildMessageHistory(currentMessage, history = [], format = 'openai') {
        const messages = [];
        const maxHistory = window.config.get('maxHistoryMessages');
        
        // Add system message for context
        if (format === 'openai' || format === 'anthropic' || format === 'deepseek') {
            let systemContent = 'You are a helpful AI assistant. Provide clear, concise, and accurate responses.';
            
            // Add specific instructions for DeepSeek
            if (format === 'deepseek') {
                systemContent += ' You are running locally on the user\'s machine.';
            }
            
            messages.push({
                role: 'system',
                content: systemContent
            });
        }
        
        // Add recent history
        if (history && history.length > 0) {
            const recentHistory = history.slice(-maxHistory);
            recentHistory.forEach(msg => {
                if (!msg.isError && !msg.isSystem) {
                    messages.push({
                        role: msg.isUser ? 'user' : 'assistant',
                        content: msg.content
                    });
                }
            });
        }
        
        // Add current message
        messages.push({
            role: 'user',
            content: currentMessage
        });
        
        return messages;
    }
    
    buildGooglePrompt(currentMessage, history = []) {
        let prompt = '';
        const maxHistory = window.config.get('maxHistoryMessages');
        
        // Add context
        prompt += 'You are a helpful AI assistant. Provide clear, concise, and accurate responses.\n\n';
        
        // Add recent history
        if (history && history.length > 0) {
            const recentHistory = history.slice(-maxHistory);
            recentHistory.forEach(msg => {
                if (!msg.isError && !msg.isSystem) {
                    const role = msg.isUser ? 'Human' : 'Assistant';
                    prompt += `${role}: ${msg.content}\n\n`;
                }
            });
        }
        
        // Add current message
        prompt += `Human: ${currentMessage}\n\nAssistant:`;
        
        return prompt;
    }
    
    async makeRequest(provider, params, signal) {
        const config = window.config;
        const endpoint = config.getApiEndpoint();
        const apiKey = config.get('apiKey');
        
        const headers = {
            'Content-Type': 'application/json'
        };
        
        // Add provider-specific headers
        switch (provider) {
            case 'openai':
                headers['Authorization'] = `Bearer ${apiKey}`;
                break;
            case 'google':
                // Google uses API key in URL parameter
                break;
            case 'anthropic':
                headers['Authorization'] = `Bearer ${apiKey}`;
                headers['anthropic-version'] = '2023-06-01';
                break;
            case 'deepseek':
                // For local DeepSeek, API key might be optional or different format
                if (apiKey && apiKey !== 'local') {
                    headers['Authorization'] = `Bearer ${apiKey}`;
                }
                break;
        }
        
        const requestOptions = {
            method: 'POST',
            headers,
            body: JSON.stringify(params),
            signal
        };
        
        // Add timeout
        const timeout = config.get('requestTimeout') || 30000;
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Request timeout')), timeout);
        });
        
        let url = endpoint;
        if (provider === 'google') {
            url += `?key=${apiKey}`;
        }
        
        const response = await Promise.race([
            fetch(url, requestOptions),
            timeoutPromise
        ]);
        
        if (!response.ok) {
            await this.handleHTTPError(response, provider);
        }
        
        const data = await response.json();
        return this.parseResponse(data, provider);
    }
    
    async handleHTTPError(response, provider) {
        const errorData = await response.json().catch(() => ({}));
        
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        
        if (provider === 'deepseek') {
            // Handle DeepSeek-specific errors
            switch (response.status) {
                case 404:
                    errorMessage = 'DeepSeek server not found. Make sure your local server is running on the correct port.';
                    break;
                case 500:
                    errorMessage = 'DeepSeek server error. Check your local server logs.';
                    break;
                case 503:
                    errorMessage = 'DeepSeek server unavailable. The model might be loading.';
                    break;
                default:
                    if (errorData.error) {
                        errorMessage = errorData.error.message || errorData.error;
                    }
            }
        } else {
            // Handle other providers' errors
            switch (response.status) {
                case 401:
                    errorMessage = 'Invalid API key or authentication failed';
                    break;
                case 403:
                    errorMessage = 'Access forbidden. Check your API permissions';
                    break;
                case 429:
                    errorMessage = 'Rate limit exceeded. Please wait before making more requests';
                    break;
                case 500:
                case 502:
                case 503:
                    errorMessage = 'Server error. Please try again later';
                    break;
                default:
                    if (errorData.error) {
                        errorMessage = errorData.error.message || errorData.error;
                    }
            }
        }
        
        const error = new Error(errorMessage);
        error.status = response.status;
        error.provider = provider;
        error.details = errorData;
        
        throw error;
    }
    
    parseResponse(data, provider) {
        switch (provider) {
            case 'openai':
            case 'deepseek': // DeepSeek uses OpenAI-compatible format
                return this.parseOpenAIResponse(data);
            case 'google':
                return this.parseGoogleResponse(data);
            case 'anthropic':
                return this.parseAnthropicResponse(data);
            default:
                throw new Error(`Unsupported provider: ${provider}`);
        }
    }
    
    parseOpenAIResponse(data) {
        if (!data.choices || data.choices.length === 0) {
            throw new Error('No response generated');
        }
        
        const choice = data.choices[0];
        const content = choice.message?.content || choice.text || '';
        
        return {
            content: content.trim(),
            finishReason: choice.finish_reason,
            usage: data.usage,
            model: data.model
        };
    }
    
    parseGoogleResponse(data) {
        if (!data.candidates || data.candidates.length === 0) {
            throw new Error('No response generated');
        }
        
        const candidate = data.candidates[0];
        const content = candidate.content?.parts?.[0]?.text || '';
        
        if (candidate.finishReason === 'SAFETY') {
            throw new Error('Response blocked due to safety concerns');
        }
        
        return {
            content: content.trim(),
            finishReason: candidate.finishReason,
            safetyRatings: candidate.safetyRatings,
            model: 'gemini-pro'
        };
    }
    
    parseAnthropicResponse(data) {
        if (!data.content || data.content.length === 0) {
            throw new Error('No response generated');
        }
        
        const content = data.content[0]?.text || '';
        
        return {
            content: content.trim(),
            finishReason: data.stop_reason,
            usage: data.usage,
            model: data.model
        };
    }
    
    handleRequestError(error, message, options) {
        const provider = window.config.getModelInfo()?.provider;
        
        // Log error analytics
        this.logAnalytics('api_error', {
            provider,
            error: error.message,
            status: error.status,
            messageLength: message.length
        });
        
        // Track retry count
        const retryKey = `${provider}_${message}`;
        const currentRetries = this.errorRetryCount.get(retryKey) || 0;
        this.errorRetryCount.set(retryKey, currentRetries + 1);
        
        console.error('API request failed:', error);
    }
    
    checkRateLimit(provider) {
        const now = Date.now();
        const rateLimitData = this.rateLimitTracker.get(provider);
        
        if (!rateLimitData) {
            return; // No rate limit data yet
        }
        
        const { requests, windowStart, limit, window } = rateLimitData;
        
        // Check if we're within the rate limit window
        if (now - windowStart < window) {
            if (requests >= limit) {
                const waitTime = window - (now - windowStart);
                throw new Error(`Rate limit exceeded. Please wait ${Math.ceil(waitTime / 1000)} seconds.`);
            }
        }
    }
    
    updateRateLimit(provider) {
        const now = Date.now();
        const rateLimitData = this.rateLimitTracker.get(provider) || {
            requests: 0,
            windowStart: now,
            limit: this.getRateLimit(provider),
            window: 60000 // 1 minute window
        };
        
        // Reset window if needed
        if (now - rateLimitData.windowStart >= rateLimitData.window) {
            rateLimitData.requests = 0;
            rateLimitData.windowStart = now;
        }
        
        rateLimitData.requests++;
        this.rateLimitTracker.set(provider, rateLimitData);
    }
    
    getRateLimit(provider) {
        // Conservative rate limits to avoid hitting API limits
        const limits = {
            openai: 20,     // 20 requests per minute
            google: 60,     // 60 requests per minute
            anthropic: 10,  // 10 requests per minute
            deepseek: 100   // Higher limit for local server
        };
        
        return limits[provider] || 10;
    }
    
    async retryRequest(message, options, error) {
        const retryKey = `${options.model}_${message}`;
        const retryCount = this.errorRetryCount.get(retryKey) || 0;
        
        if (retryCount >= this.maxRetries) {
            throw new Error(`Maximum retries (${this.maxRetries}) exceeded: ${error.message}`);
        }
        
        // Exponential backoff
        const delay = this.baseRetryDelay * Math.pow(2, retryCount);
        await this.sleep(delay);
        
        return this.sendMessage(message, options);
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    cancelActiveRequest() {
        if (this.activeRequest) {
            this.activeRequest.abort();
            this.activeRequest = null;
        }
    }
    
    logAnalytics(eventType, data) {
        if (window.storageManager && window.config?.get('analyticsEnabled')) {
            window.storageManager.saveAnalyticsData(eventType, data);
        }
    }
    
    // Streaming support (for future implementation)
    async sendStreamingMessage(message, options = {}) {
        // This would implement streaming responses
        // Currently not implemented but framework is here
        throw new Error('Streaming not yet implemented');
    }
    
    // Model capabilities check
    supportsFeature(feature, model = null) {
        const currentModel = model || window.config.get('model');
        const modelInfo = window.config.getModelInfo(currentModel);
        
        if (!modelInfo) return false;
        
        const capabilities = {
            'gpt-3.5-turbo': ['chat', 'completion'],
            'gpt-4': ['chat', 'completion', 'analysis'],
            'gemini-pro': ['chat', 'completion', 'multimodal'],
            'claude-3-sonnet': ['chat', 'completion', 'analysis'],
            'claude-3-opus': ['chat', 'completion', 'analysis', 'reasoning'],
            'deepseek-chat': ['chat', 'completion', 'analysis'],
            'deepseek-coder': ['chat', 'completion', 'coding', 'analysis']
        };
        
        return capabilities[currentModel]?.includes(feature) || false;
    }
    
    // Health check with DeepSeek support
    async healthCheck() {
        try {
            const testMessage = 'Hello';
            const response = await this.sendMessage(testMessage, {
                maxTokens: 10,
                temperature: 0
            });
            
            return {
                status: 'healthy',
                response: response.content,
                timestamp: Date.now()
            };
        } catch (error) {
            let status = 'unhealthy';
            let errorDetails = error.message;
            
            // Provide specific guidance for DeepSeek connection issues
            if (error.message.includes('DeepSeek server not found')) {
                errorDetails = 'Make sure DeepSeek is running locally on http://localhost:8000';
            } else if (error.message.includes('Network')) {
                errorDetails = 'Check if DeepSeek server is accessible';
            }
            
            return {
                status,
                error: errorDetails,
                timestamp: Date.now()
            };
        }
    }
}

// Create global API manager instance
window.apiManager = new APIManager();

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = APIManager;
}