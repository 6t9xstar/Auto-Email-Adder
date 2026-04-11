// Auto Email Adder - Content Script for Gmail

(function() {
  'use strict';

  let processedComposeWindows = new Set();
  let currentlyProcessing = new Set();
  let processedEmailCount = 0;

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'addRecipient') {
      addEmailToCompose(request.email)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
    }
    if (request.action === 'checkComposeAndAdd') {
      checkComposeAndProcessQueue()
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
    }
  });

  // Watch for compose window opening
  function startComposeWatcher() {
    console.log('[Auto Email Adder] Starting compose watcher');
    
    // Track ALL compose windows, not just one
    const allComposeWindows = () => findAllComposeWindows();
    
    // Check periodically for new compose windows
    let isRunning = false;
    setInterval(async () => {
      if (isRunning) return;
      isRunning = true;
      
      try {
        const composeWindows = allComposeWindows();
        
        for (const composeWindow of composeWindows) {
          // Generate a truly unique ID based on element reference and timestamp
          // This handles multiple compose windows correctly
          let windowId = composeWindow.getAttribute('data-auto-id');
          if (!windowId) {
            // Create unique ID with timestamp and random suffix
            windowId = 'compose_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            composeWindow.setAttribute('data-auto-id', windowId);
            console.log('[Auto Email Adder] New compose window detected: ' + windowId);
          }
          
          // Skip if already processed or currently being processed
          if (processedComposeWindows.has(windowId) || currentlyProcessing.has(windowId)) {
            continue;
          }
          
          // Lock this compose window immediately
          currentlyProcessing.add(windowId);
          processedComposeWindows.add(windowId);
          
          // Small delay to let Gmail fully render the compose window
          await sleep(300);
          
          // Check if we have emails in queue (re-check for each window)
          const data = await chrome.storage.local.get(['emailQueue', 'settings']);
          const queue = data.emailQueue || [];
          const pendingEmails = queue.filter(item => item.status === 'pending');
          
          if (pendingEmails.length > 0) {
            // Double-check we only process 1 email
            const emailsToAdd = pendingEmails.slice(0, 1);
            console.log(`[Auto Email Adder] Compose ${windowId}: Adding 1 email (${emailsToAdd[0].email})`);
            
            // Mark these emails as being processed (lock them)
            for (const item of emailsToAdd) {
              item.status = 'adding';
            }
            await chrome.storage.local.set({ emailQueue: queue });
            
            // Process the email
            await processEmailQueue(composeWindow, emailsToAdd, data.settings || {});
            
            // Increment counter
            processedEmailCount++;
          } else {
            console.log(`[Auto Email Adder] Compose ${windowId}: No pending emails in queue`);
          }
          
          // Remove from processing lock
          currentlyProcessing.delete(windowId);
        }
      } finally {
        isRunning = false;
      }
    }, 500);
  }

  async function checkComposeAndProcessQueue() {
    const composeWindow = findComposeWindow();
    if (!composeWindow) {
      return { success: false, error: 'No compose window open' };
    }

    // Generate unique ID
    let windowId = composeWindow.getAttribute('data-auto-id');
    if (!windowId) {
      windowId = 'compose_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      composeWindow.setAttribute('data-auto-id', windowId);
    }

    const data = await chrome.storage.local.get(['emailQueue', 'settings']);
    const queue = data.emailQueue || [];
    const pendingEmails = queue.filter(item => item.status === 'pending');

    if (pendingEmails.length === 0) {
      return { success: false, error: 'No pending emails in queue' };
    }

    if (!processedComposeWindows.has(windowId)) {
      processedComposeWindows.add(windowId);
    }

    return await processEmailQueue(composeWindow, pendingEmails, data.settings || {});
  }

  async function processEmailQueue(composeWindow, pendingEmails, settings) {
    const delay = settings.delay || 500;
    const autoRemove = settings.autoRemove !== false;
    const results = [];
    const addedEmails = [];
    const failedEmails = [];

    // Notify popup that auto-adding started
    chrome.runtime.sendMessage({ 
      action: 'autoAddingStarted', 
      count: pendingEmails.length 
    }).catch(() => {});

    try {
      for (const item of pendingEmails) {
        try {
          console.log(`[Auto Email Adder] Adding: ${item.email}`);
          const result = await addEmailToComposeSingle(composeWindow, item.email);
          
          results.push({ email: item.email, success: result.success });
          
          if (result.success) {
            addedEmails.push(item.email);
            item.status = 'added';
            item.addedAt = new Date().toISOString();
          } else {
            failedEmails.push({ email: item.email, error: result.error });
            item.status = 'failed';
          }
        } catch (error) {
          console.error(`[Auto Email Adder] Error adding ${item.email}:`, error);
          failedEmails.push({ email: item.email, error: error.message });
          item.status = 'failed';
        }

        // Update storage after each email
        await updateQueueInStorage(item);

        // Notify popup of progress
        chrome.runtime.sendMessage({ 
          action: 'emailProcessed', 
          email: item.email,
          status: item.status
        }).catch(() => {});

        // Delay between emails
        if (pendingEmails.indexOf(item) < pendingEmails.length - 1) {
          await sleep(delay);
        }
      }

      // Remove added emails if autoRemove is enabled
      if (autoRemove && addedEmails.length > 0) {
        await removeEmailsFromQueue(addedEmails);
      }

      // Notify popup of completion
      chrome.runtime.sendMessage({ 
        action: 'autoAddingComplete', 
        added: addedEmails.length,
        failed: failedEmails.length
      }).catch(() => {});

      return {
        success: true,
        added: addedEmails.length,
        failed: failedEmails.length,
        addedEmails,
        failedEmails
      };
    } catch (error) {
      console.error('[Auto Email Adder] Error processing queue:', error);
      return {
        success: false,
        error: error.message,
        added: addedEmails.length,
        failed: failedEmails.length
      };
    }
  }

  async function addEmailToComposeSingle(composeWindow, email) {
    // Final safeguard: check if this compose window already has this email
    const existingChips = composeWindow.querySelectorAll('[data-hovercard-id], [email], [data-name]');
    for (const chip of existingChips) {
      const chipEmail = chip.getAttribute('data-hovercard-id') || chip.getAttribute('email') || '';
      if (chipEmail.toLowerCase() === email.toLowerCase()) {
        console.log('[Auto Email Adder] Email already exists in this compose window:', email);
        return { success: true, skipped: true };
      }
    }
    
    const toField = findToField(composeWindow);
    if (!toField) {
      return { success: false, error: 'Could not find To field' };
    }

    try {
      toField.click();
      toField.focus();
      await sleep(100);

      const activeInput = composeWindow.querySelector('input[name="to"], input[aria-label*="To"], [role="combobox"][aria-label*="To"]');
      
      if (activeInput) {
        await typeEmail(activeInput, email);
      } else {
        const toLabel = composeWindow.querySelector('[aria-label*="To"], [title*="To"]');
        if (toLabel) {
          toLabel.click();
          await sleep(150);
          const inputAfterClick = composeWindow.querySelector('input[name="to"], input[aria-label*="To"], [role="combobox"]');
          if (inputAfterClick) {
            await typeEmail(inputAfterClick, email);
          } else {
            return { success: false, error: 'Could not find input after clicking To' };
          }
        } else {
          return { success: false, error: 'Could not find To label' };
        }
      }

      await sleep(200);
      await simulateKeyPress(toField, 'Enter');
      await sleep(150);

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async function updateQueueInStorage(updatedItem) {
    const data = await chrome.storage.local.get(['emailQueue']);
    const queue = data.emailQueue || [];
    const index = queue.findIndex(item => item.email === updatedItem.email);
    if (index !== -1) {
      queue[index] = updatedItem;
      await chrome.storage.local.set({ emailQueue: queue });
    }
  }

  async function removeEmailsFromQueue(emailsToRemove) {
    const data = await chrome.storage.local.get(['emailQueue', 'emailHistory']);
    let queue = data.emailQueue || [];
    let history = data.emailHistory || [];

    const emailSet = new Set(emailsToRemove.map(e => e.toLowerCase()));
    
    // Remove from queue
    queue = queue.filter(item => !emailSet.has(item.email.toLowerCase()));

    // Add to history
    const now = new Date().toISOString();
    for (const email of emailsToRemove) {
      history.unshift({ email, addedAt: now });
    }
    if (history.length > 20) {
      history = history.slice(0, 20);
    }

    await chrome.storage.local.set({ 
      emailQueue: queue,
      emailHistory: history
    });

    console.log(`[Auto Email Adder] Removed ${emailsToRemove.length} emails from queue`);
  }

  // Legacy function for manual single email adding
  async function addEmailToCompose(email) {
    const composeWindow = findComposeWindow();
    if (!composeWindow) {
      return { success: false, error: 'No compose window found. Please click Compose first.' };
    }
    return await addEmailToComposeSingle(composeWindow, email);
  }

  function findComposeWindow() {
    // Find first compose window by checking for To field
    const dialogs = document.querySelectorAll('[role="dialog"]');
    for (const dialog of dialogs) {
      const hasToField = dialog.querySelector('input[name="to"], textarea[name="to"], [aria-label*="To"]');
      if (hasToField) {
        return dialog;
      }
    }
    return null;
  }

  function findAllComposeWindows() {
    // Find compose windows by checking for To field (most reliable)
    const dialogs = document.querySelectorAll('[role="dialog"]');
    const validComposeWindows = [];

    dialogs.forEach(dialog => {
      // Check if it has a To field - this is a compose window
      const hasToField = dialog.querySelector('input[name="to"], textarea[name="to"], [aria-label*="To"]');
      if (hasToField) {
        validComposeWindows.push(dialog);
      }
    });

    return validComposeWindows;
  }

  function findToField(composeWindow) {
    // Try multiple selectors for the To field
    const selectors = [
      'input[name="to"]',
      'textarea[name="to"]',
      '[aria-label*="To recipients"]',
      '[aria-label*="To"][role="combobox"]',
      '[name="to"]',
      '.aoD .aoT',  // Gmail's to field class
      '.wO input',  // Alternative Gmail input
      '[data-field="to"] input',
      '[peoplekit-id="To"]',
      'input[peoplekit-id]'
    ];

    for (const selector of selectors) {
      const element = composeWindow.querySelector(selector);
      if (element) return element;
    }

    // Try finding by placeholder or aria-label containing "To"
    const inputs = composeWindow.querySelectorAll('input, textarea, [role="combobox"]');
    for (const input of inputs) {
      const ariaLabel = input.getAttribute('aria-label') || '';
      const placeholder = input.getAttribute('placeholder') || '';
      if (ariaLabel.toLowerCase().includes('to') || placeholder.toLowerCase().includes('recipient')) {
        return input;
      }
    }

    return null;
  }

  async function typeEmail(inputElement, email) {
    // Method 1: Direct paste - Fastest approach
    // Use execCommand paste if possible, otherwise direct value setting
    inputElement.focus();
    inputElement.click();
    await sleep(30);
    
    // Try clipboard API paste first
    try {
      const dataTransfer = new DataTransfer();
      dataTransfer.setData('text/plain', email);
      
      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dataTransfer
      });
      
      inputElement.dispatchEvent(pasteEvent);
      
      // Also set value directly as backup
      inputElement.value = email;
      inputElement.dispatchEvent(new Event('input', { bubbles: true }));
      inputElement.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) {
      // Fallback: Direct value assignment
      inputElement.value = email;
      inputElement.dispatchEvent(new Event('input', { bubbles: true }));
      inputElement.dispatchEvent(new Event('change', { bubbles: true }));
    }
    
    await sleep(50);
  }

  async function simulateKeyPress(element, key) {
    const eventInit = {
      key: key,
      code: key === 'Enter' ? 'Enter' : key,
      keyCode: key === 'Enter' ? 13 : key.charCodeAt(0),
      which: key === 'Enter' ? 13 : key.charCodeAt(0),
      bubbles: true,
      cancelable: true
    };

    element.dispatchEvent(new KeyboardEvent('keydown', eventInit));
    await sleep(20);
    element.dispatchEvent(new KeyboardEvent('keyup', eventInit));
    await sleep(20);
    element.dispatchEvent(new KeyboardEvent('keypress', eventInit));
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Log that content script is loaded
  console.log('[Auto Email Adder] Content script loaded and ready');

  // Track which window IDs are still open
  setInterval(() => {
    const openWindows = findAllComposeWindows();
    const openIds = new Set();
    
    // Collect IDs of currently open windows
    for (const win of openWindows) {
      const id = win.getAttribute('data-auto-id');
      if (id) openIds.add(id);
    }
    
    // Remove tracking for closed windows
    for (const id of processedComposeWindows) {
      if (!openIds.has(id)) {
        processedComposeWindows.delete(id);
        console.log('[Auto Email Adder] Cleaned up tracking for closed window: ' + id);
      }
    }
    
    // Reset counter if no windows open
    if (openWindows.length === 0) {
      processedEmailCount = 0;
    }
  }, 2000);

  // Start watching for compose window
  startComposeWatcher();
})();