// Auto Email Adder - Popup Script

class EmailQueueManager {
  constructor() {
    this.queue = [];
    this.history = [];
    this.isAdding = false;
    this.shouldStop = false;
    this.init();
  }

  async init() {
    try {
      await this.loadData();
      this.bindEvents();
      this.setupMessageListener();
      
      // Small delay to ensure DOM is fully rendered when popup reopens
      setTimeout(() => {
        this.render();
        console.log('[Auto Email Adder Popup] Rendered with', this.queue.length, 'queued,', this.history.length, 'in history');
      }, 50);
    } catch (error) {
      console.error('[Auto Email Adder Popup] Init error:', error);
    }
  }

  setupMessageListener() {
    // Listen for messages from content script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'autoAddingStarted') {
        this.isAdding = true;
        this.shouldStop = false;
        this.updateControls();
        this.showStatus(`Auto-adding ${request.count} emails...`, 'active');
      } else if (request.action === 'emailProcessed') {
        // Update the specific email status in queue
        const item = this.queue.find(i => i.email === request.email);
        if (item) {
          item.status = request.status;
        }
        this.render();
      } else if (request.action === 'autoAddingComplete') {
        this.isAdding = false;
        this.updateControls();
        this.showStatus(`Added ${request.added} emails (${request.failed} failed)`, request.failed > 0 ? 'adding' : 'ready');
        this.loadData().then(() => this.render());
      }
    });
  }

  async loadData() {
    try {
      const data = await chrome.storage.local.get(['emailQueue', 'emailHistory', 'settings']);
      this.queue = data.emailQueue || [];
      this.history = data.emailHistory || [];
      this.settings = data.settings || { delay: 200, autoRemove: true, dedupe: true };
      
      // Apply settings to UI with null checks
      const delayInput = document.getElementById('delayInput');
      const autoRemoveCheck = document.getElementById('autoRemoveCheck');
      const dedupeCheck = document.getElementById('dedupeCheck');
      
      if (delayInput) delayInput.value = this.settings.delay;
      if (autoRemoveCheck) autoRemoveCheck.checked = this.settings.autoRemove;
      if (dedupeCheck) dedupeCheck.checked = this.settings.dedupe;
    } catch (error) {
      console.error('[Auto Email Adder Popup] Load data error:', error);
      this.queue = [];
      this.history = [];
      this.settings = { delay: 200, autoRemove: true, dedupe: true };
    }
  }

  async saveData() {
    await chrome.storage.local.set({
      emailQueue: this.queue,
      emailHistory: this.history,
      settings: this.settings
    });
  }

  bindEvents() {
    // Add emails button
    document.getElementById('addBtn').addEventListener('click', () => this.addEmailsFromInput());
    
    // Clear input button
    document.getElementById('clearBtn').addEventListener('click', () => {
      document.getElementById('emailInput').value = '';
    });

    // Queue action buttons
    document.getElementById('startBtn').addEventListener('click', () => this.startAdding());
    document.getElementById('stopBtn').addEventListener('click', () => this.stopAdding());
    document.getElementById('clearQueueBtn').addEventListener('click', () => this.clearQueue());

    // History clear button
    document.getElementById('clearHistoryBtn').addEventListener('click', () => this.clearHistory());

    // Settings change listeners
    document.getElementById('delayInput').addEventListener('change', (e) => {
      this.settings.delay = parseInt(e.target.value) || 500;
      this.saveData();
    });

    document.getElementById('autoRemoveCheck').addEventListener('change', (e) => {
      this.settings.autoRemove = e.target.checked;
      this.saveData();
    });

    document.getElementById('dedupeCheck').addEventListener('change', (e) => {
      this.settings.dedupe = e.target.checked;
      this.saveData();
    });

    // Enter key in textarea (Ctrl+Enter to add)
    document.getElementById('emailInput').addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter') {
        this.addEmailsFromInput();
      }
    });

    // Email count display
    const emailInput = document.getElementById('emailInput');
    const emailCountEl = document.getElementById('emailCount');
    
    if (emailInput && emailCountEl) {
      const updateEmailCount = () => {
        const emails = this.parseEmails(emailInput.value);
        const count = emails.length;
        emailCountEl.textContent = count + ' email' + (count !== 1 ? 's' : '') + ' detected';
      };
      
      emailInput.addEventListener('input', updateEmailCount);
      // Initial count
      updateEmailCount();
    }

    // Toggle sections
    document.getElementById('settingsToggle').addEventListener('click', () => {
      const content = document.getElementById('settingsContent');
      const toggle = document.getElementById('settingsToggle');
      content.classList.toggle('collapsed');
      toggle.classList.toggle('collapsed');
    });

    document.getElementById('historyToggle').addEventListener('click', () => {
      const content = document.getElementById('historyContent');
      const toggle = document.getElementById('historyToggle');
      content.classList.toggle('collapsed');
      toggle.classList.toggle('collapsed');
    });
  }

  parseEmails(input) {
    // Split by newlines, commas, or semicolons
    const separators = /[\n,;]+/;
    return input
      .split(separators)
      .map(e => e.trim())
      .filter(e => e && this.isValidEmail(e));
  }

  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  addEmailsFromInput() {
    const input = document.getElementById('emailInput').value;
    if (!input.trim()) {
      this.showStatus('Please enter some emails', 'error');
      return;
    }

    const newEmails = this.parseEmails(input);
    if (newEmails.length === 0) {
      this.showStatus('No valid emails found', 'error');
      return;
    }

    // Add to queue with deduplication if enabled
    const existingEmails = new Set(this.queue.map(item => item.email));
    let addedCount = 0;
    let duplicateCount = 0;

    for (const email of newEmails) {
      if (this.settings.dedupe && existingEmails.has(email.toLowerCase())) {
        duplicateCount++;
        continue;
      }
      this.queue.push({
        email: email,
        status: 'pending',
        addedAt: null
      });
      existingEmails.add(email.toLowerCase());
      addedCount++;
    }

    this.saveData();
    this.render();

    // Clear input on successful add
    document.getElementById('emailInput').value = '';

    let message = `Added ${addedCount} email(s) to queue`;
    if (duplicateCount > 0) {
      message += ` (${duplicateCount} duplicates skipped)`;
    }
    this.showStatus(message, 'success');
  }

  async startAdding() {
    if (this.queue.length === 0) {
      this.showStatus('Queue is empty', 'error');
      return;
    }

    this.isAdding = true;
    this.shouldStop = false;
    this.updateControls();

    // Get active Gmail tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const gmailTab = tabs.find(tab => tab.url && tab.url.includes('mail.google.com'));

    if (!gmailTab) {
      this.showStatus('Please open Gmail first', 'error');
      this.isAdding = false;
      this.updateControls();
      return;
    }

    this.showStatus('Adding emails...', 'active');

    // Process emails one by one
    for (let i = 0; i < this.queue.length; i++) {
      if (this.shouldStop) {
        break;
      }

      const item = this.queue[i];
      if (item.status === 'added') continue;

      try {
        // Send message to content script to add email
        const response = await chrome.tabs.sendMessage(gmailTab.id, {
          action: 'addRecipient',
          email: item.email
        });

        if (response && response.success) {
          item.status = 'added';
          item.addedAt = new Date().toISOString();
          
          // Add to history
          this.history.unshift({
            email: item.email,
            addedAt: item.addedAt
          });

          // Keep history limited to last 20
          if (this.history.length > 20) {
            this.history = this.history.slice(0, 20);
          }

          // Remove if auto-remove is enabled
          if (this.settings.autoRemove) {
            this.queue.splice(i, 1);
            i--; // Adjust index after removal
          }

          this.saveData();
          this.render();
        } else {
          item.status = 'failed';
          this.saveData();
          this.render();
        }
      } catch (error) {
        item.status = 'failed';
        this.saveData();
        this.render();
        console.error('Error adding email:', error);
      }

      // Delay between emails
      if (i < this.queue.length - 1 && !this.shouldStop) {
        await this.sleep(this.settings.delay);
      }
    }

    this.isAdding = false;
    this.updateControls();
    this.showStatus(this.shouldStop ? 'Stopped by user' : 'Finished adding emails', 'ready');
  }

  stopAdding() {
    this.shouldStop = true;
    this.showStatus('Stopping...', 'adding');
  }

  clearQueue() {
    if (this.isAdding) {
      this.showStatus('Cannot clear while adding', 'error');
      return;
    }
    this.queue = [];
    this.saveData();
    this.render();
    this.showStatus('Queue cleared', 'success');
  }

  clearHistory() {
    this.history = [];
    this.saveData();
    this.render();
  }

  removeEmail(index) {
    if (this.isAdding) {
      this.showStatus('Cannot remove while adding', 'error');
      return;
    }
    this.queue.splice(index, 1);
    this.saveData();
    this.render();
  }

  updateControls() {
    // Update button states
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const addBtn = document.getElementById('addBtn');
    const clearQueueBtn = document.getElementById('clearQueueBtn');
    const emailInput = document.getElementById('emailInput');
    
    if (startBtn) startBtn.disabled = this.isAdding;
    if (stopBtn) stopBtn.disabled = !this.isAdding;
    if (addBtn) addBtn.disabled = this.isAdding;
    if (clearQueueBtn) clearQueueBtn.disabled = this.isAdding;
    if (emailInput) emailInput.disabled = this.isAdding;

    // Update status badge
    const statusEl = document.getElementById('status');
    if (statusEl) {
      const statusText = statusEl.querySelector('.status-text');
      if (this.isAdding) {
        if (statusText) statusText.textContent = 'Adding...';
        statusEl.className = 'status-badge active';
      } else {
        if (statusText) statusText.textContent = 'Ready';
        statusEl.className = 'status-badge';
      }
    }
  }

  showStatus(message, type) {
    const statusEl = document.getElementById('status');
    if (!statusEl) return;
    
    const statusText = statusEl.querySelector('.status-text');
    if (statusText) statusText.textContent = message;
    statusEl.className = 'status-badge' + (type ? ' ' + type : '');
    
    if (type === 'error') {
      setTimeout(() => {
        if (!statusText) return;
        if (this.isAdding) {
          statusText.textContent = 'Adding...';
          statusEl.className = 'status-badge active';
        } else {
          statusText.textContent = 'Ready';
          statusEl.className = 'status-badge';
        }
      }, 3000);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  render() {
    console.log('[Auto Email Adder Popup] Rendering - Queue:', this.queue.length, 'History:', this.history.length);
    
    // Update stats with null checks
    const queueCountEl = document.getElementById('queueCount');
    const addedCountEl = document.getElementById('addedCount');
    const historyCountEl = document.getElementById('historyCount');
    
    if (queueCountEl) {
      queueCountEl.textContent = this.queue.length;
    } else {
      console.warn('[Auto Email Adder Popup] queueCount element not found');
    }
    
    if (addedCountEl) {
      addedCountEl.textContent = this.history.length;
    } else {
      console.warn('[Auto Email Adder Popup] addedCount element not found');
    }
    
    if (historyCountEl) {
      historyCountEl.textContent = this.history.length;
    } else {
      console.warn('[Auto Email Adder Popup] historyCount element not found');
    }

    // Show/hide empty state
    const emptyQueue = document.getElementById('emptyQueue');
    const emailListEl = document.getElementById('emailList');
    
    if (!emptyQueue || !emailListEl) return;
    
    if (this.queue.length === 0) {
      emptyQueue.style.display = 'flex';
      emailListEl.innerHTML = '';
    } else {
      emptyQueue.style.display = 'none';
      emailListEl.innerHTML = this.queue.map((item, index) => `
        <li>
          <span class="email-text">${this.escapeHtml(item.email)}</span>
          <span class="email-status ${item.status}">${item.status}</span>
          <button class="remove-btn" data-index="${index}" title="Remove">×</button>
        </li>
      `).join('');

      // Bind remove buttons
      emailListEl.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const index = parseInt(e.target.dataset.index);
          this.removeEmail(index);
        });
      });
    }

    // Render history
    const emptyHistory = document.getElementById('emptyHistory');
    const historyListEl = document.getElementById('historyList');
    
    if (!emptyHistory || !historyListEl) return;
    
    if (this.history.length === 0) {
      emptyHistory.style.display = 'block';
      historyListEl.innerHTML = '';
    } else {
      emptyHistory.style.display = 'none';
      historyListEl.innerHTML = this.history.map(item => {
        const date = new Date(item.addedAt);
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `
          <li>
            <span class="email">${this.escapeHtml(item.email)}</span>
            <span class="time">${timeStr}</span>
          </li>
        `;
      }).join('');
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new EmailQueueManager();
});
