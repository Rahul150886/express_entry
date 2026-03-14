// background/service-worker.js

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'triggerFill') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'autoFill' });
    });
  }
});

// Badge counter for unread notifications
async function updateBadge() {
  const { access_token, api_base_url } = await chrome.storage.local.get([
    'access_token', 'api_base_url'
  ]);
  if (!access_token) return;

  try {
    const base = api_base_url || 'https://api.expressentry.app';
    const response = await fetch(`${base}/api/v1/notifications?unread_only=true`, {
      headers: { 'Authorization': `Bearer ${access_token}` }
    });
    if (response.ok) {
      const notifications = await response.json();
      const count = notifications.length;
      if (count > 0) {
        chrome.action.setBadgeText({ text: String(count) });
        chrome.action.setBadgeBackgroundColor({ color: '#d63031' });
      } else {
        chrome.action.setBadgeText({ text: '' });
      }
    }
  } catch (err) {
    console.error('Failed to fetch notifications:', err);
  }
}

// Check notifications every 5 minutes
chrome.alarms.create('check-notifications', { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'check-notifications') {
    updateBadge();
  }
});

// Initial badge update on install/update
chrome.runtime.onInstalled.addListener(() => {
  updateBadge();
});
