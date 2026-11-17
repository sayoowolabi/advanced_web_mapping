/**
 * Advanced JavaScript Mapping - UI Controls Module
 * Handles user interface interactions, results display, and user feedback
 */

(function(global) {
    'use strict';

    const escape = global.escapeHtml || (value => String(value ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c])));

    const UIControls = {
        elements: {
            resultsPanel: null,
            resultsCount: null,
            statsPanel: null,
            loadingStatus: null,
            loadingMessage: null
        },

        /**
         * Initialize UI controls
         */
        init() {
            try {
                this.cacheElements();
                this.setupEventHandlers();
                this.initializeComponents();
            } catch (error) {
                console.error('UI controls initialization failed:', error);
            }
        },

        /**
         * Look up DOM elements once
         */
        cacheElements() {
            this.elements.resultsPanel = document.getElementById('resultsPanel');
            this.elements.resultsCount = document.getElementById('resultsCount');
            this.elements.statsPanel = document.getElementById('statsPanel');
            this.elements.loadingStatus = document.getElementById('loadingStatus');
            this.elements.loadingMessage = document.getElementById('loadingMessage');
        },

        setupEventHandlers() {
            // Resize the map after the window stops resizing
            global.addEventListener('resize', this.debounce(() => this.handleResize(), 250));

            document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));

            // "Focus on map" and card clicks, delegated so they survive re-rendering
            if (this.elements.resultsPanel) {
                this.elements.resultsPanel.addEventListener('click', (e) => this.handleResultsClick(e));
            }
        },

        initializeComponents() {
            this.initializeTooltips();
            this.updateInitialState();
        },

        initializeTooltips() {
            if (typeof bootstrap === 'undefined') return;
            document.querySelectorAll('[data-bs-toggle="tooltip"]')
                .forEach(el => new bootstrap.Tooltip(el));
        },

        updateInitialState() {
            this.updateResultsCount(0);
            this.clearStatistics();
        },

        /**
         * Display search results in the panel
         */
        displayResults(results) {
            try {
                this.updateResultsCount(results.cities_found);
                this.updateStatistics(results);
                this.renderCitiesList(results.cities);

                if (this.elements.resultsPanel) {
                    this.elements.resultsPanel.scrollTop = 0;
                }
            } catch (error) {
                console.error('Error displaying results:', error);
                this.showError('Failed to display search results.');
            }
        },

        updateResultsCount(count) {
            if (this.elements.resultsCount) {
                this.elements.resultsCount.textContent = `${count} found`;
                this.elements.resultsCount.className = count > 0 ? 'badge bg-success ms-2' : 'badge bg-secondary ms-2';
            }
        },

        /**
         * Fill the statistics panel (textContent, so no HTML injection)
         */
        updateStatistics(results) {
            if (!this.elements.statsPanel) return;

            const values = {
                totalPopulation: results.total_population != null
                    ? Number(results.total_population).toLocaleString() : '-',
                avgGDP: results.average_gdp != null
                    ? `$${Math.round(Number(results.average_gdp)).toLocaleString()}` : '-',
                countriesCount: results.statistics?.countries_represented ?? '-',
                queryTime: results.query_time_ms != null
                    ? `${Number(results.query_time_ms).toFixed(1)} ms` : '-',
                polygonArea: results.polygon_area_km2 != null
                    ? `${Math.round(results.polygon_area_km2).toLocaleString()} km²` : '-',
            };

            Object.entries(values).forEach(([id, text]) => {
                const element = document.getElementById(id);
                if (element) element.textContent = text;
            });
        },

        clearStatistics() {
            ['totalPopulation', 'avgGDP', 'countriesCount', 'queryTime', 'polygonArea'].forEach(id => {
                const element = document.getElementById(id);
                if (element) element.textContent = '-';
            });
        },

        renderCitiesList(cities) {
            if (!this.elements.resultsPanel || !cities) return;

            if (cities.length === 0) {
                this.showEmptyResults();
                return;
            }

            this.elements.resultsPanel.innerHTML = `
                <div class="cities-list">
                    ${cities.map((city, index) => this.createCityCardHTML(city, index)).join('')}
                </div>
            `;
        },

        /**
         * HTML for one city card. All text from the API is escaped.
         */
        createCityCardHTML(city, index) {
            const population = city.population != null ? Number(city.population).toLocaleString() : 'Unknown';
            const gdp = city.gdp_per_capita != null ? `$${Number(city.gdp_per_capita).toLocaleString()}` : 'N/A';

            let sizeBadge = 'bg-secondary';
            let sizeText = 'Small';
            if (city.population > 5000000) {
                sizeBadge = 'bg-danger';
                sizeText = 'Megacity';
            } else if (city.population > 1000000) {
                sizeBadge = 'bg-warning';
                sizeText = 'Large';
            } else if (city.population > 500000) {
                sizeBadge = 'bg-info';
                sizeText = 'Medium';
            }

            const cityType = city.city_type
                ? city.city_type.charAt(0).toUpperCase() + city.city_type.slice(1) : '';

            return `
                <div class="card city-card" data-city-id="${escape(city.id)}" data-city-index="${index}">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <h6 class="card-title mb-0">
                                <i class="fas fa-city me-1 text-primary"></i>
                                ${escape(city.name)}
                            </h6>
                            <span class="badge ${sizeBadge}">${sizeText}</span>
                        </div>

                        <p class="text-muted mb-2">
                            <i class="fas fa-flag me-1"></i>
                            ${escape(city.country)}${city.region ? `, ${escape(city.region)}` : ''}
                        </p>

                        <div class="row g-2 text-sm">
                            <div class="col-6">
                                <div class="text-muted">Population</div>
                                <div class="fw-bold">${population}</div>
                            </div>
                            <div class="col-6">
                                <div class="text-muted">GDP/Capita</div>
                                <div class="fw-bold">${gdp}</div>
                            </div>
                        </div>

                        ${cityType ? `
                            <div class="mt-2">
                                <span class="badge bg-light text-dark">${escape(cityType)}</span>
                            </div>
                        ` : ''}

                        <div class="mt-2">
                            <button type="button" class="btn btn-sm btn-outline-primary focus-city-btn"
                                    data-lat="${escape(city.latitude)}" data-lng="${escape(city.longitude)}">
                                <i class="fas fa-crosshairs me-1"></i>
                                Focus on Map
                            </button>
                        </div>
                    </div>
                </div>
            `;
        },

        /**
         * One delegated click handler for all city cards
         */
        handleResultsClick(e) {
            const focusButton = e.target.closest('.focus-city-btn');
            if (focusButton) {
                const lat = parseFloat(focusButton.dataset.lat);
                const lng = parseFloat(focusButton.dataset.lng);
                if (global.AdvancedMapping?.map && !isNaN(lat) && !isNaN(lng)) {
                    global.AdvancedMapping.map.setView([lat, lng], 12, { animate: true, duration: 1.5 });
                }
                return;
            }

            const card = e.target.closest('.city-card');
            if (card) this.highlightCityCard(card);
        },

        highlightCityCard(selectedCard) {
            document.querySelectorAll('.city-card').forEach(card => {
                card.classList.remove('border-primary', 'bg-light');
            });
            selectedCard.classList.add('border-primary', 'bg-light');
            selectedCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        },

        showEmptyResults() {
            if (this.elements.resultsPanel) {
                this.elements.resultsPanel.innerHTML = `
                    <div class="text-center text-muted py-4">
                        <i class="fas fa-search fa-3x mb-3 opacity-50"></i>
                        <h5>No Cities Found</h5>
                        <p>No cities were found within the drawn area. Try:</p>
                        <ul class="list-unstyled">
                            <li>• Drawing a larger area</li>
                            <li>• Moving to a more populated region</li>
                            <li>• Checking different continents</li>
                        </ul>
                    </div>
                `;
            }
        },

        /**
         * Inline, non-blocking loading indicator
         */
        showLoading(message = 'Searching for cities...') {
            if (this.elements.loadingStatus) {
                if (this.elements.loadingMessage) {
                    this.elements.loadingMessage.textContent = message;
                }
                this.elements.loadingStatus.hidden = false;
            }
        },

        hideLoading() {
            if (this.elements.loadingStatus) {
                this.elements.loadingStatus.hidden = true;
            }
        },

        clearResults() {
            this.updateResultsCount(0);
            this.clearStatistics();

            if (this.elements.resultsPanel) {
                this.elements.resultsPanel.innerHTML = `
                    <div class="text-center text-muted">
                        <i class="fas fa-hand-pointer fa-3x mb-3 opacity-50"></i>
                        <h5>Draw on the Map</h5>
                        <p>Use the drawing tools to create a polygon and find cities within it.</p>
                    </div>
                `;
            }
        },

        /**
         * Temporary alert in the top-right corner
         */
        showToast(kind, iconClass, html, duration) {
            const alertEl = document.createElement('div');
            alertEl.className = `alert alert-${kind} alert-dismissible fade show position-fixed`;
            alertEl.style.cssText = 'top: 20px; right: 20px; z-index: 9999; max-width: 400px;';
            alertEl.setAttribute('role', kind === 'danger' ? 'alert' : 'status');
            alertEl.innerHTML = `
                <i class="fas ${iconClass} me-2"></i>
                ${html}
                <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
            `;
            document.body.appendChild(alertEl);
            setTimeout(() => alertEl.remove(), duration);
        },

        showError(message, duration = 5000) {
            this.showToast('danger', 'fa-exclamation-triangle',
                `<strong>Error:</strong> ${escape(message)}`, duration);
            console.error('UI Error:', message);
        },

        showSuccess(message, duration = 3000) {
            this.showToast('success', 'fa-check-circle', escape(message), duration);
        },

        handleResize() {
            if (global.AdvancedMapping?.map) {
                global.AdvancedMapping.map.invalidateSize();
            }
        },

        /**
         * Ctrl/Cmd + K clears the map; Escape hides the loading indicator and selection
         */
        handleKeyboardShortcuts(e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                global.AdvancedMapping?.clearAll?.();
            }

            if (e.key === 'Escape') {
                this.hideLoading();
                document.querySelectorAll('.city-card').forEach(card => {
                    card.classList.remove('border-primary', 'bg-light');
                });
            }
        },

        debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                clearTimeout(timeout);
                timeout = setTimeout(() => func(...args), wait);
            };
        }
    };

    global.UIControls = UIControls;

})(window);
