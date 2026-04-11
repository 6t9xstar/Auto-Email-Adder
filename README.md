# Auto Email Adder - Gmail Chrome Extension

A powerful Chrome extension that automatically adds emails to Gmail recipients when composing messages.

## Features

- **Bulk Email Queue**: Add 50-100 emails at once using the popup tool
- **One-by-One Addition**: Emails are added sequentially to avoid overwhelming Gmail
- **Duplicate Prevention**: Automatically removes duplicate emails from the queue
- **Auto-Remove**: Emails are removed from the queue after successful addition
- **Customizable Delay**: Set delay between email additions (100ms - 5000ms)
- **History Tracking**: See recently added emails with timestamps
- **Visual Status**: Real-time status indicators for each email

## Installation

### Method 1: Load Unpacked Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked** button
4. Select the `Auto Email Adder` folder
5. The extension icon will appear in your toolbar

### Method 2: Create Icons (Required)

The extension needs icon files. Create these PNG files in the `icons/` folder:

- `icon16.png` - 16x16 pixels
- `icon48.png` - 48x48 pixels  
- `icon128.png` - 128x128 pixels

You can use the provided `icon.svg` to generate these or use any online converter.

## How to Use

1. **Open Gmail** and click **Compose** to start a new email
2. **Click the Auto Email Adder icon** in your Chrome toolbar
3. **Paste or type emails** in the input box (comma-separated or one per line)
4. Click **"Add to Queue"** - valid emails will be added
5. Click **"Start Adding"** to begin adding emails to the recipients field
6. Watch as emails are added one by one!

## Settings

- **Delay between emails**: Controls how fast emails are added (default: 500ms)
- **Auto-remove after adding**: Removes emails from queue once added (default: ON)
- **Remove duplicates**: Prevents duplicate emails in queue (default: ON)

## Keyboard Shortcuts

- **Ctrl + Enter** in the email input box: Quickly add emails to queue

## Troubleshooting

### Extension not working?
- Make sure you're on Gmail (mail.google.com)
- Ensure a compose window is open
- Try refreshing the Gmail page
- Check that the extension has permission to access Gmail

### Emails not being added?
- Verify the compose window is active
- Check that emails are in valid format (name@domain.com)
- Try increasing the delay between emails
- Make sure Gmail's interface hasn't changed significantly

## File Structure

```
Auto Email Adder/
├── manifest.json      # Extension configuration
├── popup.html         # Popup UI
├── popup.css          # Popup styles
├── popup.js           # Popup logic
├── content.js         # Gmail interaction script
├── background.js      # Background service worker
├── icons/             # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md          # This file
```

## Permissions

The extension requires these permissions:
- **storage**: Save email queue and settings
- **activeTab**: Interact with Gmail tabs
- **scripting**: Inject content script into Gmail
- **host permissions**: Access to mail.google.com

## Privacy

- All data (email queue, settings, history) is stored **locally** in your browser
- No data is sent to external servers
- The extension only accesses Gmail to add recipients

## Updates

To update the extension after making changes:
1. Go to `chrome://extensions/`
2. Find Auto Email Adder
3. Click the refresh/reload icon

## Support

If you encounter issues, please check:
1. Gmail is open and you're signed in
2. A compose window is active
3. The extension has necessary permissions
4. Chrome is up to date

---

**Version**: 1.0.0  
**Created for**: Gmail Auto Email Adding
**Developer**: ApexSofteck
