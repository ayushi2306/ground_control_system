// Pre-Flight Planner (front-end only)
// Click map to set Launch/Target, generate multiple candidate paths, then select one.

let map;
let clickMode = "launch"; // "launch" | "target" | "waypoint"

let launchMarker = null;
let targetMarker = null;

// Each candidate path is:
// { points: [{lat, lon}], color, meta: { distanceKm, timeSec, windSpeed, windHeading, driftMeters } }
let candidatePaths = [];
let pathLayers = [];

let selectedIndex = -1;

// Waypoint route state (custom ordered path)
let routeWaypoints = []; // [{lat, lon}]
let waypointMarkers = []; // Leaflet markers with number icons
let routePolyline = null; // Leaflet polyline

const DEFAULT_CENTER = { lat: 28.6139, lon: 77.2090, zoom: 12 };

function el(id) {
  return document.getElementById(id);
}

function setMode(mode) {
  clickMode = mode;
  el("modeLabel").textContent =
    mode === "launch" ? "Set Launch" :
    mode === "target" ? "Set Target" :
    "Add Waypoints";

  const setLaunchBtn = el("setLaunchBtn");
  const setTargetBtn = el("setTargetBtn");
  const setWaypointsBtn = el("setWaypointsBtn");

  setLaunchBtn.classList.toggle("active", mode === "launch");
  setTargetBtn.classList.toggle("active", mode === "target");
  setWaypointsBtn.classList.toggle("active", mode === "waypoint");

  // Toggle which UI list is visible.
  el("pathsListWrap").style.display = mode === "waypoint" ? "none" : "block";
  el("waypointsListWrap").style.display = mode === "waypoint" ? "block" : "none";

  // When switching into waypoint mode, clear candidate path visuals to reduce confusion.
  if (mode === "waypoint") {
    clearPaths();
  }

  updateDetailsForCurrentMode();
}

function readNumber(id) {
  const v = Number(el(id).value);
  return Number.isFinite(v) ? v : 0;
}

function setInputIfFinite(inputId, value) {
  if (!Number.isFinite(value)) return;
  el(inputId).value = value.toFixed(6);
}

function clampAngleDeg(deg) {
  // Normalize to [0, 360)
  let x = deg % 360;
  if (x < 0) x += 360;
  return x;
}

function toRad(deg) {
  return deg * Math.PI / 180;
}

function toDeg(rad) {
  return rad * 180 / Math.PI;
}

function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function bearingDegrees(lat1, lon1, lat2, lon2) {
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  const brng = toDeg(Math.atan2(y, x));
  return clampAngleDeg(brng);
}

function destinationPoint(lat, lon, bearingDeg, distanceMeters) {
  // Great-circle destination given bearing + distance.
  const R = 6371000;
  const brng = toRad(bearingDeg);
  const angDist = distanceMeters / R;

  const lat1 = toRad(lat);
  const lon1 = toRad(lon);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angDist) +
    Math.cos(lat1) * Math.sin(angDist) * Math.cos(brng)
  );

  const lon2 = lon1 + Math.atan2(
    Math.sin(brng) * Math.sin(angDist) * Math.cos(lat1),
    Math.cos(angDist) - Math.sin(lat1) * Math.sin(lat2)
  );

  return { lat: toDeg(lat2), lon: toDeg(lon2) };
}

function generateCandidatePaths() {
  const launchLat = readNumber("launchLat");
  const launchLon = readNumber("launchLon");
  const targetLat = readNumber("targetLat");
  const targetLon = readNumber("targetLon");

  if (!Number.isFinite(launchLat) || !Number.isFinite(launchLon) ||
      !Number.isFinite(targetLat) || !Number.isFinite(targetLon)) {
    alert("Please enter valid Launch/Target coordinates.");
    return;
  }

  const windSpeedMin = readNumber("windSpeedMin");
  const windSpeedMax = readNumber("windSpeedMax");
  const windHeadingMin = readNumber("windHeadingMin");
  const windHeadingMax = readNumber("windHeadingMax");
  const horizontalSpeed = Math.max(0.1, readNumber("horizontalSpeed")); // m/s
  const numPaths = Math.max(1, Math.floor(readNumber("numPaths")));

  // Base time estimate from straight-line distance + constant horizontal speed.
  const baseDistance = haversineDistanceMeters(launchLat, launchLon, targetLat, targetLon);
  const timeSec = baseDistance / horizontalSpeed;

  const speedList = [];
  const headingList = [];

  // Evenly sample wind speed + heading across the provided ranges.
  for (let i = 0; i < numPaths; i++) {
    const t = numPaths === 1 ? 0 : i / (numPaths - 1);
    speedList.push(windSpeedMin + (windSpeedMax - windSpeedMin) * t);
    headingList.push(windHeadingMin + (windHeadingMax - windHeadingMin) * t);
  }

  const newCandidatePaths = [];
  const colors = ["#00e5ff", "#7c4dff", "#ff5252", "#00e676", "#ffb300", "#1de9b6", "#ff6d00", "#3f51b5"];

  for (let i = 0; i < numPaths; i++) {
    const windSpeed = speedList[i];
    const windHeading = clampAngleDeg(headingList[i]);

    // Drift approximation: wind speed * time of flight.
    const driftMeters = windSpeed * timeSec;

    // Shift the target along wind direction by drift, then draw a great-circle track.
    const driftedTarget = destinationPoint(targetLat, targetLon, windHeading, driftMeters);

    const segBearing = bearingDegrees(launchLat, launchLon, driftedTarget.lat, driftedTarget.lon);
    const segDist = haversineDistanceMeters(launchLat, launchLon, driftedTarget.lat, driftedTarget.lon);

    const points = [];
    const samples = 50;
    for (let s = 0; s <= samples; s++) {
      const frac = s / samples;
      const p = destinationPoint(launchLat, launchLon, segBearing, segDist * frac);
      points.push({ lat: p.lat, lon: p.lon });
    }

    newCandidatePaths.push({
      points,
      color: colors[i % colors.length],
      meta: {
        distanceKm: segDist / 1000,
        timeSec,
        windSpeed,
        windHeading,
        driftMeters
      }
    });
  }

  return newCandidatePaths;
}

function clearPaths() {
  for (const layer of pathLayers) {
    try { map.removeLayer(layer); } catch (e) { /* ignore */ }
  }
  pathLayers = [];
  candidatePaths = [];
  selectedIndex = -1;
  el("pathsList").innerHTML = "";
  el("details").textContent = "Select a path to see details.";
}

function clearWaypointRoute() {
  if (routePolyline) {
    try { map.removeLayer(routePolyline); } catch (e) { /* ignore */ }
  }
  routePolyline = null;

  for (const m of waypointMarkers) {
    try { map.removeLayer(m); } catch (e) { /* ignore */ }
  }
  waypointMarkers = [];

  routeWaypoints = [];

  el("waypointsList").innerHTML = "";
  if (clickMode === "waypoint") {
    el("details").textContent = "Add at least 2 waypoints to build a route.";
  }
}

function formatSeconds(sec) {
  if (!Number.isFinite(sec)) return "-";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s`;
}

function renderWaypointList() {
  const list = el("waypointsList");
  list.innerHTML = "";

  for (let i = 0; i < routeWaypoints.length; i++) {
    const w = routeWaypoints[i];

    const row = document.createElement("div");
    row.className = "waypointItem";

    const left = document.createElement("div");
    left.textContent = `#${i + 1}: ${w.lat.toFixed(6)}, ${w.lon.toFixed(6)}`;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "smallBtn";
    btn.textContent = "Remove";
    btn.addEventListener("click", () => {
      // Remove this waypoint and keep order for remaining points.
      routeWaypoints.splice(i, 1);
      // Rebuild markers to keep numbering correct.
      rebuildWaypointUIFromState();
      updateDetailsForCurrentMode();
    });

    row.appendChild(left);
    row.appendChild(btn);
    list.appendChild(row);
  }
}

function rebuildWaypointUIFromState() {
  // Clear visuals and re-render based on routeWaypoints.
  // Clear should not wipe routeWaypoints (we already mutated it).
  if (routePolyline) {
    try { map.removeLayer(routePolyline); } catch (e) { /* ignore */ }
  }
  routePolyline = null;

  for (const m of waypointMarkers) {
    try { map.removeLayer(m); } catch (e) { /* ignore */ }
  }
  waypointMarkers = [];

  for (let i = 0; i < routeWaypoints.length; i++) {
    addWaypointMarker(i, routeWaypoints[i].lat, routeWaypoints[i].lon);
  }

  updateWaypointPolyline();
  renderWaypointList();
}

function addWaypointMarker(index, lat, lon) {
  const iconHtml = `<div class="waypointNumber">${index + 1}</div>`;
  const icon = L.divIcon({
    className: "waypointNumberIcon",
    html: iconHtml,
    iconSize: [26, 26],
    iconAnchor: [13, 13]
  });

  const marker = L.marker([lat, lon], { icon }).addTo(map);
  waypointMarkers.push(marker);
}

function updateWaypointPolyline() {
  const latlngs = routeWaypoints.map(w => [w.lat, w.lon]);

  if (latlngs.length < 2) {
    if (routePolyline) {
      try { map.removeLayer(routePolyline); } catch (e) { /* ignore */ }
    }
    routePolyline = null;
    return;
  }

  if (!routePolyline) {
    routePolyline = L.polyline(latlngs, {
      color: "#00e5ff",
      weight: 4,
      opacity: 0.9
    }).addTo(map);
  } else {
    routePolyline.setLatLngs(latlngs);
  }
}

function computeRouteMeta() {
  const horizontalSpeed = Math.max(0.1, readNumber("horizontalSpeed")); // m/s
  let totalMeters = 0;
  for (let i = 0; i < routeWaypoints.length - 1; i++) {
    const a = routeWaypoints[i];
    const b = routeWaypoints[i + 1];
    totalMeters += haversineDistanceMeters(a.lat, a.lon, b.lat, b.lon);
  }

  const timeSec = totalMeters / horizontalSpeed;

  const segments = [];
  for (let i = 0; i < routeWaypoints.length - 1; i++) {
    const a = routeWaypoints[i];
    const b = routeWaypoints[i + 1];
    segments.push({
      fromIndex: i + 1,
      toIndex: i + 2,
      distanceKm: haversineDistanceMeters(a.lat, a.lon, b.lat, b.lon) / 1000,
      bearingDeg: bearingDegrees(a.lat, a.lon, b.lat, b.lon)
    });
  }

  return {
    totalDistanceKm: totalMeters / 1000,
    totalMeters,
    timeSec,
    segments
  };
}

function updateDetailsForCurrentMode() {
  if (clickMode === "waypoint") {
    if (routeWaypoints.length < 2) {
      el("details").textContent = "Add at least 2 waypoints to build a route.";
      return;
    }

    const meta = computeRouteMeta();

    const wpLines = routeWaypoints.map((w, i) =>
      `#${i + 1}: ${w.lat.toFixed(6)}, ${w.lon.toFixed(6)}`
    ).join("\n");

    const segLines = meta.segments.map(s =>
      `Seg #${s.fromIndex}→#${s.toIndex}: ${s.distanceKm.toFixed(2)} km, bearing ${s.bearingDeg.toFixed(0)}°`
    ).join("\n");

    el("details").textContent =
      `Waypoint Route\n` +
      `Waypoints: ${routeWaypoints.length}\n` +
      `Total distance: ${meta.totalDistanceKm.toFixed(2)} km\n` +
      `Estimated time (using horizontal speed): ${formatSeconds(meta.timeSec)}\n\n` +
      `Segments:\n${segLines}\n\n` +
      `Waypoints (ordered):\n${wpLines}\n\n` +
      `Route JSON (use for your satellite guidance program):\n` +
      `${JSON.stringify({ routeWaypoints: routeWaypoints.map(w => ({ lat: w.lat, lon: w.lon })) }, null, 2)}`;

    return;
  }

  // Keep candidate-path UI behavior as-is when not in waypoint mode.
  if (selectedIndex >= 0 && candidatePaths[selectedIndex]) {
    showSelectedPath(selectedIndex);
  }
}

function showSelectedPath(index) {
  selectedIndex = index;

  // Update layer styles.
  for (let i = 0; i < pathLayers.length; i++) {
    const layer = pathLayers[i];
    const meta = candidatePaths[i]?.meta;
    const isSelected = i === index;
    if (meta && layer && layer.setStyle) {
      layer.setStyle({
        color: candidatePaths[i].color,
        weight: isSelected ? 6 : 3,
        opacity: isSelected ? 1 : 0.55
      });
    }
  }

  // Update list selection UI.
  const pathButtons = el("pathsList").querySelectorAll(".pathBtn");
  pathButtons.forEach((btn, i) => {
    btn.classList.toggle("selected", i === index);
  });

  const p = candidatePaths[index];
  if (!p) return;

  const meta = p.meta;
  const launchLat = readNumber("launchLat");
  const launchLon = readNumber("launchLon");
  const targetLat = readNumber("targetLat");
  const targetLon = readNumber("targetLon");

  el("details").textContent =
    `Path ${index + 1}\n` +
    `Wind speed: ${meta.windSpeed.toFixed(1)} m/s\n` +
    `Wind heading: ${meta.windHeading.toFixed(0)} deg from North\n` +
    `Drift: ${meta.driftMeters.toFixed(0)} m\n` +
    `Estimated time: ${formatSeconds(meta.timeSec)}\n` +
    `Track distance: ${meta.distanceKm.toFixed(2)} km\n\n` +
    `Launch: ${launchLat.toFixed(6)}, ${launchLon.toFixed(6)}\n` +
    `Target: ${targetLat.toFixed(6)}, ${targetLon.toFixed(6)}\n` +
    `Track: computed great-circle samples (for UI visualization).`;
}

function generateUIForCandidatePaths(paths) {
  clearPaths();
  candidatePaths = paths;

  if (!candidatePaths.length) return;

  // Draw all polylines first.
  for (let i = 0; i < candidatePaths.length; i++) {
    const p = candidatePaths[i];
    const poly = L.polyline(p.points.map(pt => [pt.lat, pt.lon]), {
      color: p.color,
      weight: 3,
      opacity: 0.55
    }).addTo(map);

    // Save to allow re-styling later.
    pathLayers.push(poly);

    // Select path when user clicks the track itself.
    poly.on("click", () => showSelectedPath(i));
  }

  // Build clickable list.
  const list = el("pathsList");
  for (let i = 0; i < candidatePaths.length; i++) {
    const p = candidatePaths[i];
    const meta = p.meta;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pathBtn";
    btn.textContent = `Path ${i + 1}`;

    const div = document.createElement("div");
    div.className = "pathMeta";
    div.textContent =
      `Wind: ${meta.windSpeed.toFixed(1)} m/s @ ${meta.windHeading.toFixed(0)}° | ` +
      `Drift: ${meta.driftMeters.toFixed(0)} m | Time: ${formatSeconds(meta.timeSec)}`;
    btn.appendChild(div);

    btn.addEventListener("click", () => showSelectedPath(i));
    list.appendChild(btn);
  }

  showSelectedPath(0);
}

function getMarkerOrNull(marker) {
  if (!marker) return null;
  return marker;
}

function updateMarkersFromInputs() {
  const launchLat = readNumber("launchLat");
  const launchLon = readNumber("launchLon");
  const targetLat = readNumber("targetLat");
  const targetLon = readNumber("targetLon");

  const launchOk = Number.isFinite(launchLat) && Number.isFinite(launchLon);
  const targetOk = Number.isFinite(targetLat) && Number.isFinite(targetLon);

  if (launchOk) {
    if (!launchMarker) {
      launchMarker = L.marker([launchLat, launchLon]).addTo(map);
    } else {
      launchMarker.setLatLng([launchLat, launchLon]);
    }
  }

  if (targetOk) {
    if (!targetMarker) {
      targetMarker = L.marker([targetLat, targetLon]).addTo(map);
    } else {
      targetMarker.setLatLng([targetLat, targetLon]);
    }
  }
}

function addWaypoint(lat, lon) {
  routeWaypoints.push({ lat, lon });
  addWaypointMarker(routeWaypoints.length - 1, lat, lon);
  updateWaypointPolyline();
  renderWaypointList();
  updateDetailsForCurrentMode();
}

function init() {
  map = L.map("map").setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lon], DEFAULT_CENTER.zoom);

  // OpenStreetMap tiles
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  // Click to set points (depending on mode).
  map.on("click", (e) => {
    const { lat, lng } = e.latlng;
    if (clickMode === "launch") {
      setInputIfFinite("launchLat", lat);
      setInputIfFinite("launchLon", lng);
      updateMarkersFromInputs();
    } else if (clickMode === "target") {
      setInputIfFinite("targetLat", lat);
      setInputIfFinite("targetLon", lng);
      updateMarkersFromInputs();
    } else {
      addWaypoint(lat, lng);
    }
  });

  setMode("launch");

  el("setLaunchBtn").addEventListener("click", () => setMode("launch"));
  el("setTargetBtn").addEventListener("click", () => setMode("target"));
  el("setWaypointsBtn").addEventListener("click", () => setMode("waypoint"));

  el("generateBtn").addEventListener("click", () => {
    if (clickMode === "waypoint") {
      updateDetailsForCurrentMode();
      return;
    }

    if (el("launchLat").value === "" || el("launchLon").value === "" ||
        el("targetLat").value === "" || el("targetLon").value === "") {
      alert("Please set both Launch and Target coordinates (click the map or fill inputs).");
      return;
    }

    const paths = generateCandidatePaths();
    if (!paths) return;
    generateUIForCandidatePaths(paths);
  });

  el("clearBtn").addEventListener("click", () => {
    clearPaths();
    clearWaypointRoute();

    // Also remove markers.
    if (launchMarker) {
      try { map.removeLayer(launchMarker); } catch (e) { /* ignore */ }
      launchMarker = null;
    }
    if (targetMarker) {
      try { map.removeLayer(targetMarker); } catch (e) { /* ignore */ }
      targetMarker = null;
    }

    el("launchLat").value = "";
    el("launchLon").value = "";
    el("targetLat").value = "";
    el("targetLon").value = "";
  });

  // Try to prefill with your fake-data demo coordinates if inputs are empty.
  setInputIfFinite("launchLat", DEFAULT_CENTER.lat);
  setInputIfFinite("launchLon", DEFAULT_CENTER.lon);
  setInputIfFinite("targetLat", DEFAULT_CENTER.lat + 0.01);
  setInputIfFinite("targetLon", DEFAULT_CENTER.lon + 0.01);

  updateMarkersFromInputs();
  updateDetailsForCurrentMode();
}

window.addEventListener("DOMContentLoaded", init);

