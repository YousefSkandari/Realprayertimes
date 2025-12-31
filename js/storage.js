/**
 * Local Storage Manager for Fajr Prayer Time Calculator
 *
 * Handles persistent storage of user preferences, saved locations,
 * and cached calculation results.
 */

const StorageManager = (function() {
  'use strict';

  const STORAGE_KEYS = {
    PREFERENCES: 'fajr_preferences',
    SAVED_LOCATIONS: 'fajr_saved_locations',
    LAST_LOCATION: 'fajr_last_location',
    THEME: 'fajr_theme',
    CACHE: 'fajr_cache'
  };

  const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
  const MAX_SAVED_LOCATIONS = 10;

  /**
   * Check if localStorage is available
   * @returns {boolean}
   */
  function isStorageAvailable() {
    try {
      const test = '__storage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Safely get item from localStorage
   * @param {string} key - Storage key
   * @returns {*} Parsed value or null
   */
  function getItem(key) {
    if (!isStorageAvailable()) return null;
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (e) {
      console.error('Error reading from localStorage:', e);
      return null;
    }
  }

  /**
   * Safely set item in localStorage
   * @param {string} key - Storage key
   * @param {*} value - Value to store
   * @returns {boolean} Success status
   */
  function setItem(key, value) {
    if (!isStorageAvailable()) return false;
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('Error writing to localStorage:', e);
      return false;
    }
  }

  /**
   * Remove item from localStorage
   * @param {string} key - Storage key
   */
  function removeItem(key) {
    if (!isStorageAvailable()) return;
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.error('Error removing from localStorage:', e);
    }
  }

  // ============ Preferences ============

  /**
   * Get user preferences
   * @returns {object} User preferences
   */
  function getPreferences() {
    const defaults = {
      convention: 'MWL',
      customAngle: 18,
      highLatMethod: 'seventh_of_night',
      use24Hour: false,
      autoDetectLocation: true
    };
    const stored = getItem(STORAGE_KEYS.PREFERENCES);
    return { ...defaults, ...stored };
  }

  /**
   * Save user preferences
   * @param {object} prefs - Preferences to save
   * @returns {boolean} Success status
   */
  function savePreferences(prefs) {
    const current = getPreferences();
    return setItem(STORAGE_KEYS.PREFERENCES, { ...current, ...prefs });
  }

  /**
   * Update a single preference
   * @param {string} key - Preference key
   * @param {*} value - Preference value
   * @returns {boolean} Success status
   */
  function updatePreference(key, value) {
    const prefs = getPreferences();
    prefs[key] = value;
    return setItem(STORAGE_KEYS.PREFERENCES, prefs);
  }

  // ============ Theme ============

  /**
   * Get saved theme preference
   * @returns {string} 'light', 'dark', or 'system'
   */
  function getTheme() {
    return getItem(STORAGE_KEYS.THEME) || 'system';
  }

  /**
   * Save theme preference
   * @param {string} theme - 'light', 'dark', or 'system'
   * @returns {boolean} Success status
   */
  function saveTheme(theme) {
    return setItem(STORAGE_KEYS.THEME, theme);
  }

  /**
   * Get effective theme based on preference and system setting
   * @returns {string} 'light' or 'dark'
   */
  function getEffectiveTheme() {
    const theme = getTheme();
    if (theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return theme;
  }

  // ============ Saved Locations ============

  /**
   * Get all saved locations
   * @returns {Array} Array of saved locations
   */
  function getSavedLocations() {
    return getItem(STORAGE_KEYS.SAVED_LOCATIONS) || [];
  }

  /**
   * Save a new location
   * @param {object} location - Location to save
   * @returns {boolean} Success status
   */
  function saveLocation(location) {
    const locations = getSavedLocations();

    // Check for duplicate
    const existingIndex = locations.findIndex(
      loc => loc.latitude === location.latitude && loc.longitude === location.longitude
    );

    if (existingIndex !== -1) {
      // Update existing
      locations[existingIndex] = { ...locations[existingIndex], ...location, updatedAt: Date.now() };
    } else {
      // Add new
      if (locations.length >= MAX_SAVED_LOCATIONS) {
        // Remove oldest
        locations.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        locations.pop();
      }
      locations.unshift({
        id: generateId(),
        ...location,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }

    return setItem(STORAGE_KEYS.SAVED_LOCATIONS, locations);
  }

  /**
   * Delete a saved location
   * @param {string} id - Location ID
   * @returns {boolean} Success status
   */
  function deleteLocation(id) {
    const locations = getSavedLocations();
    const filtered = locations.filter(loc => loc.id !== id);
    return setItem(STORAGE_KEYS.SAVED_LOCATIONS, filtered);
  }

  /**
   * Update a saved location
   * @param {string} id - Location ID
   * @param {object} updates - Updates to apply
   * @returns {boolean} Success status
   */
  function updateLocation(id, updates) {
    const locations = getSavedLocations();
    const index = locations.findIndex(loc => loc.id === id);
    if (index === -1) return false;

    locations[index] = { ...locations[index], ...updates, updatedAt: Date.now() };
    return setItem(STORAGE_KEYS.SAVED_LOCATIONS, locations);
  }

  // ============ Last Location ============

  /**
   * Get last used location
   * @returns {object|null} Last location or null
   */
  function getLastLocation() {
    return getItem(STORAGE_KEYS.LAST_LOCATION);
  }

  /**
   * Save last used location
   * @param {object} location - Location to save
   * @returns {boolean} Success status
   */
  function saveLastLocation(location) {
    return setItem(STORAGE_KEYS.LAST_LOCATION, {
      ...location,
      timestamp: Date.now()
    });
  }

  // ============ Cache ============

  /**
   * Get cached data
   * @param {string} key - Cache key
   * @returns {*} Cached data or null if expired/not found
   */
  function getCache(key) {
    const cache = getItem(STORAGE_KEYS.CACHE) || {};
    const entry = cache[key];

    if (!entry) return null;

    // Check expiration
    if (Date.now() - entry.timestamp > CACHE_DURATION) {
      delete cache[key];
      setItem(STORAGE_KEYS.CACHE, cache);
      return null;
    }

    return entry.data;
  }

  /**
   * Set cached data
   * @param {string} key - Cache key
   * @param {*} data - Data to cache
   * @returns {boolean} Success status
   */
  function setCache(key, data) {
    const cache = getItem(STORAGE_KEYS.CACHE) || {};

    // Clean old entries if cache is too large
    const entries = Object.keys(cache);
    if (entries.length > 50) {
      const sorted = entries.sort((a, b) =>
        (cache[a].timestamp || 0) - (cache[b].timestamp || 0)
      );
      sorted.slice(0, 25).forEach(k => delete cache[k]);
    }

    cache[key] = {
      data,
      timestamp: Date.now()
    };

    return setItem(STORAGE_KEYS.CACHE, cache);
  }

  /**
   * Clear all cache
   */
  function clearCache() {
    removeItem(STORAGE_KEYS.CACHE);
  }

  // ============ Utilities ============

  /**
   * Generate a unique ID
   * @returns {string} Unique ID
   */
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  /**
   * Clear all stored data
   */
  function clearAll() {
    Object.values(STORAGE_KEYS).forEach(key => removeItem(key));
  }

  /**
   * Export all data (for backup)
   * @returns {object} All stored data
   */
  function exportData() {
    const data = {};
    Object.entries(STORAGE_KEYS).forEach(([name, key]) => {
      data[name] = getItem(key);
    });
    return data;
  }

  /**
   * Import data (from backup)
   * @param {object} data - Data to import
   * @returns {boolean} Success status
   */
  function importData(data) {
    try {
      Object.entries(data).forEach(([name, value]) => {
        if (STORAGE_KEYS[name] && value !== null) {
          setItem(STORAGE_KEYS[name], value);
        }
      });
      return true;
    } catch (e) {
      console.error('Error importing data:', e);
      return false;
    }
  }

  // Public API
  return {
    isStorageAvailable,
    getPreferences,
    savePreferences,
    updatePreference,
    getTheme,
    saveTheme,
    getEffectiveTheme,
    getSavedLocations,
    saveLocation,
    deleteLocation,
    updateLocation,
    getLastLocation,
    saveLastLocation,
    getCache,
    setCache,
    clearCache,
    clearAll,
    exportData,
    importData
  };
})();

// Export for module systems (if available)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StorageManager;
}
