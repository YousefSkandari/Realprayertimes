/**
 * 3D Prayer Globe Visualization
 *
 * Shows the entire world praying toward Mecca with prayer rows that
 * illuminate in real-time based on Islamic prayer times at each location.
 */

const PrayerGlobe = (function() {
  'use strict';

  // Constants
  const MECCA = { lat: 21.4225, lng: 39.8262 };
  const EARTH_RADIUS_KM = 6371;
  const DEG_TO_RAD = Math.PI / 180;
  const RAD_TO_DEG = 180 / Math.PI;
  const PRAYER_WINDOW_HOURS = 0.5; // 30-minute prayer window

  // Earth texture URLs
  const EARTH_TEXTURE_URL = 'https://unpkg.com/three-globe@2.31.0/example/img/earth-blue-marble.jpg';
  const LAND_MASK_URL = 'https://unpkg.com/three-globe@2.31.0/example/img/earth-water.png';

  // Prayer configuration with colors
  const PRAYERS = {
    fajr:    { name: 'Fajr',    color: '#818cf8', hex: 0x818cf8, angle: -18 },
    dhuhr:   { name: 'Dhuhr',   color: '#facc15', hex: 0xfacc15, angle: 0 },
    asr:     { name: 'Asr',     color: '#fb923c', hex: 0xfb923c, angle: 'shadow' },
    maghrib: { name: 'Maghrib', color: '#f87171', hex: 0xf87171, angle: -0.833 },
    isha:    { name: 'Isha',    color: '#c084fc', hex: 0xc084fc, angle: -17 },
  };

  // State
  let scene, camera, renderer, controls;
  let globe, meccaMarker, meccaGlow;
  let prayerLines = [];
  let qiblaLines = [];
  let animationId;
  let currentTime = new Date();
  let isPlaying = true;
  let speed = 60; // minutes per second
  let rowInterval = 500; // km between rows
  let selectedPrayer = 'all';
  let prayerCounts = { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 };
  let container;
  let lastFrameTime = 0;
  let autoRotate = true;
  let landMaskData = null;
  let landMaskCanvas = null;

  // Touch/drag state for manual controls
  let isDragging = false;
  let previousMousePosition = { x: 0, y: 0 };
  let spherical = { theta: 0, phi: Math.PI / 2, radius: 3 };

  /**
   * Convert latitude/longitude to 3D coordinates
   */
  function latLngToVector3(lat, lng, radius = 1) {
    const phi = DEG_TO_RAD * (90 - lat);
    const theta = DEG_TO_RAD * (lng + 180);
    return new THREE.Vector3(
      -radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta)
    );
  }

  /**
   * Get point on circle at given distance and bearing from center
   */
  function getPointOnCircle(centerLat, centerLng, distanceKm, bearingDeg) {
    const angularDistance = distanceKm / EARTH_RADIUS_KM;
    const bearingRad = DEG_TO_RAD * bearingDeg;
    const lat1 = DEG_TO_RAD * centerLat;
    const lng1 = DEG_TO_RAD * centerLng;

    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearingRad)
    );

    const lng2 = lng1 + Math.atan2(
      Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    );

    return {
      lat: RAD_TO_DEG * lat2,
      lng: ((RAD_TO_DEG * lng2 + 540) % 360) - 180
    };
  }

  /**
   * Calculate bearing from point to Mecca (Qibla direction)
   */
  function calculateQibla(lat, lng) {
    const lat1 = DEG_TO_RAD * lat;
    const lat2 = DEG_TO_RAD * MECCA.lat;
    const dLng = DEG_TO_RAD * (MECCA.lng - lng);

    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

    return (RAD_TO_DEG * Math.atan2(y, x) + 360) % 360;
  }

  /**
   * Calculate distance between two points
   */
  function haversineDistance(lat1, lng1, lat2, lng2) {
    const dLat = DEG_TO_RAD * (lat2 - lat1);
    const dLng = DEG_TO_RAD * (lng2 - lng1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(DEG_TO_RAD * lat1) * Math.cos(DEG_TO_RAD * lat2) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return EARTH_RADIUS_KM * c;
  }

  /**
   * Check if a point is on land using the land mask
   */
  function isOnLand(lat, lng) {
    if (!landMaskData || !landMaskCanvas) return true; // Default to showing if no mask

    // Convert lat/lng to pixel coordinates
    const x = Math.floor(((lng + 180) / 360) * landMaskCanvas.width);
    const y = Math.floor(((90 - lat) / 180) * landMaskCanvas.height);

    // Get pixel index
    const idx = (y * landMaskCanvas.width + x) * 4;

    // Land is darker in the water mask (water is lighter/white)
    // So if the pixel is dark (low value), it's land
    const brightness = landMaskData[idx]; // Red channel
    return brightness < 128; // Land is dark, water is light
  }

  /**
   * Load land mask for filtering ocean areas
   */
  function loadLandMask() {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        landMaskCanvas = document.createElement('canvas');
        landMaskCanvas.width = img.width;
        landMaskCanvas.height = img.height;
        const ctx = landMaskCanvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        landMaskData = ctx.getImageData(0, 0, img.width, img.height).data;
        resolve(true);
      };
      img.onerror = () => {
        console.warn('Could not load land mask, showing all lines');
        resolve(false);
      };
      img.src = LAND_MASK_URL;
    });
  }

  /**
   * Calculate Julian Day for a date
   */
  function getJulianDay(date) {
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth() + 1;
    const d = date.getUTCDate() + date.getUTCHours() / 24 + date.getUTCMinutes() / 1440;

    let jd;
    if (m <= 2) {
      jd = Math.floor(365.25 * (y - 1)) + Math.floor(30.6001 * (m + 13)) + d + 1720995;
    } else {
      jd = Math.floor(365.25 * y) + Math.floor(30.6001 * (m + 1)) + d + 1720995;
    }

    const a = Math.floor(y / 100);
    return jd + 2 - a + Math.floor(a / 4);
  }

  /**
   * Get sun position (declination and equation of time)
   */
  function getSunPosition(jd) {
    const T = (jd - 2451545.0) / 36525;
    let L0 = (280.46646 + 36000.76983 * T) % 360;
    if (L0 < 0) L0 += 360;
    let M = (357.52911 + 35999.05029 * T) % 360;
    if (M < 0) M += 360;
    const MRad = DEG_TO_RAD * M;
    const C = (1.914602 - 0.004817 * T) * Math.sin(MRad) + 0.019993 * Math.sin(2 * MRad);
    const sunLong = L0 + C;
    const obliquity = 23.439 - 0.00000036 * (jd - 2451545.0);
    const declination = RAD_TO_DEG * Math.asin(
      Math.sin(DEG_TO_RAD * obliquity) * Math.sin(DEG_TO_RAD * sunLong)
    );
    const y2 = Math.tan(DEG_TO_RAD * obliquity / 2) ** 2;
    const L0Rad = DEG_TO_RAD * L0;
    const eqTime = 4 * RAD_TO_DEG * (
      y2 * Math.sin(2 * L0Rad) - 2 * Math.sin(MRad) +
      4 * y2 * Math.sin(MRad) * Math.cos(2 * L0Rad) -
      0.5 * y2 * y2 * Math.sin(4 * L0Rad) - 1.25 * Math.sin(2 * MRad)
    );
    return { declination, eqTime };
  }

  /**
   * Get time for sun at specific angle
   */
  function getTimeForAngle(lat, lng, angle, rising, declination, eqTime) {
    const noon = 12 - lng / 15 - eqTime / 60;
    const latRad = DEG_TO_RAD * lat;
    const decRad = DEG_TO_RAD * declination;
    const angleRad = DEG_TO_RAD * angle;
    const cosH = (Math.sin(angleRad) - Math.sin(latRad) * Math.sin(decRad)) /
                 (Math.cos(latRad) * Math.cos(decRad));
    if (cosH > 1 || cosH < -1) return null;
    const H = RAD_TO_DEG * Math.acos(cosH) / 15;
    return rising ? noon - H : noon + H;
  }

  /**
   * Calculate Asr time based on shadow length
   */
  function calculateAsr(noon, lat, declination) {
    const latRad = DEG_TO_RAD * lat;
    const decRad = DEG_TO_RAD * declination;
    const angle = Math.atan(1 / (1 + Math.tan(Math.abs(latRad - decRad))));
    const asrAngle = RAD_TO_DEG * angle;
    const cosH = (Math.sin(DEG_TO_RAD * asrAngle) - Math.sin(latRad) * Math.sin(decRad)) /
                 (Math.cos(latRad) * Math.cos(decRad));
    if (cosH > 1 || cosH < -1) return null;
    const H = RAD_TO_DEG * Math.acos(cosH) / 15;
    return noon + H;
  }

  /**
   * Calculate all prayer times for a location
   */
  function calculatePrayerTimes(lat, lng, date) {
    const jd = getJulianDay(date);
    const { declination, eqTime } = getSunPosition(jd);
    const noon = 12 - lng / 15 - eqTime / 60;
    return {
      fajr: getTimeForAngle(lat, lng, -18, true, declination, eqTime),
      dhuhr: noon + 2 / 60,
      asr: calculateAsr(noon, lat, declination),
      maghrib: getTimeForAngle(lat, lng, -0.833, false, declination, eqTime),
      isha: getTimeForAngle(lat, lng, -17, false, declination, eqTime)
    };
  }

  /**
   * Check if a location is currently praying
   */
  function getCurrentPrayer(lat, lng, utcDate) {
    const localHour = (utcDate.getUTCHours() + utcDate.getUTCMinutes() / 60 + lng / 15 + 24) % 24;
    const times = calculatePrayerTimes(lat, lng, utcDate);
    for (const [prayer, time] of Object.entries(times)) {
      if (time === null) continue;
      let prayerTime = time;
      while (prayerTime < 0) prayerTime += 24;
      while (prayerTime >= 24) prayerTime -= 24;
      if (localHour >= prayerTime && localHour < prayerTime + PRAYER_WINDOW_HOURS) {
        return prayer;
      }
    }
    return null;
  }

  /**
   * Create a great circle arc (geodesic) between two points
   */
  function createGreatCircleArc(startLat, startLng, endLat, endLng, segments = 32, radius = 1.008) {
    const points = [];
    const start = latLngToVector3(startLat, startLng, radius);
    const end = latLngToVector3(endLat, endLng, radius);

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      // Spherical interpolation (slerp)
      const point = new THREE.Vector3().copy(start).lerp(end, t).normalize().multiplyScalar(radius);
      points.push(point);
    }

    return new THREE.BufferGeometry().setFromPoints(points);
  }

  /**
   * Create concentric prayer row circle at distance from Mecca
   */
  function createPrayerRowCircle(distanceKm, segments = 72) {
    const points = [];
    const radius = 1.008;

    for (let i = 0; i <= segments; i++) {
      const bearing = (i / segments) * 360;
      const point = getPointOnCircle(MECCA.lat, MECCA.lng, distanceKm, bearing);
      points.push(latLngToVector3(point.lat, point.lng, radius));
    }

    return {
      geometry: new THREE.BufferGeometry().setFromPoints(points),
      points: points.map((_, i) => {
        const bearing = (i / segments) * 360;
        return getPointOnCircle(MECCA.lat, MECCA.lng, distanceKm, bearing);
      })
    };
  }

  /**
   * Create Qibla direction arrow from a point toward Mecca
   */
  function createQiblaArrow(lat, lng, lengthKm = 200) {
    const qibla = calculateQibla(lat, lng);
    const endPoint = getPointOnCircle(lat, lng, lengthKm, qibla);

    const points = [];
    const segments = 8;
    const radius = 1.01;

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const interpLat = lat + (endPoint.lat - lat) * t;
      const interpLng = lng + (endPoint.lng - lng) * t;
      points.push(latLngToVector3(interpLat, interpLng, radius));
    }

    // Add arrowhead
    const arrowSize = lengthKm * 0.3;
    const leftPoint = getPointOnCircle(endPoint.lat, endPoint.lng, arrowSize, (qibla + 150) % 360);
    const rightPoint = getPointOnCircle(endPoint.lat, endPoint.lng, arrowSize, (qibla + 210) % 360);

    return {
      line: new THREE.BufferGeometry().setFromPoints(points),
      arrowLeft: new THREE.BufferGeometry().setFromPoints([
        latLngToVector3(endPoint.lat, endPoint.lng, radius),
        latLngToVector3(leftPoint.lat, leftPoint.lng, radius)
      ]),
      arrowRight: new THREE.BufferGeometry().setFromPoints([
        latLngToVector3(endPoint.lat, endPoint.lng, radius),
        latLngToVector3(rightPoint.lat, rightPoint.lng, radius)
      ]),
      midLat: lat,
      midLng: lng
    };
  }

  /**
   * Initialize manual camera controls
   */
  function initManualControls() {
    const domElement = renderer.domElement;

    // Mouse events
    domElement.addEventListener('mousedown', onPointerDown);
    domElement.addEventListener('mousemove', onPointerMove);
    domElement.addEventListener('mouseup', onPointerUp);
    domElement.addEventListener('mouseleave', onPointerUp);
    domElement.addEventListener('wheel', onWheel, { passive: false });

    // Touch events
    domElement.addEventListener('touchstart', onTouchStart, { passive: false });
    domElement.addEventListener('touchmove', onTouchMove, { passive: false });
    domElement.addEventListener('touchend', onTouchEnd);

    // Initialize camera position
    updateCameraPosition();
  }

  function onPointerDown(e) {
    isDragging = true;
    autoRotate = false;
    previousMousePosition = { x: e.clientX, y: e.clientY };
  }

  function onPointerMove(e) {
    if (!isDragging) return;

    const deltaX = e.clientX - previousMousePosition.x;
    const deltaY = e.clientY - previousMousePosition.y;

    spherical.theta -= deltaX * 0.005;
    spherical.phi += deltaY * 0.005;

    // Clamp phi to avoid flipping
    spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));

    previousMousePosition = { x: e.clientX, y: e.clientY };
    updateCameraPosition();
  }

  function onPointerUp() {
    isDragging = false;
  }

  function onWheel(e) {
    e.preventDefault();
    spherical.radius += e.deltaY * 0.002;
    spherical.radius = Math.max(1.5, Math.min(6, spherical.radius));
    updateCameraPosition();
  }

  let touchStartDistance = 0;
  let lastTouchPosition = { x: 0, y: 0 };

  function onTouchStart(e) {
    e.preventDefault();
    autoRotate = false;

    if (e.touches.length === 1) {
      isDragging = true;
      lastTouchPosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      isDragging = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchStartDistance = Math.sqrt(dx * dx + dy * dy);
    }
  }

  function onTouchMove(e) {
    e.preventDefault();

    if (e.touches.length === 1 && isDragging) {
      const deltaX = e.touches[0].clientX - lastTouchPosition.x;
      const deltaY = e.touches[0].clientY - lastTouchPosition.y;

      spherical.theta -= deltaX * 0.008;
      spherical.phi += deltaY * 0.008;
      spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));

      lastTouchPosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      updateCameraPosition();
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      const delta = touchStartDistance - distance;
      spherical.radius += delta * 0.01;
      spherical.radius = Math.max(1.5, Math.min(6, spherical.radius));

      touchStartDistance = distance;
      updateCameraPosition();
    }
  }

  function onTouchEnd() {
    isDragging = false;
  }

  function updateCameraPosition() {
    camera.position.x = spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
    camera.position.y = spherical.radius * Math.cos(spherical.phi);
    camera.position.z = spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);
    camera.lookAt(0, 0, 0);
  }

  /**
   * Initialize the 3D scene
   */
  async function init(containerId) {
    container = document.getElementById(containerId);
    if (!container) {
      console.error('Container not found:', containerId);
      return;
    }

    // Load land mask first
    await loadLandMask();

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a1a);

    // Camera
    camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );

    // Renderer
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Initialize manual controls (more reliable than OrbitControls)
    initManualControls();

    // Create globe with Earth texture
    createGlobe();

    // Create Mecca marker
    createMeccaMarker();

    // Create prayer rows (concentric circles)
    createPrayerRows();

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
    sunLight.position.set(5, 3, 5);
    scene.add(sunLight);

    // Handle resize
    window.addEventListener('resize', onWindowResize);

    // Start animation
    animate();
  }

  /**
   * Create the Earth globe with texture
   */
  function createGlobe() {
    const geometry = new THREE.SphereGeometry(1, 64, 64);
    const textureLoader = new THREE.TextureLoader();

    const fallbackMaterial = new THREE.MeshPhongMaterial({
      color: 0x2d5a87,
      shininess: 5
    });

    globe = new THREE.Mesh(geometry, fallbackMaterial);
    scene.add(globe);

    textureLoader.load(
      EARTH_TEXTURE_URL,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        globe.material = new THREE.MeshPhongMaterial({
          map: texture,
          shininess: 10,
          specular: new THREE.Color(0x333333)
        });
      },
      undefined,
      (error) => console.warn('Could not load Earth texture:', error)
    );

    // Atmosphere glow
    const atmosphereGeometry = new THREE.SphereGeometry(1.03, 64, 64);
    const atmosphereMaterial = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
          gl_FragColor = vec4(0.3, 0.6, 1.0, 1.0) * intensity * 0.6;
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true
    });

    const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
    scene.add(atmosphere);
  }

  /**
   * Create Mecca marker
   */
  function createMeccaMarker() {
    const markerGeometry = new THREE.SphereGeometry(0.03, 16, 16);
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xffd700 });
    meccaMarker = new THREE.Mesh(markerGeometry, markerMaterial);

    const pos = latLngToVector3(MECCA.lat, MECCA.lng, 1.03);
    meccaMarker.position.copy(pos);
    scene.add(meccaMarker);

    // Glow effect
    const glowGeometry = new THREE.SphereGeometry(0.06, 16, 16);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0xffd700,
      transparent: true,
      opacity: 0.4
    });
    meccaGlow = new THREE.Mesh(glowGeometry, glowMaterial);
    meccaGlow.position.copy(pos);
    scene.add(meccaGlow);
  }

  /**
   * Create prayer rows and Qibla direction lines
   */
  function createPrayerRows() {
    // Clear existing
    prayerLines.forEach(obj => {
      if (obj.line) scene.remove(obj.line);
    });
    prayerLines = [];

    qiblaLines.forEach(obj => {
      if (obj.line) scene.remove(obj.line);
      if (obj.arrowLeft) scene.remove(obj.arrowLeft);
      if (obj.arrowRight) scene.remove(obj.arrowRight);
    });
    qiblaLines = [];

    const maxDistance = Math.PI * EARTH_RADIUS_KM * 0.95; // Almost half circumference

    // Create concentric prayer row circles
    for (let dist = rowInterval; dist < maxDistance; dist += rowInterval) {
      const segments = Math.max(36, Math.floor(72 * (dist / 5000)));

      // Create points for this distance circle
      const circlePoints = [];
      for (let i = 0; i <= segments; i++) {
        const bearing = (i / segments) * 360;
        const point = getPointOnCircle(MECCA.lat, MECCA.lng, dist, bearing);
        circlePoints.push({
          lat: point.lat,
          lng: point.lng,
          bearing: bearing
        });
      }

      // Create line segments, only for land portions
      let currentSegmentPoints = [];

      for (let i = 0; i < circlePoints.length; i++) {
        const point = circlePoints[i];
        const onLand = isOnLand(point.lat, point.lng);

        if (onLand) {
          currentSegmentPoints.push(latLngToVector3(point.lat, point.lng, 1.008));
        }

        // End current segment if we hit water or end of circle
        if ((!onLand || i === circlePoints.length - 1) && currentSegmentPoints.length > 1) {
          const geometry = new THREE.BufferGeometry().setFromPoints(currentSegmentPoints);
          const material = new THREE.LineBasicMaterial({
            color: 0x4a5568,
            transparent: true,
            opacity: 0.4,
            linewidth: 2
          });
          const line = new THREE.Line(geometry, material);

          // Store midpoint for prayer time calculation
          const midIdx = Math.floor(currentSegmentPoints.length / 2);
          const midPoint = circlePoints[Math.min(i - currentSegmentPoints.length + midIdx, circlePoints.length - 1)];

          prayerLines.push({
            line: line,
            distKm: dist,
            midLat: midPoint ? midPoint.lat : 0,
            midLng: midPoint ? midPoint.lng : 0
          });

          scene.add(line);
          currentSegmentPoints = [];
        }
      }
    }

    // Create Qibla direction arrows on land areas
    const qiblaSpacing = 30; // degrees
    for (let lat = -60; lat <= 70; lat += qiblaSpacing) {
      for (let lng = -180; lng < 180; lng += qiblaSpacing) {
        // Skip if on water
        if (!isOnLand(lat, lng)) continue;

        // Skip if too close to Mecca
        const distToMecca = haversineDistance(lat, lng, MECCA.lat, MECCA.lng);
        if (distToMecca < 500) continue;

        const arrowLength = Math.min(400, distToMecca * 0.1);
        const arrow = createQiblaArrow(lat, lng, arrowLength);

        const material = new THREE.LineBasicMaterial({
          color: 0x4a5568,
          transparent: true,
          opacity: 0.3
        });

        const line = new THREE.Line(arrow.line, material.clone());
        const arrowLeft = new THREE.Line(arrow.arrowLeft, material.clone());
        const arrowRight = new THREE.Line(arrow.arrowRight, material.clone());

        scene.add(line);
        scene.add(arrowLeft);
        scene.add(arrowRight);

        qiblaLines.push({
          line: line,
          arrowLeft: arrowLeft,
          arrowRight: arrowRight,
          midLat: lat,
          midLng: lng
        });
      }
    }
  }

  /**
   * Update line colors based on current prayer times
   */
  function updateLineColors() {
    // Reset prayer counts
    Object.keys(prayerCounts).forEach(p => prayerCounts[p] = 0);

    // Update prayer row circles
    prayerLines.forEach(obj => {
      if (!obj.line) return;

      const prayer = getCurrentPrayer(obj.midLat, obj.midLng, currentTime);

      if (prayer && (selectedPrayer === 'all' || selectedPrayer === prayer)) {
        const prayerInfo = PRAYERS[prayer];
        obj.line.material.color.setHex(prayerInfo.hex);
        obj.line.material.opacity = 0.9;
        prayerCounts[prayer]++;
      } else {
        obj.line.material.color.setHex(0x4a5568);
        obj.line.material.opacity = 0.25;
      }
    });

    // Update Qibla arrows
    qiblaLines.forEach(obj => {
      if (!obj.line) return;

      const prayer = getCurrentPrayer(obj.midLat, obj.midLng, currentTime);

      if (prayer && (selectedPrayer === 'all' || selectedPrayer === prayer)) {
        const prayerInfo = PRAYERS[prayer];
        obj.line.material.color.setHex(prayerInfo.hex);
        obj.line.material.opacity = 0.8;
        obj.arrowLeft.material.color.setHex(prayerInfo.hex);
        obj.arrowLeft.material.opacity = 0.8;
        obj.arrowRight.material.color.setHex(prayerInfo.hex);
        obj.arrowRight.material.opacity = 0.8;
      } else {
        obj.line.material.color.setHex(0x4a5568);
        obj.line.material.opacity = 0.2;
        obj.arrowLeft.material.color.setHex(0x4a5568);
        obj.arrowLeft.material.opacity = 0.2;
        obj.arrowRight.material.color.setHex(0x4a5568);
        obj.arrowRight.material.opacity = 0.2;
      }
    });

    // Dispatch event for UI update
    window.dispatchEvent(new CustomEvent('prayerCountsUpdated', {
      detail: { counts: prayerCounts, time: currentTime }
    }));
  }

  /**
   * Animation loop
   */
  function animate(timestamp = 0) {
    animationId = requestAnimationFrame(animate);

    // Time progression
    if (isPlaying) {
      const deltaTime = timestamp - lastFrameTime;
      if (deltaTime > 0) {
        const minutesToAdd = (deltaTime / 1000) * speed;
        currentTime = new Date(currentTime.getTime() + minutesToAdd * 60000);
      }
    }
    lastFrameTime = timestamp;

    // Auto-rotate
    if (autoRotate && !isDragging) {
      spherical.theta += 0.001;
      updateCameraPosition();
    }

    // Update line colors every few frames
    if (Math.floor(timestamp / 100) !== Math.floor((timestamp - 16) / 100)) {
      updateLineColors();
    }

    // Pulse Mecca glow
    if (meccaGlow) {
      meccaGlow.scale.setScalar(1 + 0.2 * Math.sin(timestamp / 400));
    }

    renderer.render(scene, camera);
  }

  /**
   * Handle window resize
   */
  function onWindowResize() {
    if (!container || !camera || !renderer) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }

  // Public API
  function setTime(date) {
    currentTime = new Date(date);
    updateLineColors();
  }

  function togglePlay() {
    isPlaying = !isPlaying;
    return isPlaying;
  }

  function setSpeed(newSpeed) {
    speed = newSpeed;
  }

  function setRowInterval(intervalKm) {
    rowInterval = intervalKm;
    createPrayerRows();
    updateLineColors();
  }

  function setSelectedPrayer(prayer) {
    selectedPrayer = prayer;
    updateLineColors();
  }

  function toggleAutoRotate() {
    autoRotate = !autoRotate;
    return autoRotate;
  }

  function getState() {
    return {
      currentTime,
      isPlaying,
      speed,
      rowInterval,
      selectedPrayer,
      prayerCounts,
      autoRotate
    };
  }

  function dispose() {
    if (animationId) cancelAnimationFrame(animationId);
    if (renderer) {
      renderer.dispose();
      container.removeChild(renderer.domElement);
    }
    window.removeEventListener('resize', onWindowResize);
  }

  return {
    init,
    setTime,
    togglePlay,
    setSpeed,
    setRowInterval,
    setSelectedPrayer,
    toggleAutoRotate,
    getState,
    dispose,
    PRAYERS
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PrayerGlobe;
}
