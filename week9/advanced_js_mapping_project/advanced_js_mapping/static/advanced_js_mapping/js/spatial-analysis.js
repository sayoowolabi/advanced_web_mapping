/**
 * Advanced JavaScript Mapping - Spatial Analysis Module
 * Handles API communication for polygon-based spatial queries
 */

(function(global) {
    'use strict';

    const SpatialAnalysis = {
        currentRequest: null,   // AbortController of the search in progress
        apiEndpoint: '/advanced-js-mapping/api/polygon-search/',

        init() {
            try {
                this.setupEventHandlers();
            } catch (error) {
                console.error('Spatial analysis initialization failed:', error);
            }
        },

        /**
         * The map module announces finished drawings with a custom DOM event,
         * so the two modules don't need to call each other directly
         */
        setupEventHandlers() {
            document.addEventListener('drawingCompleted', (e) => {
                if (e.detail && e.detail.coordinates) {
                    this.searchByPolygon(e.detail.coordinates, e.detail.analysisType);
                }
            });
        },

        /**
         * POST the polygon to Django and show the results.
         * A newer search aborts the older one, so results never arrive out of order.
         */
        async searchByPolygon(coordinates, analysisType = 'polygon') {
            if (!this.validateCoordinates(coordinates)) {
                this.cancelCurrentRequest();
                this.handleError('Invalid coordinates provided for search.');
                return;
            }

            global.UIControls?.showLoading?.('Searching for cities...');

            if (this.currentRequest) {
                this.currentRequest.abort();
            }
            const request = new AbortController();
            this.currentRequest = request;

            try {
                const startTime = performance.now();

                const response = await fetch(this.apiEndpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': this.getCSRFToken()
                    },
                    body: JSON.stringify({ coordinates, analysis_type: analysisType }),
                    signal: request.signal
                });

                const clientTime = Math.round(performance.now() - startTime);
                const data = await response.json().catch(() => null);

                // A newer search has started; ignore this answer
                if (this.currentRequest !== request) {
                    return;
                }

                if (!response.ok) {
                    // Show the server's own message (e.g. "Polygon is not valid")
                    throw new Error(data?.message || `HTTP ${response.status}: ${response.statusText}`);
                }

                if (!this.validateResponse(data)) {
                    throw new Error('Invalid response data received from server');
                }

                data.client_time_ms = clientTime;
                this.handleSuccess(data);

            } catch (error) {
                if (error.name === 'AbortError' || this.currentRequest !== request) {
                    console.log('Request was cancelled');
                } else {
                    console.error('Search failed:', error);
                    this.handleError(error.message || 'Search request failed');
                }
            } finally {
                // Only the newest request controls the loading indicator
                if (this.currentRequest === request) {
                    global.UIControls?.hideLoading?.();
                    this.currentRequest = null;
                }
            }
        },

        /**
         * Client-side check before sending: at least 3 numeric [lng, lat] pairs in range
         */
        validateCoordinates(coordinates) {
            if (!Array.isArray(coordinates) || coordinates.length < 3) {
                return false;
            }

            return coordinates.every(coord =>
                Array.isArray(coord) && coord.length === 2 &&
                typeof coord[0] === 'number' && typeof coord[1] === 'number' &&
                Number.isFinite(coord[0]) && Number.isFinite(coord[1]) &&
                coord[0] >= -180 && coord[0] <= 180 &&
                coord[1] >= -90 && coord[1] <= 90
            );
        },

        validateResponse(data) {
            return Boolean(data) && typeof data === 'object' &&
                data.status === 'success' && Array.isArray(data.cities);
        },

        handleSuccess(data) {
            const processedData = { ...data, cities: this.processCityData(data.cities) };

            global.UIControls?.displayResults?.(processedData);
            global.AdvancedMapping?.displayResults?.(processedData);
            global.UIControls?.showSuccess?.(
                `Found ${data.cities_found} cities in ${Number(data.query_time_ms).toFixed(1)} ms`
            );

            document.dispatchEvent(new CustomEvent('searchCompleted', { detail: processedData }));
        },

        /**
         * Normalise numeric fields. Zero is kept as a valid value;
         * only missing or unparseable values become null.
         */
        processCityData(cities) {
            const toNumber = value => {
                if (value === null || value === undefined || value === '') return null;
                const n = Number(value);
                return Number.isFinite(n) ? n : null;
            };

            return cities.map(city => ({
                ...city,
                population: toNumber(city.population),
                gdp_per_capita: toNumber(city.gdp_per_capita),
                latitude: toNumber(city.latitude),
                longitude: toNumber(city.longitude),
                name: city.name || 'Unknown',
                country: city.country || 'Unknown',
            }));
        },

        handleError(message) {
            global.UIControls?.showError?.(message);
            global.UIControls?.clearResults?.();
            document.dispatchEvent(new CustomEvent('searchError', { detail: { message } }));
        },

        /**
         * Django CSRF token from the csrftoken cookie (or a meta tag)
         */
        getCSRFToken() {
            if (global.CSRF_TOKEN) {
                return global.CSRF_TOKEN;
            }

            const match = document.cookie.split(';')
                .map(c => c.trim())
                .find(c => c.startsWith('csrftoken='));
            if (match) {
                return decodeURIComponent(match.substring('csrftoken='.length));
            }

            return document.querySelector('meta[name=csrf-token]')?.getAttribute('content') || '';
        },

        /**
         * Abort the search in progress (used by Clear and by delete)
         */
        cancelCurrentRequest() {
            if (this.currentRequest) {
                this.currentRequest.abort();
                this.currentRequest = null;
                global.UIControls?.hideLoading?.();
            }
        }
    };

    global.SpatialAnalysis = SpatialAnalysis;

})(window);
