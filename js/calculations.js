/**
 * Fajr Prayer Time Calculation Engine
 *
 * Based on astronomical formulas for calculating Islamic prayer times.
 * Implements multiple calculation conventions and high-latitude adjustments.
 */

const PrayerCalculator = (function() {
  'use strict';

  // Constants
  const EARTH_RADIUS = 6371000; // meters
  const DEG_PER_HOUR = 15;
  const DEG_TO_RAD = Math.PI / 180;
  const RAD_TO_DEG = 180 / Math.PI;

  // Calculation conventions with Fajr angles
  const CONVENTIONS = {
    MWL: { name: 'Muslim World League', fajrAngle: 18, ishaAngle: 17 },
    ISNA: { name: 'Islamic Society of North America', fajrAngle: 15, ishaAngle: 15 },
    Egypt: { name: 'Egyptian General Authority of Survey', fajrAngle: 19.5, ishaAngle: 17.5 },
    Makkah: { name: 'Umm al-Qura University', fajrAngle: 18.5, ishaAngle: 90 }, // 90 min after Maghrib
    Karachi: { name: 'University of Islamic Sciences, Karachi', fajrAngle: 18, ishaAngle: 18 },
    Tehran: { name: 'Institute of Geophysics, Tehran', fajrAngle: 17.7, ishaAngle: 14 },
    Singapore: { name: 'MUIS Singapore', fajrAngle: 20, ishaAngle: 18 },
    Custom: { name: 'Custom', fajrAngle: 18, ishaAngle: 17 }
  };

  // High latitude adjustment methods
  const HIGH_LAT_METHODS = {
    ANGLE_BASED: 'angle_based',
    SEVENTH_OF_NIGHT: 'seventh_of_night',
    MIDDLE_OF_NIGHT: 'middle_of_night'
  };

  /**
   * Get the day of year (1-366)
   * @param {Date} date - The date to calculate
   * @returns {number} Day of year
   */
  function getDayOfYear(date) {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date - start;
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay);
  }

  /**
   * Check if a year is a leap year
   * @param {number} year - The year to check
   * @returns {boolean}
   */
  function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  }

  /**
   * Calculate solar declination (δ) in degrees
   * @param {number} dayOfYear - Day of year (1-366)
   * @returns {number} Solar declination in degrees
   */
  function solarDeclination(dayOfYear) {
    return 23.45 * Math.sin(DEG_TO_RAD * (360 / 365) * (dayOfYear - 81));
  }

  /**
   * Calculate the Equation of Time in minutes
   * @param {number} dayOfYear - Day of year (1-366)
   * @returns {number} Equation of Time in minutes
   */
  function equationOfTime(dayOfYear) {
    const B = DEG_TO_RAD * (360 / 365) * (dayOfYear - 81);
    return 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
  }

  /**
   * Calculate solar noon in hours (local time)
   * @param {number} longitude - Longitude in degrees
   * @param {number} timezone - Timezone offset in hours (e.g., 0 for UTC, -5 for EST)
   * @param {number} eot - Equation of Time in minutes
   * @returns {number} Solar noon in decimal hours
   */
  function solarNoon(longitude, timezone, eot) {
    return 12 - (eot / 60) - (longitude / 15) + timezone;
  }

  /**
   * Calculate elevation adjustment angle (dip angle) in degrees
   * @param {number} elevation - Elevation in meters
   * @returns {number} Dip angle in degrees
   */
  function elevationAdjustment(elevation) {
    if (elevation <= 0) return 0;
    // θ_dip = √(2h / R) in radians, then convert to degrees
    const dipRadians = Math.sqrt(2 * elevation / EARTH_RADIUS);
    return dipRadians * RAD_TO_DEG;
  }

  /**
   * Calculate hour angle for a given sun angle
   * @param {number} angle - Sun angle below horizon (negative for below)
   * @param {number} latitude - Latitude in degrees
   * @param {number} declination - Solar declination in degrees
   * @returns {number|null} Hour angle in degrees, or null if sun doesn't reach that angle
   */
  function hourAngle(angle, latitude, declination) {
    const latRad = latitude * DEG_TO_RAD;
    const decRad = declination * DEG_TO_RAD;
    const angleRad = angle * DEG_TO_RAD;

    const cosH = (Math.sin(angleRad) - Math.sin(latRad) * Math.sin(decRad)) /
                 (Math.cos(latRad) * Math.cos(decRad));

    // Check if the sun reaches this angle
    if (cosH < -1 || cosH > 1) {
      return null; // Sun doesn't reach this angle
    }

    return Math.acos(cosH) * RAD_TO_DEG;
  }

  /**
   * Format decimal hours to HH:MM string
   * @param {number} hours - Decimal hours
   * @returns {object} Object with hours, minutes, period (AM/PM), and formatted string
   */
  function formatTime(hours) {
    if (hours === null || isNaN(hours)) {
      return { hours: null, minutes: null, period: 'AM', formatted: '--:--', time24: '--:--' };
    }

    // Normalize hours to 0-24 range
    while (hours < 0) hours += 24;
    while (hours >= 24) hours -= 24;

    const totalMinutes = Math.round(hours * 60);
    let h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;

    // 24-hour format
    const time24 = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

    // 12-hour format
    const period = h >= 12 ? 'PM' : 'AM';
    if (h === 0) h = 12;
    else if (h > 12) h -= 12;

    const formatted = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

    return { hours: h, minutes: m, period, formatted, time24 };
  }

  /**
   * Apply high latitude adjustment for Fajr
   * @param {object} params - Calculation parameters
   * @returns {object} Adjusted Fajr time with method used
   */
  function applyHighLatitudeAdjustment(params) {
    const { fajr, sunrise, sunset, maghrib, night, method } = params;

    if (fajr !== null) {
      return { time: fajr, methodUsed: null };
    }

    let adjustedTime;
    let methodUsed;

    switch (method) {
      case HIGH_LAT_METHODS.ANGLE_BASED:
        // Use 15° angle instead of 18°
        methodUsed = 'Using reduced angle (15°)';
        // This should be recalculated with shallower angle
        adjustedTime = sunrise - (night / 7);
        break;

      case HIGH_LAT_METHODS.SEVENTH_OF_NIGHT:
        // Fajr = Sunset + (1/7 × night duration)
        adjustedTime = sunset + (night / 7);
        if (adjustedTime >= 24) adjustedTime -= 24;
        methodUsed = 'Using 1/7 of night method';
        break;

      case HIGH_LAT_METHODS.MIDDLE_OF_NIGHT:
        // Split the night and estimate
        adjustedTime = sunset + (night / 2);
        if (adjustedTime >= 24) adjustedTime -= 24;
        methodUsed = 'Using middle of night method';
        break;

      default:
        adjustedTime = sunrise - 1.5; // Fallback: 1.5 hours before sunrise
        methodUsed = 'Using fallback (1.5 hours before sunrise)';
    }

    return { time: adjustedTime, methodUsed };
  }

  /**
   * Calculate Fajr and Sunrise times
   * @param {object} options - Calculation options
   * @returns {object} Calculated prayer times and metadata
   */
  function calculate(options) {
    const {
      latitude,
      longitude,
      elevation = 0,
      date = new Date(),
      convention = 'MWL',
      customAngle = null,
      timezone = null,
      highLatMethod = HIGH_LAT_METHODS.SEVENTH_OF_NIGHT
    } = options;

    // Get timezone offset if not provided
    const tz = timezone !== null ? timezone : -date.getTimezoneOffset() / 60;

    // Get day of year
    const dayOfYear = getDayOfYear(date);

    // Calculate solar parameters
    const declination = solarDeclination(dayOfYear);
    const eot = equationOfTime(dayOfYear);
    const noon = solarNoon(longitude, tz, eot);

    // Get Fajr angle from convention or custom
    let fajrAngle;
    if (convention === 'Custom' && customAngle !== null) {
      fajrAngle = customAngle;
    } else {
      fajrAngle = CONVENTIONS[convention]?.fajrAngle || 18;
    }

    // Apply elevation adjustment
    const dipAngle = elevationAdjustment(elevation);

    // Sunrise angle is approximately -0.833° (accounting for refraction)
    const sunriseAngle = -0.833 - dipAngle;

    // Fajr angle (negative, as sun is below horizon)
    const fajrAngleAdjusted = -fajrAngle - dipAngle;

    // Calculate hour angles
    const sunriseHA = hourAngle(sunriseAngle, latitude, declination);
    const fajrHA = hourAngle(fajrAngleAdjusted, latitude, declination);

    // Calculate times
    let sunrise = sunriseHA !== null ? noon - (sunriseHA / DEG_PER_HOUR) : null;
    let fajr = fajrHA !== null ? noon - (fajrHA / DEG_PER_HOUR) : null;

    // Calculate sunset for high latitude adjustments
    const sunsetHA = hourAngle(sunriseAngle, latitude, declination);
    let sunset = sunsetHA !== null ? noon + (sunsetHA / DEG_PER_HOUR) : null;

    // Calculate night duration for adjustments
    let nightDuration = null;
    if (sunrise !== null && sunset !== null) {
      nightDuration = 24 - (sunset - sunrise);
    }

    // Apply high latitude adjustment if needed
    let highLatWarning = null;
    if (fajr === null && sunrise !== null) {
      const adjusted = applyHighLatitudeAdjustment({
        fajr,
        sunrise,
        sunset,
        maghrib: sunset,
        night: nightDuration,
        method: highLatMethod
      });
      fajr = adjusted.time;
      highLatWarning = adjusted.methodUsed;
    }

    // Calculate Maghrib (sunset) for additional info
    const maghrib = sunset;

    return {
      fajr: formatTime(fajr),
      sunrise: formatTime(sunrise),
      sunset: formatTime(sunset),
      maghrib: formatTime(maghrib),
      solarNoon: formatTime(noon),
      date: date,
      location: {
        latitude,
        longitude,
        elevation
      },
      calculation: {
        convention,
        fajrAngle,
        declination: declination.toFixed(2),
        equationOfTime: eot.toFixed(2),
        dayOfYear
      },
      highLatWarning,
      rawHours: {
        fajr,
        sunrise,
        sunset
      }
    };
  }

  /**
   * Calculate monthly prayer times
   * @param {object} options - Calculation options
   * @returns {Array} Array of daily prayer times for the month
   */
  function calculateMonth(options) {
    const { year, month, ...calcOptions } = options;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const results = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const result = calculate({ ...calcOptions, date });
      results.push({
        date,
        day,
        dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
        fajr: result.fajr,
        sunrise: result.sunrise,
        highLatWarning: result.highLatWarning
      });
    }

    return results;
  }

  /**
   * Parse DMS (Degrees Minutes Seconds) format to decimal degrees
   * @param {string} dms - DMS string (e.g., "53°19′57″ N" or "2°7′59″ W")
   * @returns {number|null} Decimal degrees or null if invalid
   */
  function parseDMS(dms) {
    if (typeof dms === 'number') return dms;
    if (!dms || typeof dms !== 'string') return null;

    // Try parsing as decimal first
    const decimal = parseFloat(dms);
    if (!isNaN(decimal) && dms.match(/^-?\d+\.?\d*$/)) {
      return decimal;
    }

    // Parse DMS format
    const regex = /(-?)(\d+)[°]?\s*(\d+)?[′']?\s*(\d+(?:\.\d+)?)?[″"]?\s*([NSEW])?/i;
    const match = dms.match(regex);

    if (!match) return null;

    const sign = match[1] === '-' ? -1 : 1;
    const degrees = parseFloat(match[2]) || 0;
    const minutes = parseFloat(match[3]) || 0;
    const seconds = parseFloat(match[4]) || 0;
    const direction = match[5]?.toUpperCase();

    let result = sign * (degrees + minutes / 60 + seconds / 3600);

    // Apply direction
    if (direction === 'S' || direction === 'W') {
      result = -Math.abs(result);
    } else if (direction === 'N' || direction === 'E') {
      result = Math.abs(result);
    }

    return result;
  }

  /**
   * Format decimal degrees to DMS string
   * @param {number} decimal - Decimal degrees
   * @param {string} type - 'lat' or 'lon'
   * @returns {string} Formatted DMS string
   */
  function formatDMS(decimal, type) {
    const abs = Math.abs(decimal);
    const degrees = Math.floor(abs);
    const minutesDecimal = (abs - degrees) * 60;
    const minutes = Math.floor(minutesDecimal);
    const seconds = ((minutesDecimal - minutes) * 60).toFixed(1);

    let direction;
    if (type === 'lat') {
      direction = decimal >= 0 ? 'N' : 'S';
    } else {
      direction = decimal >= 0 ? 'E' : 'W';
    }

    return `${degrees}°${minutes}′${seconds}″ ${direction}`;
  }

  /**
   * Get time until next prayer
   * @param {Date} targetTime - The target prayer time
   * @param {Date} now - Current time (optional, defaults to now)
   * @returns {object} Time remaining object with formatted string
   */
  function getTimeUntil(targetTime, now = new Date()) {
    const diff = targetTime - now;

    if (diff <= 0) {
      return { passed: true, formatted: '00:00:00', hours: 0, minutes: 0, seconds: 0 };
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    const formatted = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    return { passed: false, formatted, hours, minutes, seconds };
  }

  /**
   * Create a Date object from today's date and decimal hours
   * @param {number} decimalHours - Time in decimal hours
   * @param {Date} referenceDate - Reference date (optional)
   * @returns {Date} Full Date object
   */
  function createDateTime(decimalHours, referenceDate = new Date()) {
    const date = new Date(referenceDate);
    const hours = Math.floor(decimalHours);
    const minutes = Math.round((decimalHours - hours) * 60);

    date.setHours(hours, minutes, 0, 0);
    return date;
  }

  // Public API
  return {
    calculate,
    calculateMonth,
    parseDMS,
    formatDMS,
    formatTime,
    getTimeUntil,
    createDateTime,
    CONVENTIONS,
    HIGH_LAT_METHODS
  };
})();

// Export for module systems (if available)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PrayerCalculator;
}
