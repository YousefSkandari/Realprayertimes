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

  // Earth texture URL (NASA Blue Marble)
  const EARTH_TEXTURE_URL = 'https://unpkg.com/three-globe@2.31.0/example/img/earth-blue-marble.jpg';
  const EARTH_BUMP_URL = 'https://unpkg.com/three-globe@2.31.0/example/img/earth-topology.png';

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
  let rowSegments = [];
  let rowMeshes = [];
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

    // Mean longitude of the sun
    let L0 = (280.46646 + 36000.76983 * T) % 360;
    if (L0 < 0) L0 += 360;

    // Mean anomaly
    let M = (357.52911 + 35999.05029 * T) % 360;
    if (M < 0) M += 360;
    const MRad = DEG_TO_RAD * M;

    // Equation of center
    const C = (1.914602 - 0.004817 * T) * Math.sin(MRad) + 0.019993 * Math.sin(2 * MRad);

    // Sun's true longitude
    const sunLong = L0 + C;

    // Obliquity of ecliptic
    const obliquity = 23.439 - 0.00000036 * (jd - 2451545.0);

    // Sun's declination
    const declination = RAD_TO_DEG * Math.asin(
      Math.sin(DEG_TO_RAD * obliquity) * Math.sin(DEG_TO_RAD * sunLong)
    );

    // Equation of time
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

    // Shafi'i method: shadow = object height + noon shadow
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
      dhuhr: noon + 2 / 60, // 2 minutes after solar noon
      asr: calculateAsr(noon, lat, declination),
      maghrib: getTimeForAngle(lat, lng, -0.833, false, declination, eqTime),
      isha: getTimeForAngle(lat, lng, -17, false, declination, eqTime)
    };
  }

  /**
   * Check if a location is currently praying
   */
  function getCurrentPrayer(lat, lng, utcDate) {
    // Get local hour based on longitude
    const localHour = (utcDate.getUTCHours() + utcDate.getUTCMinutes() / 60 + lng / 15 + 24) % 24;

    const times = calculatePrayerTimes(lat, lng, utcDate);

    for (const [prayer, time] of Object.entries(times)) {
      if (time === null) continue;

      // Normalize time to 0-24 range
      let prayerTime = time;
      while (prayerTime < 0) prayerTime += 24;
      while (prayerTime >= 24) prayerTime -= 24;

      // Check if within prayer window
      if (localHour >= prayerTime && localHour < prayerTime + PRAYER_WINDOW_HOURS) {
        return prayer;
      }
    }

    return null;
  }

  /**
   * Generate row segments around Mecca
   */
  function generateRowSegments(intervalKm, segmentAngle = 10) {
    const segments = [];
    const maxDistance = Math.PI * EARTH_RADIUS_KM; // Half circumference

    for (let dist = intervalKm; dist < maxDistance; dist += intervalKm) {
      for (let bearing = 0; bearing < 360; bearing += segmentAngle) {
        const start = getPointOnCircle(MECCA.lat, MECCA.lng, dist, bearing);
        const mid = getPointOnCircle(MECCA.lat, MECCA.lng, dist, bearing + segmentAngle / 2);
        const end = getPointOnCircle(MECCA.lat, MECCA.lng, dist, bearing + segmentAngle);

        segments.push({
          distKm: dist,
          start,
          mid,
          end,
          bearing,
          rowNumber: Math.floor(dist * 1000 / 1.2) // 1.2m row spacing
        });
      }
    }

    return segments;
  }

  /**
   * Create arc geometry between two points
   */
  function createArcGeometry(start, end, segments = 8) {
    const points = [];
    const startVec = latLngToVector3(start.lat, start.lng, 1.008);
    const endVec = latLngToVector3(end.lat, end.lng, 1.008);

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const point = new THREE.Vector3().lerpVectors(startVec, endVec, t).normalize().multiplyScalar(1.008);
      points.push(point);
    }

    return new THREE.BufferGeometry().setFromPoints(points);
  }

  /**
   * Initialize the 3D scene
   */
  function init(containerId) {
    container = document.getElementById(containerId);
    if (!container) {
      console.error('Container not found:', containerId);
      return;
    }

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
    camera.position.set(0, 0, 3);

    // Renderer with better settings
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.style.touchAction = 'none';
    container.appendChild(renderer.domElement);

    // Orbit controls - check if available
    if (typeof THREE.OrbitControls !== 'undefined') {
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.rotateSpeed = 0.5;
      controls.minDistance = 1.3;
      controls.maxDistance = 6;
      controls.enablePan = false;
      controls.autoRotate = autoRotate;
      controls.autoRotateSpeed = 0.3;
      // Enable touch
      controls.touches = {
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_ROTATE
      };
    } else {
      console.warn('OrbitControls not available, manual rotation disabled');
    }

    // Create globe with Earth texture
    createGlobe();

    // Create Mecca marker
    createMeccaMarker();

    // Generate and create row segments
    rowSegments = generateRowSegments(rowInterval);
    createRowMeshes();

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    // Directional light (sun)
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

    // Create a basic material first (fallback)
    const fallbackMaterial = new THREE.MeshPhongMaterial({
      color: 0x2d5a87,
      shininess: 5
    });

    globe = new THREE.Mesh(geometry, fallbackMaterial);
    scene.add(globe);

    // Load Earth texture
    textureLoader.load(
      EARTH_TEXTURE_URL,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        globe.material = new THREE.MeshPhongMaterial({
          map: texture,
          shininess: 10,
          specular: new THREE.Color(0x333333)
        });

        // Try to load bump map for extra detail
        textureLoader.load(
          EARTH_BUMP_URL,
          (bumpTexture) => {
            globe.material.bumpMap = bumpTexture;
            globe.material.bumpScale = 0.02;
            globe.material.needsUpdate = true;
          },
          undefined,
          () => {} // Silently fail on bump map
        );
      },
      undefined,
      (error) => {
        console.warn('Could not load Earth texture, using fallback:', error);
        // Keep the fallback material
      }
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
          gl_FragColor = vec4(0.3, 0.6, 1.0, 1.0) * intensity * 0.8;
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
    // Golden sphere at Kaaba
    const markerGeometry = new THREE.SphereGeometry(0.025, 16, 16);
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xffd700 });
    meccaMarker = new THREE.Mesh(markerGeometry, markerMaterial);

    const pos = latLngToVector3(MECCA.lat, MECCA.lng, 1.025);
    meccaMarker.position.copy(pos);
    scene.add(meccaMarker);

    // Glow effect
    const glowGeometry = new THREE.SphereGeometry(0.05, 16, 16);
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
   * Create row meshes from segments
   */
  function createRowMeshes() {
    // Remove existing meshes
    rowMeshes.forEach(mesh => scene.remove(mesh));
    rowMeshes = [];

    const defaultMaterial = new THREE.LineBasicMaterial({
      color: 0x4a5568,
      transparent: true,
      opacity: 0.25
    });

    rowSegments.forEach((segment, index) => {
      const geometry = createArcGeometry(segment.start, segment.end, 8);
      const line = new THREE.Line(geometry, defaultMaterial.clone());
      line.userData = { segmentIndex: index };
      scene.add(line);
      rowMeshes.push(line);
    });
  }

  /**
   * Update row colors based on current prayer times
   */
  function updateRowColors() {
    // Reset prayer counts
    Object.keys(prayerCounts).forEach(p => prayerCounts[p] = 0);

    rowSegments.forEach((segment, index) => {
      const mesh = rowMeshes[index];
      if (!mesh) return;

      const prayer = getCurrentPrayer(segment.mid.lat, segment.mid.lng, currentTime);

      if (prayer && (selectedPrayer === 'all' || selectedPrayer === prayer)) {
        const prayerInfo = PRAYERS[prayer];
        mesh.material.color.setHex(prayerInfo.hex);
        mesh.material.opacity = 0.85;
        prayerCounts[prayer]++;
      } else {
        mesh.material.color.setHex(0x4a5568);
        mesh.material.opacity = 0.15;
      }
    });

    // Dispatch event for UI update
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('prayerCountsUpdated', {
        detail: { counts: prayerCounts, time: currentTime }
      }));
    }
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

    // Update controls
    if (controls) {
      controls.update();
    }

    // Update row colors every few frames for performance
    if (Math.floor(timestamp / 100) !== Math.floor((timestamp - 16) / 100)) {
      updateRowColors();
    }

    // Pulse Mecca glow
    if (meccaGlow) {
      meccaGlow.scale.setScalar(1 + 0.15 * Math.sin(timestamp / 400));
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

  /**
   * Set simulation time
   */
  function setTime(date) {
    currentTime = new Date(date);
    updateRowColors();
  }

  /**
   * Toggle play/pause
   */
  function togglePlay() {
    isPlaying = !isPlaying;
    return isPlaying;
  }

  /**
   * Set simulation speed
   */
  function setSpeed(newSpeed) {
    speed = newSpeed;
  }

  /**
   * Set row interval and regenerate
   */
  function setRowInterval(intervalKm) {
    rowInterval = intervalKm;
    rowSegments = generateRowSegments(rowInterval);
    createRowMeshes();
    updateRowColors();
  }

  /**
   * Set selected prayer filter
   */
  function setSelectedPrayer(prayer) {
    selectedPrayer = prayer;
    updateRowColors();
  }

  /**
   * Toggle auto-rotation
   */
  function toggleAutoRotate() {
    autoRotate = !autoRotate;
    if (controls) {
      controls.autoRotate = autoRotate;
    }
    return autoRotate;
  }

  /**
   * Get current state
   */
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

  /**
   * Clean up resources
   */
  function dispose() {
    if (animationId) {
      cancelAnimationFrame(animationId);
    }

    if (renderer) {
      renderer.dispose();
      container.removeChild(renderer.domElement);
    }

    window.removeEventListener('resize', onWindowResize);

    scene = null;
    camera = null;
    renderer = null;
    controls = null;
  }

  // Public API
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

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PrayerGlobe;
}
