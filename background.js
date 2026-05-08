/**
 * Background script for Bulk GSC Index Checker
 * Handles long-running jobs in the background
 */

const API_BASE = 'https://www.googleapis.com/webmasters/v3';
const INSPECTION_API_BASE = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';

// Global state for the current job
let jobState = {
  isRunning: false,
  urls: [],
  results: [],
  completed: 0,
  total: 0,
  stopRequested: false,
  siteUrl: ''
};

/**
 * Gets an OAuth2 token
 */
async function getAuthToken(interactive = true) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(token);
      }
    });
  });
}

/**
 * Fetches site properties
 */
async function fetchSites() {
  const token = await getAuthToken(false);
  const response = await fetch(`${API_BASE}/sites`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to fetch sites');
  }
  const data = await response.json();
  return data.siteEntry || [];
}

/**
 * Inspects a single URL
 */
async function inspectUrl(siteUrl, inspectionUrl) {
  const token = await getAuthToken(false);
  const response = await fetch(INSPECTION_API_BASE, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      siteUrl: siteUrl,
      inspectionUrl: inspectionUrl,
      languageCode: 'en-US'
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Inspection failed');
  }

  const data = await response.json();
  return data.inspectionResult || {};
}

/**
 * Formats status helper (replicated here to avoid module issues)
 */
function formatStatus(verdict) {
  switch (verdict) {
    case 'VERDICT_UNSPECIFIED': return 'Unknown';
    case 'PASS': return 'Indexed';
    case 'PARTIAL': return 'Partially Indexed';
    case 'FAIL': return 'Not Indexed';
    case 'NEUTRAL': return 'Excluded';
    default: return verdict || 'Unknown';
  }
}

/**
 * Main job loop
 */
async function runJob() {
  jobState.isRunning = true;
  jobState.stopRequested = false;
  jobState.results = [];
  jobState.completed = 0;

  for (const url of jobState.urls) {
    if (jobState.stopRequested) break;

    try {
      const result = await inspectUrl(jobState.siteUrl, url);
      const verdict = result.indexStatusResult?.verdict || 'UNKNOWN';
      const status = formatStatus(verdict);
      
      jobState.results.push({ url, status, verdict });
    } catch (error) {
      console.error(`Error checking ${url}:`, error);
      jobState.results.push({ url, status: 'Error', verdict: 'ERROR', error: error.message });
    }

    jobState.completed++;
    
    // Broadcast progress to anyone listening (the popup)
    chrome.runtime.sendMessage({ action: 'job_progress', state: jobState }).catch(() => {
      // Ignore errors if popup is closed
    });

    // Small delay to be safe (GSC has limits)
    await new Promise(r => setTimeout(r, 200));
  }

  jobState.isRunning = false;
  chrome.runtime.sendMessage({ action: 'job_complete', state: jobState }).catch(() => {});
}

// Handle messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'get_auth') {
    getAuthToken(true)
      .then(token => sendResponse({ success: true, token }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'fetch_sites') {
    fetchSites()
      .then(sites => sendResponse({ success: true, sites }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'start_job') {
    if (jobState.isRunning) {
      sendResponse({ success: false, error: 'Job already running' });
    } else {
      jobState.urls = message.urls;
      jobState.siteUrl = message.siteUrl;
      jobState.total = message.urls.length;
      runJob(); // Start async loop
      sendResponse({ success: true });
    }
    return true;
  }

  if (message.action === 'stop_job') {
    jobState.stopRequested = true;
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'get_job_status') {
    sendResponse({ success: true, state: jobState });
    return true;
  }
});
