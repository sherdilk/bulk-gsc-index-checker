/**
 * Utility functions for the Bulk GSC Index Checker extension
 */

const Utils = {
  /**
   * Validates if a string is a valid URL
   * @param {string} string 
   * @returns {boolean}
   */
  isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  },

  /**
   * Parses bulk input text into an array of unique valid URLs
   * @param {string} text 
   * @returns {string[]}
   */
  parseUrls(text) {
    return text
      .split(/\n/)
      .map(line => line.trim())
      .filter(line => line.length > 0 && this.isValidUrl(line));
  },

  /**
   * Generates a CSV string from an array of objects
   * @param {Object[]} data 
   * @param {string[]} headers 
   * @returns {string}
   */
  generateCsv(data, headers) {
    const csvRows = [];
    
    // Add headers
    csvRows.push(headers.join(','));

    // Add data rows
    for (const row of data) {
      const values = headers.map(header => {
        const value = row[header] || '';
        const escaped = ('' + value).replace(/"/g, '""');
        return `"${escaped}"`;
      });
      csvRows.push(values.join(','));
    }

    return csvRows.join('\n');
  },

  /**
   * Triggers a download of a file
   * @param {string} content 
   * @param {string} fileName 
   * @param {string} contentType 
   */
  downloadFile(content, fileName, contentType) {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    
    chrome.downloads.download({
      url: url,
      filename: fileName,
      saveAs: true
    });
  },

  /**
   * Formats the inspection status from API into a human-readable string
   * @param {string} verdict 
   * @returns {string}
   */
  formatStatus(verdict) {
    switch (verdict) {
      case 'VERDICT_UNSPECIFIED': return 'Unknown';
      case 'PASS': return 'Indexed';
      case 'PARTIAL': return 'Partially Indexed';
      case 'FAIL': return 'Not Indexed';
      case 'NEUTRAL': return 'Excluded';
      default: return verdict || 'Unknown';
    }
  }
};

if (typeof module !== 'undefined') {
  module.exports = Utils;
}
