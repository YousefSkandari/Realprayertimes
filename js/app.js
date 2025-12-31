/**
 * Fajr Prayer Time Calculator - Main Application
 *
 * Handles UI interactions, location services, and coordinates
 * between the calculation engine and storage manager.
 */

(function() {
  'use strict';

  // ============ State ============
  const state = {
    currentStep: 1,
    location: null,
    locationName: null,
    elevation: 0,
    convention: 'MWL',
    customAngle: 18,
    date: new Date(),
    currentResult: null,
    countdownInterval: null,
    searchTimeout: null,
    calendarMonth: new Date().getMonth(),
    calendarYear: new Date().getFullYear()
  };

  // ============ DOM Elements ============
  const elements = {};

  function initElements() {
    // Step wizard
    elements.step1 = document.getElementById('step-1');
    elements.step2 = document.getElementById('step-2');
    elements.step3 = document.getElementById('step-3');
    elements.step1Circle = document.getElementById('step-1-circle');
    elements.step2Circle = document.getElementById('step-2-circle');
    elements.step3Circle = document.getElementById('step-3-circle');
    elements.step1Label = document.getElementById('step-1-label');
    elements.step2Label = document.getElementById('step-2-label');
    elements.step3Label = document.getElementById('step-3-label');
    elements.stepConnector1 = document.getElementById('step-connector-1');
    elements.stepConnector2 = document.getElementById('step-connector-2');
    elements.step1Next = document.getElementById('step-1-next');
    elements.step2Back = document.getElementById('step-2-back');
    elements.step2Next = document.getElementById('step-2-next');
    elements.step3Restart = document.getElementById('step-3-restart');
    elements.resultLocationInfo = document.getElementById('result-location-info');

    // Header
    elements.themeToggle = document.getElementById('theme-toggle');
    elements.themeIconLight = document.getElementById('theme-icon-light');
    elements.themeIconDark = document.getElementById('theme-icon-dark');
    elements.shareBtn = document.getElementById('share-btn');

    // Location section
    elements.autoDetectBtn = document.getElementById('auto-detect-btn');
    elements.autoDetectText = document.getElementById('auto-detect-text');
    elements.locationIcon = document.getElementById('location-icon');
    elements.locationSpinner = document.getElementById('location-spinner');
    elements.locationDisplay = document.getElementById('location-display');
    elements.locationName = document.getElementById('location-name');
    elements.locationCoords = document.getElementById('location-coords');
    elements.manualToggle = document.getElementById('manual-toggle');
    elements.manualToggleText = document.getElementById('manual-toggle-text');
    elements.manualToggleIcon = document.getElementById('manual-toggle-icon');
    elements.manualInputSection = document.getElementById('manual-input-section');
    elements.citySearch = document.getElementById('city-search');
    elements.searchSpinner = document.getElementById('search-spinner');
    elements.searchResults = document.getElementById('search-results');
    elements.latitudeInput = document.getElementById('latitude');
    elements.longitudeInput = document.getElementById('longitude');
    elements.elevationInput = document.getElementById('elevation');
    elements.fetchElevationBtn = document.getElementById('fetch-elevation-btn');
    elements.applyManualBtn = document.getElementById('apply-manual-btn');

    // Settings section
    elements.conventionSelect = document.getElementById('convention');
    elements.customAngleWrapper = document.getElementById('custom-angle-wrapper');
    elements.customAngleInput = document.getElementById('custom-angle');
    elements.dateInput = document.getElementById('date');

    // Prayer time display
    elements.fajrTime = document.getElementById('fajr-time');
    elements.fajrAmpm = document.getElementById('fajr-ampm');
    elements.countdownValue = document.getElementById('countdown-value');
    elements.countdownLabel = document.getElementById('countdown-label');
    elements.sunriseTime = document.getElementById('sunrise-time');
    elements.sunriseAmpm = document.getElementById('sunrise-ampm');
    elements.highLatWarning = document.getElementById('high-lat-warning');
    elements.highLatMethod = document.getElementById('high-lat-method');

    // Quick actions
    elements.calendarBtn = document.getElementById('calendar-btn');
    elements.saveLocationBtn = document.getElementById('save-location-btn');
    elements.downloadCalendarBtn = document.getElementById('download-calendar-btn');

    // Saved locations
    elements.savedLocationsSection = document.getElementById('saved-locations-section');
    elements.savedLocationsList = document.getElementById('saved-locations-list');

    // Calendar modal
    elements.calendarModal = document.getElementById('calendar-modal');
    elements.calendarModalBackdrop = document.getElementById('calendar-modal-backdrop');
    elements.calendarCloseBtn = document.getElementById('calendar-close-btn');
    elements.prevMonthBtn = document.getElementById('prev-month-btn');
    elements.nextMonthBtn = document.getElementById('next-month-btn');
    elements.calendarMonthYear = document.getElementById('calendar-month-year');
    elements.calendarBody = document.getElementById('calendar-body');

    // Save location modal
    elements.saveModal = document.getElementById('save-modal');
    elements.saveModalBackdrop = document.getElementById('save-modal-backdrop');
    elements.locationLabelInput = document.getElementById('location-label');
    elements.saveCancelBtn = document.getElementById('save-cancel-btn');
    elements.saveConfirmBtn = document.getElementById('save-confirm-btn');

    // Alarm settings modal
    elements.alarmModal = document.getElementById('alarm-modal');
    elements.alarmModalBackdrop = document.getElementById('alarm-modal-backdrop');
    elements.alarmCheckboxes = document.querySelectorAll('.alarm-checkbox');
    elements.alarmDaysSelect = document.getElementById('alarm-days');
    elements.alarmNoneCheckbox = document.getElementById('alarm-none');
    elements.alarmCancelBtn = document.getElementById('alarm-cancel-btn');
    elements.alarmDownloadBtn = document.getElementById('alarm-download-btn');

    // Toast container
    elements.toastContainer = document.getElementById('toast-container');
  }

  // ============ Initialization ============

  function init() {
    initElements();
    initTheme();
    initEventListeners();
    loadPreferences();
    loadSavedLocations();
    loadLastLocation();
    setDefaultDate();

    // If we have a saved location, go directly to results
    if (state.location) {
      goToStep(3);
    } else {
      goToStep(1);
    }

    startCountdownTimer();
  }

  function initTheme() {
    const theme = StorageManager.getEffectiveTheme();
    applyTheme(theme);

    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (StorageManager.getTheme() === 'system') {
        applyTheme(e.matches ? 'dark' : 'light');
      }
    });
  }

  function applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      elements.themeIconLight.classList.remove('hidden');
      elements.themeIconDark.classList.add('hidden');
    } else {
      document.documentElement.classList.remove('dark');
      elements.themeIconLight.classList.add('hidden');
      elements.themeIconDark.classList.remove('hidden');
    }
  }

  function toggleTheme() {
    const current = StorageManager.getEffectiveTheme();
    const newTheme = current === 'dark' ? 'light' : 'dark';
    StorageManager.saveTheme(newTheme);
    applyTheme(newTheme);
  }

  function initEventListeners() {
    // Theme toggle
    elements.themeToggle.addEventListener('click', toggleTheme);

    // Share button
    elements.shareBtn.addEventListener('click', shareTime);

    // Step navigation
    elements.step1Next.addEventListener('click', () => goToStep(2));
    elements.step2Back.addEventListener('click', () => goToStep(1));
    elements.step2Next.addEventListener('click', () => goToStep(3));
    elements.step3Restart.addEventListener('click', () => goToStep(1));

    // Auto-detect location
    elements.autoDetectBtn.addEventListener('click', autoDetectLocation);

    // Quick city buttons
    document.querySelectorAll('.quick-city-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const lat = parseFloat(btn.dataset.lat);
        const lon = parseFloat(btn.dataset.lon);
        const name = btn.dataset.name;
        selectQuickCity(lat, lon, name);
      });
    });

    // Manual input toggle
    elements.manualToggle.addEventListener('click', toggleManualInput);

    // City search
    elements.citySearch.addEventListener('input', debounce(searchCity, 500));
    elements.citySearch.addEventListener('keydown', handleSearchKeydown);

    // Apply manual location
    elements.applyManualBtn.addEventListener('click', applyManualLocation);

    // Fetch elevation
    elements.fetchElevationBtn.addEventListener('click', fetchElevation);

    // Convention selector
    elements.conventionSelect.addEventListener('change', handleConventionChange);

    // Custom angle input
    elements.customAngleInput.addEventListener('change', handleCustomAngleChange);

    // Date input
    elements.dateInput.addEventListener('change', handleDateChange);

    // Calendar button
    elements.calendarBtn.addEventListener('click', openCalendarModal);

    // Save location button
    elements.saveLocationBtn.addEventListener('click', openSaveModal);

    // Calendar modal
    elements.calendarModalBackdrop.addEventListener('click', closeCalendarModal);
    elements.calendarCloseBtn.addEventListener('click', closeCalendarModal);
    elements.prevMonthBtn.addEventListener('click', () => navigateMonth(-1));
    elements.nextMonthBtn.addEventListener('click', () => navigateMonth(1));

    // Save modal
    elements.saveModalBackdrop.addEventListener('click', closeSaveModal);
    elements.saveCancelBtn.addEventListener('click', closeSaveModal);
    elements.saveConfirmBtn.addEventListener('click', confirmSaveLocation);

    // Download calendar (opens alarm settings modal)
    if (elements.downloadCalendarBtn) {
      elements.downloadCalendarBtn.addEventListener('click', openAlarmModal);
    }

    // Alarm modal
    if (elements.alarmModalBackdrop) {
      elements.alarmModalBackdrop.addEventListener('click', closeAlarmModal);
    }
    if (elements.alarmCancelBtn) {
      elements.alarmCancelBtn.addEventListener('click', closeAlarmModal);
    }
    if (elements.alarmDownloadBtn) {
      elements.alarmDownloadBtn.addEventListener('click', downloadCalendarWithAlarms);
    }
    if (elements.alarmNoneCheckbox) {
      elements.alarmNoneCheckbox.addEventListener('change', handleNoAlarmToggle);
    }

    // Keyboard navigation
    document.addEventListener('keydown', handleGlobalKeydown);

    // Close search results on click outside
    document.addEventListener('click', (e) => {
      if (!elements.citySearch.contains(e.target) && !elements.searchResults.contains(e.target)) {
        elements.searchResults.classList.add('hidden');
      }
    });
  }

  function loadPreferences() {
    const prefs = StorageManager.getPreferences();
    state.convention = prefs.convention;
    state.customAngle = prefs.customAngle;
    elements.conventionSelect.value = prefs.convention;
    elements.customAngleInput.value = prefs.customAngle;

    if (prefs.convention === 'Custom') {
      elements.customAngleWrapper.classList.remove('hidden');
    }
  }

  function loadLastLocation() {
    const lastLoc = StorageManager.getLastLocation();
    if (lastLoc && lastLoc.latitude && lastLoc.longitude) {
      state.location = { lat: lastLoc.latitude, lon: lastLoc.longitude };
      state.locationName = lastLoc.name || 'Saved Location';
      state.elevation = lastLoc.elevation || 0;

      showLocationDisplay(state.locationName, state.location.lat, state.location.lon);
      elements.elevationInput.value = state.elevation;
      enableNextButton();
      calculateAndDisplay();
    }
  }

  function loadSavedLocations() {
    const locations = StorageManager.getSavedLocations();
    if (locations.length > 0) {
      elements.savedLocationsSection.classList.remove('hidden');
      renderSavedLocations(locations);
    } else {
      elements.savedLocationsSection.classList.add('hidden');
    }
  }

  function renderSavedLocations(locations) {
    elements.savedLocationsList.innerHTML = locations.map(loc => `
      <li class="saved-location-item flex items-center justify-between p-3 bg-white/5 rounded-xl cursor-pointer" data-id="${loc.id}" role="button" tabindex="0">
        <div class="flex items-center gap-3">
          <svg class="w-5 h-5 text-dawn-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
          </svg>
          <div>
            <p class="font-medium text-white">${escapeHtml(loc.label || loc.name || 'Saved Location')}</p>
            <p class="text-sm text-white/60">${loc.latitude.toFixed(4)}°, ${loc.longitude.toFixed(4)}°</p>
          </div>
        </div>
        <button type="button" class="delete-location-btn p-2 text-white/40 hover:text-red-400 transition-colors" data-id="${loc.id}" aria-label="Delete location">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </li>
    `).join('');

    // Add click handlers
    elements.savedLocationsList.querySelectorAll('.saved-location-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (!e.target.closest('.delete-location-btn')) {
          const id = item.dataset.id;
          const loc = locations.find(l => l.id === id);
          if (loc) {
            selectSavedLocation(loc);
          }
        }
      });

      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          item.click();
        }
      });
    });

    // Add delete handlers
    elements.savedLocationsList.querySelectorAll('.delete-location-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        deleteSavedLocation(id);
      });
    });
  }

  function selectSavedLocation(loc) {
    state.location = { lat: loc.latitude, lon: loc.longitude };
    state.locationName = loc.label || loc.name || 'Saved Location';
    state.elevation = loc.elevation || 0;

    showLocationDisplay(state.locationName, loc.latitude, loc.longitude);
    elements.elevationInput.value = state.elevation;
    elements.latitudeInput.value = loc.latitude;
    elements.longitudeInput.value = loc.longitude;

    StorageManager.saveLastLocation({
      latitude: loc.latitude,
      longitude: loc.longitude,
      elevation: state.elevation,
      name: state.locationName
    });

    enableNextButton();
    calculateAndDisplay();
    showToast('Location loaded', 'success');
  }

  function deleteSavedLocation(id) {
    StorageManager.deleteLocation(id);
    loadSavedLocations();
    showToast('Location deleted', 'success');
  }

  function setDefaultDate() {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    elements.dateInput.value = dateStr;
    state.date = today;
  }

  // ============ Step Navigation ============

  function goToStep(step) {
    state.currentStep = step;

    // Hide all steps
    elements.step1.classList.add('hidden');
    elements.step2.classList.add('hidden');
    elements.step3.classList.add('hidden');

    // Show current step
    if (step === 1) {
      elements.step1.classList.remove('hidden');
    } else if (step === 2) {
      elements.step2.classList.remove('hidden');
    } else if (step === 3) {
      elements.step3.classList.remove('hidden');
      calculateAndDisplay();
      updateResultInfo();
    }

    updateStepIndicator();

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateStepIndicator() {
    const step = state.currentStep;

    // Step 1
    if (step >= 1) {
      elements.step1Circle.className = 'w-10 h-10 rounded-full bg-dawn-500 flex items-center justify-center text-white font-semibold';
      elements.step1Label.className = 'ml-2 text-sm font-medium text-white hidden sm:block';
    }

    // Connector 1
    if (step > 1) {
      elements.stepConnector1.className = 'w-12 sm:w-20 h-0.5 mx-2 bg-dawn-500';
    } else {
      elements.stepConnector1.className = 'w-12 sm:w-20 h-0.5 mx-2 bg-white/20';
    }

    // Step 2
    if (step >= 2) {
      elements.step2Circle.className = 'w-10 h-10 rounded-full bg-dawn-500 flex items-center justify-center text-white font-semibold';
      elements.step2Label.className = 'ml-2 text-sm font-medium text-white hidden sm:block';
    } else {
      elements.step2Circle.className = 'w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white/60 font-semibold';
      elements.step2Label.className = 'ml-2 text-sm font-medium text-white/60 hidden sm:block';
    }

    // Connector 2
    if (step > 2) {
      elements.stepConnector2.className = 'w-12 sm:w-20 h-0.5 mx-2 bg-dawn-500';
    } else {
      elements.stepConnector2.className = 'w-12 sm:w-20 h-0.5 mx-2 bg-white/20';
    }

    // Step 3
    if (step >= 3) {
      elements.step3Circle.className = 'w-10 h-10 rounded-full bg-dawn-500 flex items-center justify-center text-white font-semibold';
      elements.step3Label.className = 'ml-2 text-sm font-medium text-white hidden sm:block';
    } else {
      elements.step3Circle.className = 'w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white/60 font-semibold';
      elements.step3Label.className = 'ml-2 text-sm font-medium text-white/60 hidden sm:block';
    }
  }

  function enableNextButton() {
    if (state.location) {
      elements.step1Next.disabled = false;
    }
  }

  function updateResultInfo() {
    const locationName = state.locationName || 'Unknown Location';
    const conventionName = elements.conventionSelect.options[elements.conventionSelect.selectedIndex].text;
    elements.resultLocationInfo.textContent = `${locationName} • ${conventionName}`;
  }

  // ============ Location Services ============

  function autoDetectLocation() {
    if (!navigator.geolocation) {
      showToast('Geolocation is not supported by your browser', 'error');
      return;
    }

    setLocationLoading(true);

    // iOS Safari requires geolocation to be called directly from user gesture
    navigator.geolocation.getCurrentPosition(
      function(position) {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        state.location = { lat: latitude, lon: longitude };
        state.elevation = position.coords.altitude || 0;

        showLocationDisplay('Current Location', latitude, longitude);
        elements.latitudeInput.value = latitude.toFixed(6);
        elements.longitudeInput.value = longitude.toFixed(6);
        elements.elevationInput.value = Math.round(state.elevation);

        StorageManager.saveLastLocation({
          latitude,
          longitude,
          elevation: state.elevation,
          name: 'Current Location'
        });

        enableNextButton();
        calculateAndDisplay();
        setLocationLoading(false);
        showToast('Location detected successfully', 'success');

        // Try reverse geocoding in background
        reverseGeocode(latitude, longitude)
          .then(name => {
            state.locationName = name;
            showLocationDisplay(name, latitude, longitude);
          })
          .catch(() => {});
      },
      function(error) {
        setLocationLoading(false);
        handleGeolocationError(error);
      },
      // Options - use simple options for maximum compatibility
      {
        enableHighAccuracy: false,  // Start with low accuracy for faster response
        timeout: 30000,             // 30 second timeout
        maximumAge: 300000          // Accept cached position up to 5 minutes old
      }
    );
  }

  function handleGeolocationError(error) {
    if (error.code === 1) {
      // Permission denied
      showLocationPermissionHelp();
    } else if (error.code === 2) {
      showToast('Location unavailable. Please check your device settings or try manual entry.', 'error');
    } else if (error.code === 3) {
      showToast('Location request timed out. Please try again or enter location manually.', 'error');
    } else {
      showToast('Unable to detect location. Please enter manually.', 'error');
    }
  }

  function showLocationPermissionHelp() {
    // Detect iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    let message = 'Location access denied. ';

    if (isIOS) {
      message += 'Go to Settings > Safari > Location, or Settings > Privacy > Location Services to enable.';
    } else if (isSafari) {
      message += 'Click the "Aa" icon in the address bar > Website Settings > Location.';
    } else {
      message += 'Click the lock/info icon in your browser\'s address bar to enable location.';
    }

    showToast(message, 'error');

    // Also expand manual input section as alternative
    if (elements.manualInputSection.classList.contains('hidden')) {
      toggleManualInput();
    }
  }

  function selectQuickCity(lat, lon, name) {
    state.location = { lat, lon };
    state.locationName = name;
    state.elevation = 0;

    showLocationDisplay(name, lat, lon);
    elements.latitudeInput.value = lat.toFixed(6);
    elements.longitudeInput.value = lon.toFixed(6);
    elements.elevationInput.value = 0;

    StorageManager.saveLastLocation({
      latitude: lat,
      longitude: lon,
      elevation: 0,
      name
    });

    enableNextButton();
    calculateAndDisplay();
    showToast(`Location set to ${name.split(',')[0]}`, 'success');
  }

  async function reverseGeocode(lat, lon) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`;
    const response = await fetch(url, {
      headers: {
        'Accept-Language': 'en',
        'User-Agent': 'FajrPrayerCalculator/1.0'
      }
    });

    if (!response.ok) throw new Error('Geocoding failed');

    const data = await response.json();
    const address = data.address || {};

    // Build a meaningful name
    const parts = [];
    if (address.city || address.town || address.village) {
      parts.push(address.city || address.town || address.village);
    }
    if (address.state) {
      parts.push(address.state);
    }
    if (address.country) {
      parts.push(address.country);
    }

    return parts.join(', ') || data.display_name || 'Unknown Location';
  }

  async function searchCity(e) {
    const query = e.target.value.trim();

    if (query.length < 3) {
      elements.searchResults.classList.add('hidden');
      return;
    }

    elements.searchSpinner.classList.remove('hidden');

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;
      const response = await fetch(url, {
        headers: {
          'Accept-Language': 'en',
          'User-Agent': 'FajrPrayerCalculator/1.0'
        }
      });

      if (!response.ok) throw new Error('Search failed');

      const results = await response.json();
      displaySearchResults(results);
    } catch (error) {
      console.error('Search error:', error);
      showToast('Search failed. Please try again.', 'error');
    } finally {
      elements.searchSpinner.classList.add('hidden');
    }
  }

  function displaySearchResults(results) {
    if (results.length === 0) {
      elements.searchResults.innerHTML = '<li class="p-4 text-white/60">No results found</li>';
      elements.searchResults.classList.remove('hidden');
      return;
    }

    elements.searchResults.innerHTML = results.map((result, index) => `
      <li class="search-result-item" role="option" tabindex="0" data-index="${index}" data-lat="${result.lat}" data-lon="${result.lon}" data-name="${escapeHtml(result.display_name)}">
        <p class="font-medium text-white">${escapeHtml(result.display_name.split(',')[0])}</p>
        <p class="text-sm text-white/60">${escapeHtml(result.display_name)}</p>
      </li>
    `).join('');

    elements.searchResults.classList.remove('hidden');

    // Add click handlers
    elements.searchResults.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => selectSearchResult(item));
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectSearchResult(item);
        }
      });
    });
  }

  function selectSearchResult(item) {
    const lat = parseFloat(item.dataset.lat);
    const lon = parseFloat(item.dataset.lon);
    const name = item.dataset.name;

    state.location = { lat, lon };
    state.locationName = name;

    elements.latitudeInput.value = lat.toFixed(6);
    elements.longitudeInput.value = lon.toFixed(6);
    elements.citySearch.value = '';
    elements.searchResults.classList.add('hidden');

    showLocationDisplay(name, lat, lon);

    StorageManager.saveLastLocation({
      latitude: lat,
      longitude: lon,
      elevation: state.elevation,
      name
    });

    enableNextButton();
    calculateAndDisplay();
    showToast('Location set successfully', 'success');
  }

  function handleSearchKeydown(e) {
    const items = elements.searchResults.querySelectorAll('.search-result-item');
    if (items.length === 0) return;

    const currentIndex = Array.from(items).findIndex(item => item.getAttribute('aria-selected') === 'true');

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
      updateSearchSelection(items, nextIndex);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
      updateSearchSelection(items, prevIndex);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = elements.searchResults.querySelector('[aria-selected="true"]');
      if (selected) {
        selectSearchResult(selected);
      }
    } else if (e.key === 'Escape') {
      elements.searchResults.classList.add('hidden');
    }
  }

  function updateSearchSelection(items, newIndex) {
    items.forEach((item, i) => {
      item.setAttribute('aria-selected', i === newIndex ? 'true' : 'false');
    });
    items[newIndex].focus();
  }

  async function fetchElevation() {
    if (!state.location) {
      showToast('Please set a location first', 'error');
      return;
    }

    elements.fetchElevationBtn.textContent = '...';
    elements.fetchElevationBtn.disabled = true;

    try {
      const url = `https://api.open-elevation.com/api/v1/lookup?locations=${state.location.lat},${state.location.lon}`;
      const response = await fetch(url);

      if (!response.ok) throw new Error('Elevation API failed');

      const data = await response.json();
      const elevation = data.results?.[0]?.elevation || 0;

      state.elevation = Math.max(0, Math.round(elevation));
      elements.elevationInput.value = state.elevation;

      StorageManager.saveLastLocation({
        latitude: state.location.lat,
        longitude: state.location.lon,
        elevation: state.elevation,
        name: state.locationName
      });

      calculateAndDisplay();
      showToast(`Elevation: ${state.elevation}m`, 'success');
    } catch (error) {
      console.error('Elevation fetch error:', error);
      showToast('Unable to fetch elevation. Please enter manually.', 'error');
    } finally {
      elements.fetchElevationBtn.textContent = 'Auto';
      elements.fetchElevationBtn.disabled = false;
    }
  }

  function applyManualLocation() {
    const latValue = elements.latitudeInput.value.trim();
    const lonValue = elements.longitudeInput.value.trim();

    const lat = PrayerCalculator.parseDMS(latValue);
    const lon = PrayerCalculator.parseDMS(lonValue);

    if (lat === null || isNaN(lat) || lat < -90 || lat > 90) {
      showToast('Invalid latitude. Please enter a value between -90 and 90.', 'error');
      elements.latitudeInput.focus();
      return;
    }

    if (lon === null || isNaN(lon) || lon < -180 || lon > 180) {
      showToast('Invalid longitude. Please enter a value between -180 and 180.', 'error');
      elements.longitudeInput.focus();
      return;
    }

    state.location = { lat, lon };
    state.elevation = parseFloat(elements.elevationInput.value) || 0;
    state.locationName = `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;

    showLocationDisplay('Manual Location', lat, lon);

    StorageManager.saveLastLocation({
      latitude: lat,
      longitude: lon,
      elevation: state.elevation,
      name: state.locationName
    });

    enableNextButton();
    calculateAndDisplay();
    showToast('Location applied', 'success');
  }

  // ============ UI Helpers ============

  function setLocationLoading(loading) {
    if (loading) {
      elements.autoDetectText.textContent = 'Detecting...';
      elements.locationIcon.classList.add('hidden');
      elements.locationSpinner.classList.remove('hidden');
      elements.autoDetectBtn.disabled = true;
    } else {
      elements.autoDetectText.textContent = 'Auto-detect Location';
      elements.locationIcon.classList.remove('hidden');
      elements.locationSpinner.classList.add('hidden');
      elements.autoDetectBtn.disabled = false;
    }
  }

  function showLocationDisplay(name, lat, lon) {
    elements.locationDisplay.classList.remove('hidden');
    elements.locationName.textContent = name;
    elements.locationCoords.textContent = `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;
  }

  function toggleManualInput() {
    const isHidden = elements.manualInputSection.classList.toggle('hidden');
    elements.manualInputSection.setAttribute('aria-hidden', isHidden);
    elements.manualToggle.setAttribute('aria-expanded', !isHidden);
    elements.manualToggleIcon.style.transform = isHidden ? '' : 'rotate(180deg)';
    elements.manualToggleText.textContent = isHidden ? 'Enter manually' : 'Hide manual input';
  }

  // ============ Calculation & Display ============

  function handleConventionChange() {
    state.convention = elements.conventionSelect.value;
    StorageManager.updatePreference('convention', state.convention);

    if (state.convention === 'Custom') {
      elements.customAngleWrapper.classList.remove('hidden');
    } else {
      elements.customAngleWrapper.classList.add('hidden');
    }

    calculateAndDisplay();
  }

  function handleCustomAngleChange() {
    const angle = parseFloat(elements.customAngleInput.value);
    if (angle >= 10 && angle <= 25) {
      state.customAngle = angle;
      StorageManager.updatePreference('customAngle', angle);
      calculateAndDisplay();
    }
  }

  function handleDateChange() {
    const dateValue = elements.dateInput.value;
    if (dateValue) {
      state.date = new Date(dateValue + 'T00:00:00');
      calculateAndDisplay();
    }
  }

  function calculateAndDisplay() {
    if (!state.location) {
      elements.fajrTime.textContent = '--:--';
      elements.fajrAmpm.textContent = 'AM';
      elements.sunriseTime.textContent = '--:--';
      elements.sunriseAmpm.textContent = 'AM';
      elements.countdownValue.textContent = '--:--:--';
      return;
    }

    const result = PrayerCalculator.calculate({
      latitude: state.location.lat,
      longitude: state.location.lon,
      elevation: state.elevation,
      date: state.date,
      convention: state.convention,
      customAngle: state.customAngle
    });

    state.currentResult = result;

    // Update Fajr time display
    elements.fajrTime.textContent = result.fajr.formatted;
    elements.fajrAmpm.textContent = result.fajr.period;

    // Update Sunrise display
    elements.sunriseTime.textContent = result.sunrise.formatted;
    elements.sunriseAmpm.textContent = result.sunrise.period;

    // Show high latitude warning if applicable
    if (result.highLatWarning) {
      elements.highLatWarning.classList.remove('hidden');
      elements.highLatMethod.textContent = result.highLatWarning;
    } else {
      elements.highLatWarning.classList.add('hidden');
    }

    // Update countdown
    updateCountdown();

    // Announce to screen readers
    announceTime(result.fajr);
  }

  function updateCountdown() {
    if (!state.currentResult || state.currentResult.rawHours.fajr === null) {
      elements.countdownValue.textContent = '--:--:--';
      return;
    }

    // Create date object for Fajr time
    const fajrDate = PrayerCalculator.createDateTime(state.currentResult.rawHours.fajr, state.date);
    const now = new Date();

    // If Fajr has passed today, show for tomorrow
    if (now > fajrDate) {
      fajrDate.setDate(fajrDate.getDate() + 1);
    }

    const countdown = PrayerCalculator.getTimeUntil(fajrDate, now);

    if (countdown.passed) {
      elements.countdownLabel.textContent = 'Fajr has begun';
      elements.countdownValue.textContent = '';
    } else {
      elements.countdownLabel.textContent = 'Time until Fajr:';
      elements.countdownValue.textContent = countdown.formatted;
    }
  }

  function startCountdownTimer() {
    // Clear any existing interval
    if (state.countdownInterval) {
      clearInterval(state.countdownInterval);
    }

    // Update every second
    state.countdownInterval = setInterval(updateCountdown, 1000);
  }

  function announceTime(fajr) {
    // Create a live region announcement for screen readers
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.setAttribute('aria-atomic', 'true');
    announcement.className = 'sr-only';
    announcement.textContent = `Fajr time is ${fajr.formatted} ${fajr.period}`;
    document.body.appendChild(announcement);

    setTimeout(() => announcement.remove(), 1000);
  }

  function updateUI() {
    calculateAndDisplay();
    startCountdownTimer();
  }

  // ============ Calendar Modal ============

  function openCalendarModal() {
    if (!state.location) {
      showToast('Please set a location first', 'error');
      return;
    }

    state.calendarMonth = state.date.getMonth();
    state.calendarYear = state.date.getFullYear();

    renderCalendar();
    elements.calendarModal.classList.remove('hidden');
    elements.calendarModal.querySelector('[role="dialog"]');
    document.body.style.overflow = 'hidden';

    // Focus the close button
    elements.calendarCloseBtn.focus();
  }

  function closeCalendarModal() {
    elements.calendarModal.classList.add('hidden');
    document.body.style.overflow = '';
    elements.calendarBtn.focus();
  }

  function navigateMonth(delta) {
    state.calendarMonth += delta;

    if (state.calendarMonth > 11) {
      state.calendarMonth = 0;
      state.calendarYear++;
    } else if (state.calendarMonth < 0) {
      state.calendarMonth = 11;
      state.calendarYear--;
    }

    renderCalendar();
  }

  function renderCalendar() {
    const monthName = new Date(state.calendarYear, state.calendarMonth, 1).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric'
    });
    elements.calendarMonthYear.textContent = monthName;

    const monthData = PrayerCalculator.calculateMonth({
      year: state.calendarYear,
      month: state.calendarMonth,
      latitude: state.location.lat,
      longitude: state.location.lon,
      elevation: state.elevation,
      convention: state.convention,
      customAngle: state.customAngle
    });

    const today = new Date();
    const todayStr = today.toDateString();

    elements.calendarBody.innerHTML = monthData.map(day => {
      const isToday = day.date.toDateString() === todayStr;
      return `
        <tr class="calendar-row ${isToday ? 'today' : ''}">
          <td class="py-3 px-2 text-center">${day.dayName}</td>
          <td class="py-3 px-2 text-center">${day.day}</td>
          <td class="py-3 px-2 text-center font-medium ${day.highLatWarning ? 'text-yellow-400' : ''}">${day.fajr.formatted} ${day.fajr.period}</td>
          <td class="py-3 px-2 text-center text-white/60">${day.sunrise.formatted} ${day.sunrise.period}</td>
        </tr>
      `;
    }).join('');
  }

  // ============ Save Location Modal ============

  function openSaveModal() {
    if (!state.location) {
      showToast('Please set a location first', 'error');
      return;
    }

    elements.locationLabelInput.value = state.locationName || '';
    elements.saveModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    elements.locationLabelInput.focus();
  }

  function closeSaveModal() {
    elements.saveModal.classList.add('hidden');
    document.body.style.overflow = '';
    elements.saveLocationBtn.focus();
  }

  function confirmSaveLocation() {
    const label = elements.locationLabelInput.value.trim() || state.locationName || 'Saved Location';

    StorageManager.saveLocation({
      latitude: state.location.lat,
      longitude: state.location.lon,
      elevation: state.elevation,
      name: state.locationName,
      label
    });

    loadSavedLocations();
    closeSaveModal();
    showToast('Location saved', 'success');
  }

  // ============ Share ============

  async function shareTime() {
    if (!state.currentResult) {
      showToast('No prayer time to share', 'error');
      return;
    }

    const text = `Fajr time: ${state.currentResult.fajr.formatted} ${state.currentResult.fajr.period}
Sunrise: ${state.currentResult.sunrise.formatted} ${state.currentResult.sunrise.period}
Date: ${state.date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
Location: ${state.locationName || 'Unknown'}
Calculation: ${state.convention}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Fajr Prayer Time',
          text
        });
      } catch (e) {
        if (e.name !== 'AbortError') {
          copyToClipboard(text);
        }
      }
    } else {
      copyToClipboard(text);
    }
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Copied to clipboard', 'success');
    } catch (e) {
      showToast('Unable to copy', 'error');
    }
  }

  // ============ Calendar Download ============

  function openAlarmModal() {
    if (!state.location) {
      showToast('Please set a location first', 'error');
      return;
    }

    // Reset modal to defaults (at prayer time + 15 min before)
    elements.alarmCheckboxes.forEach(cb => {
      cb.checked = cb.value === '0' || cb.value === '15'; // Default: at prayer time + 15 min
      cb.disabled = false;
    });
    elements.alarmDaysSelect.value = '30';
    elements.alarmNoneCheckbox.checked = false;

    elements.alarmModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeAlarmModal() {
    elements.alarmModal.classList.add('hidden');
    document.body.style.overflow = '';
    elements.downloadCalendarBtn.focus();
  }

  function handleNoAlarmToggle() {
    const noAlarm = elements.alarmNoneCheckbox.checked;

    // Disable/enable all alarm checkboxes
    elements.alarmCheckboxes.forEach(cb => {
      cb.disabled = noAlarm;
      if (noAlarm) cb.checked = false;
    });
  }

  function getSelectedAlarms() {
    const alarms = [];

    // Get checked preset alarms
    elements.alarmCheckboxes.forEach(cb => {
      if (cb.checked && !cb.disabled) {
        alarms.push(parseInt(cb.value, 10));
      }
    });

    // Sort alarms in ascending order
    return alarms.sort((a, b) => a - b);
  }

  function downloadCalendarWithAlarms() {
    try {
      const alarms = getSelectedAlarms();
      const daysAhead = parseInt(elements.alarmDaysSelect.value, 10);
      const noAlarm = elements.alarmNoneCheckbox.checked;

      const icsContent = PrayerCalculator.generateICS({
        latitude: state.location.lat,
        longitude: state.location.lon,
        elevation: state.elevation,
        convention: state.convention,
        locationName: state.locationName || 'Prayer Location',
        daysAhead: daysAhead,
        alarmMinutes: alarms,
        includeAlarm: !noAlarm && alarms.length > 0
      });

      PrayerCalculator.downloadICS(icsContent, 'prayer-times.ics');

      closeAlarmModal();

      // Show success message with alarm info
      if (noAlarm || alarms.length === 0) {
        showToast(`Calendar downloaded (${daysAhead} days, no alarms)`, 'success');
      } else if (alarms.length === 1) {
        const mins = alarms[0];
        const msg = mins === 0 ? 'at prayer time' : `${mins} min before`;
        showToast(`Calendar downloaded (${daysAhead} days, alarm ${msg})`, 'success');
      } else {
        showToast(`Calendar downloaded (${daysAhead} days, ${alarms.length} alarms)`, 'success');
      }
    } catch (error) {
      console.error('Calendar generation error:', error);
      showToast('Failed to generate calendar. Please try again.', 'error');
    }
  }

  // ============ Toast Notifications ============

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast-enter pointer-events-auto flex items-center gap-3 p-4 rounded-xl shadow-lg ${
      type === 'success' ? 'bg-green-500/90' :
      type === 'error' ? 'bg-red-500/90' :
      'bg-white/10 backdrop-blur-sm'
    }`;

    const icon = type === 'success' ? `
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
      </svg>
    ` : type === 'error' ? `
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
      </svg>
    ` : `
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
      </svg>
    `;

    toast.innerHTML = `${icon}<span class="text-sm font-medium">${escapeHtml(message)}</span>`;

    elements.toastContainer.appendChild(toast);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      toast.classList.remove('toast-enter');
      toast.classList.add('toast-exit');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ============ Keyboard Navigation ============

  function handleGlobalKeydown(e) {
    // Close modals on Escape
    if (e.key === 'Escape') {
      if (!elements.calendarModal.classList.contains('hidden')) {
        closeCalendarModal();
      }
      if (!elements.saveModal.classList.contains('hidden')) {
        closeSaveModal();
      }
      if (!elements.alarmModal.classList.contains('hidden')) {
        closeAlarmModal();
      }
    }
  }

  // ============ Utilities ============

  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Initialize app when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
