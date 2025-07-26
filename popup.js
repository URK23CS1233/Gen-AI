// DOM elements
const chatlog = document.getElementById('chatlog');
const input = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const typingIndicator = document.getElementById('typing-indicator');

// Configuration
const CONFIG = {
    API_ENDPOINT: 'https://your-chatbot-api.example.com/message',
    API_KEY: 'YOUR_API_KEY', // Optional: Set your API key here
    DEMO_MODE: true, // Set to false when you have a real API
    TYPING_DELAY: { min: 500, max: 1500 }, // Random delay range for typing indicator
    MAX_RETRIES: 3,
    REQUEST_TIMEOUT: 10000 // 10 seconds
};

// State management
let isLoading = false;
let messageHistory = [];
let retryCount = 0;

// Initialize the chatbot
function init() {
    input.focus();
    loadChatHistory();
    setupEventListeners();
    
    // Add initial demo message if in demo mode
    if (CONFIG.DEMO_MODE) {
        setTimeout(() => {
            addMessage("Hi! I'm running in demo mode. Send me a message to see how I work!", false, false, true);
        }, 1000);
    }
}

// Event listeners
function setupEventListeners() {
    sendBtn.addEventListener('click', handleSendMessage);
    
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });

    // Auto-resize input (optional enhancement)
    input.addEventListener('input', handleInputResize);
    
    // Save chat history on page unload
    window.addEventListener('beforeunload', saveChatHistory);
}

// Handle input auto-resize
function handleInputResize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 100) + 'px';
}

// Message management
function addMessage(content, isUser = false, isError = false, isSystem = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user' : 'bot'} fade-in`;
    
    // Remove welcome message if it exists
    const welcomeMsg = chatlog.querySelector('.welcome-message');
    if (welcomeMsg) {
        welcomeMsg.remove();
    }
    
    let bubbleClass = 'message-bubble';
    if (isError) bubbleClass = 'error-message';
    if (isSystem) bubbleClass += ' system-message';
    
    messageDiv.innerHTML = `<div class="${bubbleClass}">${content}</div>`;
    chatlog.appendChild(messageDiv);
    
    // Store in history (except system messages)
    if (!isSystem) {
        messageHistory.push({
            content,
            isUser,
            isError,
            timestamp: Date.now()
        });
    }
    
    scrollToBottom();
    return messageDiv;
}

function scrollToBottom() {
    chatlog.scrollTop = chatlog.scrollHeight;
}

// Typing indicator
function showTypingIndicator() {
    typingIndicator.style.display = 'flex';
    scrollToBottom();
}

function hideTypingIndicator() {
    typingIndicator.style.display = 'none';
}

// Loading state management
function setLoading(loading) {
    isLoading = loading;
    sendBtn.disabled = loading;
    
    if (loading) {
        sendBtn.innerHTML = '<span style="animation: spin 1s linear infinite;">⟳</span>';
        input.disabled = true;
    } else {
        sendBtn.innerHTML = '<span>➤</span>';
        input.disabled = false;
        input.focus();
    }
}

// Main send message handler
async function handleSendMessage() {
    const userMessage = input.value.trim();
    if (!userMessage || isLoading) return;

    // Clear input immediately
    input.value = '';
    input.style.height = 'auto';
    
    // Add user message
    addMessage(userMessage, true);
    
    // Show loading state
    setLoading(true);
    showTypingIndicator();

    try {
        let response;
        
        if (CONFIG.DEMO_MODE) {
            response = await handleDemoResponse(userMessage);
        } else {
            response = await sendToAPI(userMessage);
        }
        
        // Add random delay for more natural feel
        const delay = Math.random() * (CONFIG.TYPING_DELAY.max - CONFIG.TYPING_DELAY.min) + CONFIG.TYPING_DELAY.min;
        await new Promise(resolve => setTimeout(resolve, delay));
        
        hideTypingIndicator();
        addMessage(response);
        retryCount = 0; // Reset retry count on success
        
    } catch (error) {
        hideTypingIndicator();
        handleError(error, userMessage);
    } finally {
        setLoading(false);
    }
}

// API communication
async function sendToAPI(message) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);
    
    try {
        const headers = {
            'Content-Type': 'application/json'
        };
        
        // Add API key if configured
        if (CONFIG.API_KEY && CONFIG.API_KEY !== 'YOUR_API_KEY') {
            headers['Authorization'] = `Bearer ${CONFIG.API_KEY}`;
        }
        
        const response = await fetch(CONFIG.API_ENDPOINT, {
            method: 'POST',
            headers,
            body: JSON.stringify({ 
                message,
                history: messageHistory.slice(-10) // Send last 10 messages for context
            }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        return data.reply || data.response || data.message || 'Sorry, I couldn\'t generate a response.';
        
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

// Demo mode responses
async function handleDemoResponse(message) {
    const demoResponses = [
        "That's an interesting question! I'm currently in demo mode, so I can't provide real AI responses yet.",
        "Thanks for your message! Once you connect a real API, I'll be able to help you properly.",
        "I understand what you're saying. This is just a demonstration of the chat interface.",
        "Great! The UI is working perfectly. Now you just need to configure your actual chatbot API endpoint.",
        "I'm impressed by this sleek interface! Ready to be connected to a real AI service.",
        `You said: "${message}" - I heard you loud and clear! This is demo mode responding.`,
        "The chat interface looks fantastic! Set DEMO_MODE to false and add your API endpoint to get started.",
        "I'm a demo bot, but I'm excited to see what the real AI will say when you connect it!"
    ];
    
    // Simple keyword-based responses for demo
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
        return "Hello! 👋 Welcome to the demo chatbot. I'm just showing off this beautiful interface!";
    } else if (lowerMessage.includes('help')) {
        return "I'd love to help! In demo mode, I can only show you how the chat works. Connect a real API for actual assistance.";
    } else if (lowerMessage.includes('api') || lowerMessage.includes('setup')) {
        return "To set up the real API: 1) Set DEMO_MODE to false, 2) Update API_ENDPOINT, 3) Add your API_KEY if needed!";
    }
    
    return demoResponses[Math.floor(Math.random() * demoResponses.length)];
}

// Error handling
function handleError(error, originalMessage) {
    console.error('Chat error:', error);
    
    let errorMessage = 'Sorry, something went wrong. ';
    
    if (error.name === 'AbortError') {
        errorMessage = 'Request timed out. Please try again.';
    } else if (error.message.includes('fetch')) {
        errorMessage = 'Unable to connect to the chatbot service. Please check your internet connection.';
    } else if (error.message.includes('HTTP 401')) {
        errorMessage = 'Authentication failed. Please check your API key.';
    } else if (error.message.includes('HTTP 429')) {
        errorMessage = 'Too many requests. Please wait a moment before trying again.';
    } else if (error.message.includes('HTTP 5')) {
        errorMessage = 'Server error. Please try again later.';
    }
    
    // Add retry option for certain errors
    if (retryCount < CONFIG.MAX_RETRIES && !error.name === 'AbortError') {
        errorMessage += ` <button onclick="retryLastMessage('${originalMessage.replace(/'/g, "\\'")}')">Retry</button>`;
    }
    
    addMessage(errorMessage, false, true);
    retryCount++;
}

// Retry functionality
function retryLastMessage(message) {
    input.value = message;
    handleSendMessage();
}

// Chat history management (using Chrome storage)
function saveChatHistory() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({
            chatHistory: messageHistory.slice(-50) // Keep last 50 messages
        });
    }
}

function loadChatHistory() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get(['chatHistory'], (result) => {
            if (result.chatHistory && result.chatHistory.length > 0) {
                messageHistory = result.chatHistory;
                
                // Restore messages (limit to last 10 for display)
                const recentMessages = messageHistory.slice(-10);
                recentMessages.forEach(msg => {
                    addMessage(msg.content, msg.isUser, msg.isError);
                });
                
                // Remove welcome message if we have history
                const welcomeMsg = chatlog.querySelector('.welcome-message');
                if (welcomeMsg) {
                    welcomeMsg.remove();
                }
            }
        });
    }
}

// Utility functions
function clearChat() {
    chatlog.innerHTML = '<div class="welcome-message"><h3>👋 Welcome!</h3><p>I\'m your AI assistant. How can I help you today?</p></div>';
    messageHistory = [];
    saveChatHistory();
}

function exportChat() {
    const chatData = {
        messages: messageHistory,
        exportDate: new Date().toISOString(),
        totalMessages: messageHistory.length
    };
    
    const blob = new Blob([JSON.stringify(chatData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-export-${Date.now()}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
}

// Make retry function globally available
window.retryLastMessage = retryLastMessage;

// Initialize when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}