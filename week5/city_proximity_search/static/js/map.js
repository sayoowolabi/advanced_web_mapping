// Initialize map centered on Dublin
const map = L.map('map').setView([53.3498, -6.2603], 6);

// Add OpenStreetMap tile layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
    minZoom: 2
}).addTo(map);

// Store cities data and markers
let citiesData = [];
let markers = {};
let cityCount = 0;

// API endpoint
const API_URL = '/api/';

// Initialize the map
async function initMap() {
    showLoading(true);
    try {
        // Fetch cities from API
        const response = await fetch(API_URL);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        citiesData = data.results || data;
        cityCount = citiesData.length;

        // Update city count
        document.getElementById('cityCount').textContent = cityCount;

        // Add markers to map
        addMarkersToMap(citiesData);

    } catch (error) {
        console.error('Error fetching cities:', error);
        alert('Failed to load cities data. Make sure the API is running.');
    } finally {
        showLoading(false);
    }
}

// Add markers for each city
function addMarkersToMap(cities) {
    // Clear existing markers
    Object.values(markers).forEach(marker => map.removeLayer(marker));
    markers = {};

    cities.forEach(city => {
        const lat = parseFloat(city.latitude);
        const lng = parseFloat(city.longitude);

        if (isNaN(lat) || isNaN(lng)) {
            console.warn(`Invalid coordinates for ${city.name}`);
            return;
        }

        // Create marker
        const marker = L.circleMarker([lat, lng], {
            radius: 6,
            fillColor: '#007bff',
            color: '#0056b3',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
        }).addTo(map);

        // Add popup with city information
        const popupContent = createPopupContent(city);
        marker.bindPopup(popupContent);
        marker.on('click', () => {
            if (proximityMode) runProximitySearch(city);
        });

        // Store reference
        markers[city.id] = marker;
    });
}

// Create HTML content for popup
function createPopupContent(city) {
    return `
        <div class="city-popup">
            <h3>${city.name}</h3>
            <p><strong>Country:</strong> ${city.country}</p>
            ${city.region ? `<p><strong>Region:</strong> ${city.region}</p>` : ''}
            <p><strong>Population:</strong> ${formatNumber(city.population)}</p>
            <p><strong>Coordinates:</strong> ${city.latitude.toFixed(4)}, ${city.longitude.toFixed(4)}</p>
            ${city.founded_year ? `<p><strong>Founded:</strong> ${city.founded_year}</p>` : ''}
            ${city.timezone ? `<p><strong>Timezone:</strong> ${city.timezone}</p>` : ''}
        </div>
    `;
}

// Format numbers with thousands separator
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Search functionality
document.getElementById('searchInput').addEventListener('input', function(e) {
    const query = e.target.value.toLowerCase();
    const resultsDiv = document.getElementById('results');

    if (query.length === 0) {
        resultsDiv.innerHTML = '';
        addMarkersToMap(citiesData);
        clearProximityResults(map);
        return;
    }

    // Filter cities
    const filtered = citiesData.filter(city => 
        city.name.toLowerCase().includes(query) ||
        city.country.toLowerCase().includes(query)
    );

    // Display results
    if (filtered.length === 0) {
        resultsDiv.innerHTML = '<p style="color: #999;">No cities found</p>';
        // Clear markers
        Object.values(markers).forEach(marker => map.removeLayer(marker));
        markers = {};
    } else {
        // Show matching markers only
        Object.values(markers).forEach(marker => map.removeLayer(marker));
        markers = {};
        addMarkersToMap(filtered);

        // Update results list
        resultsDiv.innerHTML = filtered.map(city => `
            <div style="padding: 8px; border-bottom: 1px solid #eee; cursor: pointer;" onclick="goToCity(${city.id})">
                <strong>${city.name}</strong>, ${city.country}
            </div>
        `).join('');
    }
});

// Navigate to city on map
function goToCity(cityId) {
    const city = citiesData.find(c => c.id === cityId);
    if (city) {
        map.setView([city.latitude, city.longitude], 10);
        if (markers[cityId]) {
            markers[cityId].openPopup();
        }
    }
}

// Reset map view
document.getElementById('resetBtn').addEventListener('click', function() {
    map.setView([53.3498, -6.2603], 6);
    document.getElementById('searchInput').value = '';
    document.getElementById('results').innerHTML = '';
    proximityMode = null;
    document.getElementById('radius-control').classList.add('d-none');
    document.getElementById('nearest-search-btn').classList.remove('active');
    document.getElementById('radius-search-btn').classList.remove('active');
    document.getElementById('nearest-search-btn').setAttribute('aria-pressed', 'false');
    document.getElementById('radius-search-btn').setAttribute('aria-pressed', 'false');
    document.getElementById('proximity-status').textContent =
        'Choose a search, then click a city marker.';
    map.getContainer().style.cursor = '';
    clearProximityResults(map);
    addMarkersToMap(citiesData);
});

// Show/hide loading indicator
function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
}

// Initialize map on page load
document.addEventListener('DOMContentLoaded', function() {
    setupProximitySearch(map);
    initMap();
});

let proximityMode = null;
let searchMarker = null;
let radiusCircle = null;
let proximityLayer;
let radiusLayer;
let heatLayer = null;

function setupProximitySearch(map) {
    proximityLayer = L.layerGroup().addTo(map);
    radiusLayer = L.layerGroup().addTo(map);

    document.getElementById('nearest-search-btn').addEventListener('click', () => {
        setProximityMode(map, 'nearest');
    });
    document.getElementById('radius-search-btn').addEventListener('click', () => {
        setProximityMode(map, 'radius');
    });
}

function setProximityMode(map, mode) {
    proximityMode = proximityMode === mode ? null : mode;
    const status = document.getElementById('proximity-status');
    const nearestButton = document.getElementById('nearest-search-btn');
    const radiusButton = document.getElementById('radius-search-btn');
    document.getElementById('radius-control').classList.toggle(
        'd-none', proximityMode !== 'radius'
    );
    map.getContainer().style.cursor = proximityMode ? 'crosshair' : '';
    nearestButton.classList.toggle('active', proximityMode === 'nearest');
    radiusButton.classList.toggle('active', proximityMode === 'radius');
    nearestButton.setAttribute('aria-pressed', proximityMode === 'nearest');
    radiusButton.setAttribute('aria-pressed', proximityMode === 'radius');
    clearProximityResults(map);
    status.textContent = proximityMode
        ? `${proximityMode === 'nearest' ? 'Nearest' : 'Radius'} mode armed. Click an existing city marker.`
        : 'Choose a search, then click a city marker.';
}

async function runProximitySearch(city) {
    if (!proximityMode) return;
    // These coordinates come from the selected city's existing API record.
    const lat = Number(city.latitude);
    const lng = Number(city.longitude);
    const radiusKm = Number(document.getElementById('radius-input').value);
    const isRadiusSearch = proximityMode === 'radius';
    const status = document.getElementById('proximity-status');
    const results = document.getElementById('proximity-results');
    const searchButtons = [
        document.getElementById('nearest-search-btn'),
        document.getElementById('radius-search-btn')
    ];

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        status.textContent = `${city.name} has invalid coordinates in the API response.`;
        return;
    }
    if (isRadiusSearch && (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 20000)) {
        status.textContent = 'Enter a radius greater than 0 and no more than 20000 km.';
        return;
    }

    status.textContent = 'Searching…';
    status.setAttribute('aria-busy', 'true');
    searchButtons.forEach(button => { button.disabled = true; });
    clearProximityResults(map);
    results.textContent = 'Loading proximity results…';
    try {
        const response = await fetch(
            isRadiusSearch ? '/api/cities/radius/' : '/api/cities/nearest/',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(isRadiusSearch
                    ? { lat, lng, radius_km: radiusKm }
                    : { lat, lng })
            }
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `Search failed (${response.status})`);

        searchMarker = L.marker([lat, lng]).addTo(map);
        const cities = isRadiusSearch ? data.cities : data.nearest_cities;
        if (!Array.isArray(cities)) {
            throw new Error('The server returned an invalid proximity result.');
        }
        const heading = isRadiusSearch
            ? `${data.total_found} cities within ${data.radius_km} km of ${city.name}`
            : `${cities.length} nearest cities to ${city.name}`;
        showProximityResults(cities, heading);
        updateHeatmapForResults(cities, isRadiusSearch ? 'radius' : 'nearest');

        if (isRadiusSearch) {
            radiusCircle = L.circle([lat, lng], {
                radius: radiusKm * 1000,
                color: '#198754',
                fillOpacity: 0.08
            }).addTo(map);
            cities.forEach((city) => L.circleMarker([
                city.coordinates.lat, city.coordinates.lng
            ]).addTo(radiusLayer));
            map.setView([lat, lng], Math.max(map.getZoom(), 6), { animate: false });
            map.fitBounds(radiusCircle.getBounds(), {
                padding: [30, 30],
                animate: false
            });
            map.setView([lat, lng], map.getZoom(), { animate: false });
        } else {
            cities.forEach((city, index) => {
                L.marker(
                    [city.coordinates.lat, city.coordinates.lng],
                    { icon: numberedMarkerIcon(index + 1) }
                ).addTo(proximityLayer);
            });
            map.setView([lat, lng], Math.max(map.getZoom(), 6), { animate: false });
        }
        status.textContent = 'Search complete.';
    } catch (error) {
        const message = error instanceof Error
            ? error.message
            : 'The proximity search could not be completed.';
        status.textContent = message;
        results.textContent = `Error: ${message}`;
    } finally {
        status.removeAttribute('aria-busy');
        searchButtons.forEach(button => { button.disabled = false; });
    }
}

function numberedMarkerIcon(number) {
    return L.divIcon({
        className: 'nearest-city-marker',
        html: `<span>${number}</span>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
    });
}

function showProximityResults(cities, heading) {
    const results = document.getElementById('proximity-results');
    results.replaceChildren();
    const title = document.createElement('strong');
    title.textContent = heading;
    results.append(title);
    const list = document.createElement('ol');
    cities.forEach((city, index) => {
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = `${city.name}, ${city.country} — ${city.distance_km} km`;
        button.addEventListener('click', () => {
            const lat = Number(city.coordinates.lat);
            const lng = Number(city.coordinates.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
            map.setView([lat, lng], Math.max(map.getZoom(), 8), { animate: false });
            const layers = proximityMode === 'nearest'
                ? proximityLayer.getLayers()
                : radiusLayer.getLayers();
            layers[index]?.openPopup();
        });
        item.append(button);
        list.append(item);
    });
    results.append(list);
}

function updateHeatmapForResults(cities, mode) {
    const heatData = cities
        .map(city => [
            Number(city.coordinates.lat),
            Number(city.coordinates.lng),
            1
        ])
        .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
    replaceHeatmap(heatData, mode);
}

function replaceHeatmap(heatData, mode) {
    if (heatLayer) map.removeLayer(heatLayer);
    const gradients = {
        default: { 0.2: '#0000ff', 0.5: '#00ffff', 0.75: '#ffff00', 1: '#ff0000' },
        nearest: { 0.2: '#00ffff', 0.5: '#00ff00', 0.75: '#ffff00', 1: '#ff7f00' },
        radius: { 0.2: '#00ff00', 0.5: '#ffff00', 0.75: '#ff7f00', 1: '#ff0000' }
    };
    heatLayer = L.heatLayer(heatData, {
        radius: 25,
        blur: 15,
        maxZoom: 10,
        minOpacity: 0.2,
        gradient: gradients[mode]
    }).addTo(map);
}

function clearProximityResults(map) {
    if (searchMarker) map.removeLayer(searchMarker);
    if (radiusCircle) map.removeLayer(radiusCircle);
    searchMarker = radiusCircle = null;
    proximityLayer?.clearLayers();
    radiusLayer?.clearLayers();
    document.getElementById('proximity-results').replaceChildren();
    const allCityHeat = citiesData
        .map(city => [Number(city.latitude), Number(city.longitude), 0.8])
        .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
    replaceHeatmap(allCityHeat, 'default');
}