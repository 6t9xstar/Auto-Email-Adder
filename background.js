// Auto Email Adder - Background Service Worker

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Auto Email Adder] Extension installed');
  
  // Initialize storage with defaults
  chrome.storage.local.set({
    emailQueue: [],
    emailHistory: [],
    settings: {
      delay: 500,
      autoRemove: true,
      dedupe: true
    }
  });
});

// Listen for tab updates to inject content script if needed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('mail.google.com')) {
    // Content script will be injected automatically via manifest
    console.log('[Auto Email Adder] Gmail tab detected:', tabId);
  }
});

// Handle messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'log') {
    console.log('[Auto Email Adder]', request.message);
    sendResponse({ received: true });
  }
});
