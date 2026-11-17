// Real-time weather map
// The browser only talks to our Django API (/api/...). Django adds the
// XWeather credentials server-side, so they never appear in this file
// or in any browser request.

document.addEventListener('DOMContentLoaded', function () {
    if (typeof L === 'undefined') {
        console.error('Leaflet library not loaded');
        alert('Error: Leaflet mapping library not loaded. Please check your internet connection.');
        return;
    }

    const CITIES_URL = '/api/cities/';
    const weatherUrl = (cityId) => `/api/weather/${cityId}/`;
    const forecastUrl = (cityId) => `/api/forecast/${cityId}/`;
    const ICON_BASE = 'https://cdn.aerisapi.com/wxblox/icons/';

    // ---- Map ----------------------------------------------------------------
    const map = L.map('map').setView([30, 10], 2);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
    }).addTo(map);

    const markers = {};   // city id -> Leaflet marker
    const cities = [];    // loaded city records, used by search

    // Enhancement 4: the server always returns Celsius; conversion happens here
    let useFahrenheit = false;

    // The data shown in the open popup, so it can be redrawn when the unit changes
    let openPopupState = null;

    const cityIcon = L.divIcon({
        className: 'custom-div-icon',
        html: `<div style="
            background-color: #667eea;
            width: 30px;
            height: 30px;
            border-radius: 50%;
            border: 3px solid white;
            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
            cursor: pointer;
        "></div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });

    // ---- Helpers ------------------------------------------------------------

    // Text from external APIs is escaped before it is placed in popup HTML
    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (character) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[character]));
    }

    // Format a Celsius value in the currently selected unit: F = (C × 9/5) + 32
    function formatTemp(celsius) {
        if (celsius === null || celsius === undefined || isNaN(Number(celsius))) return 'n/a';
        const value = useFahrenheit ? (Number(celsius) * 9 / 5) + 32 : Number(celsius);
        return `${value.toFixed(1)}°${useFahrenheit ? 'F' : 'C'}`;
    }

    function formatNumber(value, unit) {
        if (value === null || value === undefined || isNaN(Number(value))) return 'n/a';
        return `${Number(value)}${unit}`;
    }

    function iconImg(icon, alt, size) {
        if (!icon) return '';
        return `<img src="${ICON_BASE}${encodeURIComponent(icon)}" alt="${escapeHtml(alt)}"`
            + (size ? ` width="${size}" height="${size}"` : '') + '>';
    }

    function formatDay(isoDate) {
        const date = new Date(`${isoDate}T12:00:00`);
        if (isNaN(date)) return escapeHtml(isoDate);
        return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    }

    function showLoading() {
        document.getElementById('loading')?.classList.add('active');
    }

    function hideLoading() {
        document.getElementById('loading')?.classList.remove('active');
    }

    function showMapMessage(message) {
        L.popup()
            .setLatLng(map.getCenter())
            .setContent(`<div class="error-message">${escapeHtml(message)}</div>`)
            .openOn(map);
    }

    // Fetch JSON from our API; throws an Error carrying the server's safe message
    async function fetchJson(url) {
        const response = await fetch(url);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || `Request failed (HTTP ${response.status})`);
        }
        return data;
    }

    // ---- Cities -------------------------------------------------------------
    async function loadCities() {
        try {
            const data = await fetchJson(CITIES_URL);
            console.log(`Loaded ${data.length} cities`);

            if (data.length === 0) {
                showMapMessage('No cities found. Run: docker compose run --rm web python manage.py populate_cities');
                return;
            }

            data.forEach(addCityMarker);
            populateSearchList(data);
        } catch (error) {
            console.error('Error loading cities:', error);
            showMapMessage(`Failed to load cities: ${error.message}`);
        }
    }

    function addCityMarker(city) {
        const marker = L.marker([city.latitude, city.longitude], {
            icon: cityIcon,
            title: `${city.name}, ${city.country}`
        }).addTo(map);

        marker.on('click', () => fetchWeatherData(city.id, marker));
        markers[city.id] = marker;
        cities.push(city);
    }

    // ---- Weather and forecast -----------------------------------------------
    async function fetchWeatherData(cityId, marker) {
        showLoading();

        try {
            // Current weather and forecast are requested in parallel
            const [weather, forecast] = await Promise.allSettled([
                fetchJson(weatherUrl(cityId)),
                fetchJson(forecastUrl(cityId)),
            ]);

            if (weather.status === 'rejected') throw weather.reason;

            openPopupState = {
                marker,
                weather: weather.value,
                forecast: forecast.status === 'fulfilled' ? forecast.value : null,
                forecastError: forecast.status === 'rejected' ? forecast.reason.message : null,
                activeTab: 'current',
            };
            renderWeatherPopup();
        } catch (error) {
            console.error('Error fetching weather:', error);
            openPopupState = null;
            displayErrorPopup(marker, error.message);
        } finally {
            // Runs on success and failure, so the overlay never gets stuck
            hideLoading();
        }
    }

    function currentPanelHtml(data) {
        const description = escapeHtml(data.description);
        return `
            <div class="weather-icon-container">
                ${iconImg(data.icon, data.description)}
                <div class="weather-description">${description}</div>
            </div>

            <div class="weather-info">
                <div class="weather-item"><div>
                    <strong>Temperature</strong>
                    <span>${formatTemp(data.temperature)}</span>
                </div></div>

                <div class="weather-item"><div>
                    <strong>Feels Like</strong>
                    <span>${formatTemp(data.feels_like)}</span>
                </div></div>

                <div class="weather-item"><div>
                    <strong>Humidity</strong>
                    <span>${formatNumber(data.humidity, '%')}</span>
                </div></div>

                <div class="weather-item"><div>
                    <strong>Wind Speed</strong>
                    <span>${formatNumber(data.wind_speed, ' m/s')}</span>
                </div></div>

                <div class="weather-item"><div>
                    <strong>Pressure</strong>
                    <span>${formatNumber(data.pressure, ' hPa')}</span>
                </div></div>
            </div>`;
    }

    function forecastPanelHtml(forecast, error) {
        if (error) {
            return `<div class="error-message">Forecast unavailable: ${escapeHtml(error)}</div>`;
        }
        if (!forecast || !forecast.days || forecast.days.length === 0) {
            return '<p class="muted">No forecast available.</p>';
        }
        const rows = forecast.days.map((day) => `
            <li class="forecast-day">
                <span class="forecast-date">${formatDay(day.date)}</span>
                ${iconImg(day.icon, day.description, 36)}
                <span>
                    <span class="forecast-temps">${formatTemp(day.max_temp)} / ${formatTemp(day.min_temp)}</span><br>
                    <span class="forecast-desc">${escapeHtml(day.description)}</span>
                </span>
            </li>`).join('');
        return `<ul class="forecast-list">${rows}</ul>`;
    }

    // Draw (or redraw) the popup from openPopupState
    function renderWeatherPopup() {
        const state = openPopupState;
        if (!state) return;
        const { weather, forecast, forecastError, activeTab, marker } = state;

        const popupContent = `
            <div class="weather-popup">
                <h3>${escapeHtml(weather.city)}, ${escapeHtml(weather.country)}</h3>

                <div class="popup-tabs" role="tablist">
                    <button type="button" class="popup-tab ${activeTab === 'current' ? 'active' : ''}"
                            data-tab="current" role="tab">Current</button>
                    <button type="button" class="popup-tab ${activeTab === 'forecast' ? 'active' : ''}"
                            data-tab="forecast" role="tab">3-Day Forecast</button>
                </div>

                <div class="tab-panel" ${activeTab === 'current' ? '' : 'hidden'}>
                    ${currentPanelHtml(weather)}
                </div>
                <div class="tab-panel" ${activeTab === 'forecast' ? '' : 'hidden'}>
                    ${forecastPanelHtml(forecast, forecastError)}
                </div>
            </div>`;

        showPopup(marker, popupContent);
    }

    // Put content in the marker's popup. An already-bound popup is updated in
    // place: unbinding it would close it and fire 'popupclose', which clears
    // openPopupState (used by the tabs and the unit toggle).
    function showPopup(marker, html) {
        const popup = marker.getPopup();
        if (popup) {
            popup.setContent(html);
        } else {
            marker.bindPopup(html, { maxWidth: 320, className: 'weather-popup-container' });
        }
        if (!marker.isPopupOpen()) marker.openPopup();
    }

    function displayErrorPopup(marker, errorMessage = 'Unknown error') {
        const errorContent = `
            <div class="weather-popup">
                <h3>Error</h3>
                <div class="error-message">
                    Unable to fetch weather data: ${escapeHtml(errorMessage)}
                    <br><br>
                    Please try again later.
                </div>
            </div>`;
        showPopup(marker, errorContent);
    }

    // Tab clicks inside a popup (popups are created dynamically, so delegate)
    document.addEventListener('click', (event) => {
        const tab = event.target.closest('.popup-tab');
        if (!tab || !openPopupState) return;
        openPopupState.activeTab = tab.dataset.tab;
        renderWeatherPopup();
    });

    map.on('popupclose', (event) => {
        if (openPopupState && event.popup === openPopupState.marker.getPopup()) {
            openPopupState = null;
        }
    });

    // ---- Enhancement 3: search ----------------------------------------------
    function populateSearchList(cityList) {
        const datalist = document.getElementById('city-list');
        datalist.innerHTML = cityList
            .map((city) => `<option value="${escapeHtml(`${city.name}, ${city.country}`)}"></option>`)
            .join('');
    }

    function findCity(query) {
        const text = query.trim().toLowerCase();
        if (!text) return null;
        // Exact "Name, Country" or exact name first, then the first partial match
        return cities.find((c) => `${c.name}, ${c.country}`.toLowerCase() === text)
            || cities.find((c) => c.name.toLowerCase() === text)
            || cities.find((c) => c.name.toLowerCase().includes(text)
                || c.country.toLowerCase().includes(text));
    }

    document.getElementById('search-form').addEventListener('submit', (event) => {
        event.preventDefault();
        const input = document.getElementById('city-search');
        const message = document.getElementById('search-message');
        const city = findCity(input.value);

        if (!city) {
            message.textContent = input.value.trim()
                ? `No city matches "${input.value.trim()}".`
                : '';
            return;
        }

        message.textContent = '';
        map.setView([city.latitude, city.longitude], 6);
        fetchWeatherData(city.id, markers[city.id]);
    });

    // ---- Enhancement 4: unit toggle -----------------------------------------
    document.getElementById('unit-toggle').addEventListener('click', (event) => {
        useFahrenheit = !useFahrenheit;
        event.currentTarget.textContent = useFahrenheit ? 'Show °C' : 'Show °F';
        renderWeatherPopup();  // redraw the open popup, no new request needed
    });

    // ---- Start --------------------------------------------------------------
    loadCities();

    // Helper for debugging in the browser console
    window.debugMap = { map, markers, cities, loadCities };
});
