/**
 * Advanced JavaScript Mapping - Map Interface Module
 * Handles Leaflet map initialization, drawing tools, and core mapping functionality
 */

(function(global) {
    'use strict';

    // escapeHtml is defined in base.html; fall back to a local copy if missing
    const escape = global.escapeHtml || (value => String(value ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c])));

    const AdvancedMapping = {
        map: null,
        drawControl: null,
        drawnItems: null,
        markersLayer: null,
        currentResults: null,

        config: {
            initialView: [54.5, 15.0],
            initialZoom: 4,
            maxZoom: 18,
            minZoom: 2
        },

        /**
         * Initialize the mapping application
         */
        init() {
            console.log('Initializing map interface...');

            try {
                this.setupConfig();
                this.initializeMap();
                this.setupDrawingTools();
                this.setupEventHandlers();
                this.loadInitialData();

                console.log('Map interface initialized successfully');
            } catch (error) {
                console.error('Map initialization failed:', error);
                if (global.UIControls) {
                    global.UIControls.showError('Failed to initialize map. Check the browser console and CDN connection.');
                }
            }
        },

        /**
         * Merge configuration passed from the Django template
         */
        setupConfig() {
            if (global.MAP_CONFIG) {
                this.config = { ...this.config, ...global.MAP_CONFIG };
            }
        },

        /**
         * Initialize the Leaflet map
         */
        initializeMap() {
            this.map = L.map('map', {
                center: this.config.initialView,
                zoom: this.config.initialZoom,
                maxZoom: this.config.maxZoom,
                minZoom: this.config.minZoom,
                zoomControl: true,
                attributionControl: true
            });

            this.addTileLayers();

            // drawnItems holds the search area; markersLayer holds city markers
            this.drawnItems = new L.FeatureGroup();
            this.markersLayer = new L.FeatureGroup();

            this.map.addLayer(this.drawnItems);
            this.map.addLayer(this.markersLayer);

            L.control.scale({
                position: 'bottomleft',
                imperial: false
            }).addTo(this.map);
        },

        /**
         * Add the base map
         */
        addTileLayers() {
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors',
                maxZoom: 19
            }).addTo(this.map);
        },

        /**
         * Setup drawing tools and controls
         */
        setupDrawingTools() {
            if (typeof L.Control.Draw === 'undefined') {
                throw new Error('Leaflet.draw could not be loaded');
            }
            this.setupLeafletDraw();
        },

        /**
         * Setup Leaflet.draw controls: polygon and rectangle only
         */
        setupLeafletDraw() {
            const drawOptions = {
                draw: {
                    polygon: {
                        allowIntersection: false,
                        drawError: {
                            color: '#e1e100',
                            message: '<strong>Error:</strong> Shape edges cannot cross!'
                        },
                        shapeOptions: {
                            color: '#2563eb',
                            fillOpacity: 0.3,
                            weight: 3
                        }
                    },
                    rectangle: {
                        shapeOptions: {
                            color: '#16a34a',
                            fillOpacity: 0.3,
                            weight: 3
                        }
                    },
                    circle: false,       // the search works on polygon areas
                    marker: false,
                    polyline: false,
                    circlemarker: false
                },
                edit: {
                    featureGroup: this.drawnItems,
                    remove: true
                }
            };

            this.drawControl = new L.Control.Draw(drawOptions);
            this.map.addControl(this.drawControl);
        },

        setupEventHandlers() {
            // A new drawing replaces the previous area and searches immediately
            this.map.on(L.Draw.Event.CREATED, event => {
                this.drawnItems.clearLayers();
                event.layer.analysisType = event.layerType === 'rectangle' ? 'rectangle' : 'polygon';
                this.drawnItems.addLayer(event.layer);
                this.searchLayer(event.layer);
            });
            // Saving an edit searches again with the new shape
            this.map.on(L.Draw.Event.EDITED, event => {
                event.layers.eachLayer(layer => this.searchLayer(layer));
            });
            this.map.on(L.Draw.Event.DELETED, () => this.clearResults());
        },

        /**
         * Hand the drawn ring to SpatialAnalysis through a custom DOM event
         */
        searchLayer(layer) {
            // GeoJSON ring: [[lng, lat], ...] with the first point repeated at the end
            const coordinates = layer.toGeoJSON().geometry.coordinates[0];
            document.dispatchEvent(new CustomEvent('drawingCompleted', {
                detail: { coordinates, analysisType: layer.analysisType || 'polygon' }
            }));
        },

        /**
         * Show the major cities sent with the page
         */
        loadInitialData() {
            const features = global.INITIAL_CITIES?.features || [];
            features.forEach(feature => {
                const [longitude, latitude] = feature.geometry.coordinates;
                const city = { ...feature.properties, latitude, longitude };
                L.marker([latitude, longitude], { icon: this.createCityIcon(city) })
                    .bindPopup(this.createCityPopupContent(city))
                    .addTo(this.markersLayer);
            });
        },

        /**
         * Display search results on the map
         */
        displayResults(results) {
            this.markersLayer.clearLayers();
            this.currentResults = results;

            results.cities.forEach(city => {
                if (city.latitude != null && city.longitude != null) {
                    L.marker([city.latitude, city.longitude], { icon: this.createCityIcon(city) })
                        .bindPopup(this.createCityPopupContent(city))
                        .addTo(this.markersLayer);
                }
            });

            // Fit the view to the search area and its results
            if (results.cities.length > 0) {
                const group = L.featureGroup([this.markersLayer, this.drawnItems]);
                this.map.fitBounds(group.getBounds().pad(0.1));
            }
        },

        /**
         * Marker colour by population
         */
        createCityIcon(city) {
            let color = '#dc2626';              // red: small
            if (city.population > 1000000) {
                color = '#7c3aed';              // purple: over 1M
            } else if (city.population > 500000) {
                color = '#2563eb';              // blue: over 500K
            } else if (city.population > 100000) {
                color = '#16a34a';              // green: over 100K
            }

            return L.divIcon({
                className: 'city-marker',
                html: `<div style="
                    background-color: ${color};
                    width: 12px;
                    height: 12px;
                    border-radius: 50%;
                    border: 2px solid white;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                "></div>`,
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            });
        },

        /**
         * Popup content for a city marker (text is escaped)
         */
        createCityPopupContent(city) {
            const population = city.population != null ? Number(city.population).toLocaleString() : 'Unknown';
            const gdp = city.gdp_per_capita != null ? `$${Number(city.gdp_per_capita).toLocaleString()}` : 'N/A';

            return `
                <div class="city-popup">
                    <h6 class="mb-2">
                        <i class="fas fa-city me-1"></i>
                        ${escape(city.name)}
                    </h6>
                    <table class="table table-sm table-borderless mb-0">
                        <tr>
                            <td><i class="fas fa-flag me-1"></i> Country:</td>
                            <td><strong>${escape(city.country)}</strong></td>
                        </tr>
                        <tr>
                            <td><i class="fas fa-users me-1"></i> Population:</td>
                            <td><strong>${population}</strong></td>
                        </tr>
                        <tr>
                            <td><i class="fas fa-dollar-sign me-1"></i> GDP/Capita:</td>
                            <td><strong>${gdp}</strong></td>
                        </tr>
                    </table>
                </div>
            `;
        },

        /**
         * Clear all drawings and results
         */
        clearAll() {
            this.drawnItems.clearLayers();
            this.clearResults();
        },

        /**
         * Reset map to initial view
         */
        resetView() {
            this.map.setView(this.config.initialView, this.config.initialZoom, {
                animate: true,
                duration: 1.5
            });
        },

        /**
         * Clear search results (also cancels a search still in progress)
         */
        clearResults() {
            if (global.SpatialAnalysis) {
                global.SpatialAnalysis.cancelCurrentRequest();
            }
            this.markersLayer.clearLayers();
            this.currentResults = null;

            if (global.UIControls && global.UIControls.clearResults) {
                global.UIControls.clearResults();
            }
        },

        /**
         * Download the current results as CSV
         */
        exportResults() {
            if (!this.currentResults || this.currentResults.cities.length === 0) {
                alert('No results to export. Please search for cities first.');
                return;
            }

            const csvContent = this.createCSVExport(this.currentResults.cities);

            // BOM so Excel opens accented names (e.g. São Paulo) correctly
            const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `city_search_results_${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        },

        /**
         * Build CSV text. Every field is quoted and inner quotes are doubled,
         * so names containing commas or quotes stay in one column. Zero values
         * are kept (the handout's `value || ''` dropped them).
         */
        createCSVExport(cities) {
            const csvField = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
            const headers = ['Name', 'Country', 'Population', 'GDP per Capita', 'Latitude', 'Longitude'];
            const rows = cities.map(city => [
                city.name, city.country, city.population,
                city.gdp_per_capita, city.latitude, city.longitude
            ].map(csvField).join(','));

            return [headers.map(csvField).join(','), ...rows].join('\r\n');
        }
    };

    global.AdvancedMapping = AdvancedMapping;

})(window);
