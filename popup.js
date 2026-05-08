/**
 * Popup script for Bulk GSC Index Checker
 * Now supports background task synchronization
 */

document.addEventListener('DOMContentLoaded', async () => {
  // UI Elements
  const authSection = document.getElementById('auth-section');
  const appSection = document.getElementById('app-section');
  const btnSignin = document.getElementById('btn-signin');
  const siteSelector = document.getElementById('site-selector');
  const btnRefreshSites = document.getElementById('btn-refresh-sites');
  const urlInput = document.getElementById('url-input');
  const btnCheck = document.getElementById('btn-check');
  const btnStop = document.getElementById('btn-stop');
  const progressContainer = document.getElementById('progress-container');
  const progressText = document.getElementById('progress-text');
  const progressPercentage = document.getElementById('progress-percentage');
  const progressFill = document.getElementById('progress-fill');
  const resultsContainer = document.getElementById('results-container');
  const resultsTbody = document.getElementById('results-tbody');
  const statIndexed = document.getElementById('stat-indexed');
  const statNotIndexed = document.getElementById('stat-not-indexed');
  const statErrors = document.getElementById('stat-errors');
  const btnExportIndexed = document.getElementById('btn-export-indexed');
  const btnExportNotIndexed = document.getElementById('btn-export-not-indexed');

  let currentResults = [];

  // Initialize: Check if already authenticated
  checkAuth();

  // Event Listeners
  btnSignin.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'get_auth' }, (response) => {
      if (response && response.success) {
        showApp();
      } else {
        alert('Authentication failed: ' + (response?.error || 'Unknown error'));
      }
    });
  });

  btnRefreshSites.addEventListener('click', loadSites);

  btnCheck.addEventListener('click', startBulkCheck);
  
  btnStop.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'stop_job' });
  });

  btnExportIndexed.addEventListener('click', () => exportResults('Indexed'));
  btnExportNotIndexed.addEventListener('click', () => exportResults('Not Indexed'));

  // Listen for messages from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'job_progress' || message.action === 'job_complete') {
      updateUIFromState(message.state);
    }
  });

  // Functions
  async function checkAuth() {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (token) {
        showApp();
      } else {
        showAuth();
      }
    });
  }

  function showAuth() {
    authSection.classList.remove('hidden');
    appSection.classList.add('hidden');
  }

  function showApp() {
    authSection.classList.add('hidden');
    appSection.classList.remove('hidden');
    syncWithBackground();
    loadSites();
  }

  async function syncWithBackground() {
    chrome.runtime.sendMessage({ action: 'get_job_status' }, (response) => {
      if (response && response.success && response.state) {
        updateUIFromState(response.state);
      }
    });
  }

  async function loadSites() {
    siteSelector.innerHTML = '<option value="">Loading properties...</option>';
    btnRefreshSites.disabled = true;

    chrome.runtime.sendMessage({ action: 'fetch_sites' }, (response) => {
      btnRefreshSites.disabled = false;
      if (response && response.success) {
        const sites = response.sites;
        if (sites.length === 0) {
          siteSelector.innerHTML = '<option value="">No properties found</option>';
        } else {
          siteSelector.innerHTML = sites
            .map(site => `<option value="${site.siteUrl}">${site.siteUrl}</option>`)
            .join('');
        }
      } else {
        siteSelector.innerHTML = '<option value="">Error loading sites</option>';
      }
    });
  }

  function updateUIFromState(state) {
    currentResults = state.results || [];
    
    // Update progress
    if (state.isRunning || state.completed > 0) {
      progressContainer.classList.remove('hidden');
      const percent = Math.round((state.completed / state.total) * 100) || 0;
      progressText.textContent = `Checking ${state.completed}/${state.total} URLs...`;
      progressPercentage.textContent = `${percent}%`;
      progressFill.style.width = `${percent}%`;
      
      if (state.isRunning) {
        btnCheck.classList.add('hidden');
        btnStop.classList.remove('hidden');
        urlInput.disabled = true;
        siteSelector.disabled = true;
      } else {
        btnCheck.classList.remove('hidden');
        btnStop.classList.add('hidden');
        urlInput.disabled = false;
        siteSelector.disabled = false;
      }
    }

    // Update table and stats
    if (currentResults.length > 0) {
      resultsContainer.classList.remove('hidden');
      renderTable(currentResults);
      
      const indexed = currentResults.filter(r => r.status === 'Indexed').length;
      const notIndexed = currentResults.filter(r => r.status === 'Not Indexed' || r.status === 'Partially Indexed' || r.status === 'Excluded').length;
      const errors = currentResults.filter(r => r.status === 'Error').length;
      
      statIndexed.textContent = indexed;
      statNotIndexed.textContent = notIndexed;
      statErrors.textContent = errors;
    }
  }

  function renderTable(results) {
    resultsTbody.innerHTML = '';
    results.forEach(item => {
      const row = document.createElement('tr');
      const statusClass = item.status === 'Indexed' ? 'status-indexed' : 
                          (item.status === 'Error' ? 'status-error' : 'status-not-indexed');
      
      row.innerHTML = `
        <td>${item.url}</td>
        <td class="${statusClass}">${item.status}</td>
      `;
      resultsTbody.appendChild(row);
    });
    
    // Auto-scroll to bottom of the table container
    const tableContainer = resultsTbody.parentElement.parentElement;
    tableContainer.scrollTop = tableContainer.scrollHeight;
  }

  async function startBulkCheck() {
    const selectedSite = siteSelector.value;
    if (!selectedSite) {
      alert('Please select a GSC property first.');
      return;
    }

    const urls = Utils.parseUrls(urlInput.value);
    if (urls.length === 0) {
      alert('Please enter at least one valid URL.');
      return;
    }

    chrome.runtime.sendMessage({ 
      action: 'start_job', 
      siteUrl: selectedSite, 
      urls: urls 
    }, (response) => {
      if (!response.success) {
        alert(response.error);
      }
    });
  }

  function exportResults(type) {
    let filtered;
    if (type === 'Indexed') {
      filtered = currentResults.filter(r => r.status === 'Indexed');
    } else {
      filtered = currentResults.filter(r => r.status !== 'Indexed' && r.status !== 'Error');
    }

    if (filtered.length === 0) {
      alert(`No ${type} URLs to export.`);
      return;
    }

    const csv = Utils.generateCsv(filtered, ['url', 'status']);
    const filename = `gsc_${type.toLowerCase().replace(' ', '_')}_${new Date().getTime()}.csv`;
    Utils.downloadFile(csv, filename, 'text/csv');
  }
});
