/**
 * Tests for the loading indicator and overlapping searches in spatial-analysis.js.
 * Uses only Node's built-in modules, with a tiny fake DOM and fetch.
 *
 * Run from the project root:  node advanced_js_mapping/tests_js/loading.test.js
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE = fs.readFileSync(
    path.join(__dirname, '..', 'static', 'advanced_js_mapping', 'js', 'spatial-analysis.js'), 'utf8');

const BOX = [[-7, 53], [-5, 53], [-5, 54], [-7, 54], [-7, 53]];

/** Load spatial-analysis.js into a fresh sandbox with fake UI and fetch. */
function setup() {
    const log = [];
    const pending = [];   // fetch calls waiting to be resolved by the test

    const ui = {
        loadingVisible: false,
        showLoading() { this.loadingVisible = true; log.push('showLoading'); },
        hideLoading() { this.loadingVisible = false; log.push('hideLoading'); },
        displayResults(data) { log.push(`display:${data.cities.map(c => c.name).join(',')}`); },
        showSuccess() {},
        showError(message) { log.push(`error:${message}`); },
        clearResults() { log.push('clearResults'); },
    };

    function fakeFetch(url, options) {
        return new Promise((resolve, reject) => {
            const call = { body: JSON.parse(options.body), resolve, reject };
            options.signal.addEventListener('abort', () => {
                const err = new Error('aborted');
                err.name = 'AbortError';
                reject(err);
            });
            pending.push(call);
        });
    }

    const respond = (call, cities, status = 200) => call.resolve({
        ok: status === 200,
        status,
        statusText: status === 200 ? 'OK' : 'Bad Request',
        json: async () => status === 200
            ? { status: 'success', cities, cities_found: cities.length, query_time_ms: 1 }
            : { status: 'error', message: 'Polygon is not valid' },
    });

    const window = { UIControls: ui };
    const sandbox = {
        window,
        document: { cookie: '', addEventListener() {}, dispatchEvent() {}, querySelector: () => null },
        fetch: fakeFetch,
        AbortController,
        CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
        performance: { now: () => 0 },
        console: { log() {}, error() {} },
    };
    vm.createContext(sandbox);
    vm.runInContext(SOURCE, sandbox);

    return { sa: window.SpatialAnalysis, ui, log, pending, respond };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

const tests = {
    async 'loading shows during a search and hides after success'() {
        const { sa, ui, pending, respond, log } = setup();
        const search = sa.searchByPolygon(BOX, 'rectangle');
        assert.equal(ui.loadingVisible, true);
        assert.equal(pending[0].body.analysis_type, 'rectangle');

        respond(pending[0], [{ name: 'Dublin', population: 592000 }]);
        await search;
        assert.equal(ui.loadingVisible, false);
        assert.ok(log.includes('display:Dublin'));
    },

    async 'a newer search cancels the older one; only the newer result is shown'() {
        const { sa, ui, pending, respond, log } = setup();
        const first = sa.searchByPolygon(BOX);
        const second = sa.searchByPolygon(BOX);

        await first;  // aborted by the second search
        assert.equal(ui.loadingVisible, true, 'loading must stay visible while the second search runs');

        respond(pending[1], [{ name: 'Belfast' }]);
        await second;
        assert.equal(ui.loadingVisible, false);
        assert.deepEqual(log.filter(l => l.startsWith('display:')), ['display:Belfast']);
        assert.ok(!log.some(l => l.startsWith('error:')), 'an aborted search is not an error');
    },

    async 'cancelCurrentRequest (Clear) aborts the search and hides loading'() {
        const { sa, ui, log } = setup();
        const search = sa.searchByPolygon(BOX);
        sa.cancelCurrentRequest();
        await search;
        assert.equal(ui.loadingVisible, false);
        assert.equal(sa.currentRequest, null);
        assert.ok(!log.some(l => l.startsWith('display:')));
    },

    async 'server errors show the server message and hide loading'() {
        const { sa, ui, pending, respond, log } = setup();
        const search = sa.searchByPolygon(BOX);
        respond(pending[0], [], 400);
        await search;
        assert.equal(ui.loadingVisible, false);
        assert.ok(log.includes('error:Polygon is not valid'));
    },

    async 'invalid coordinates are rejected before any request'() {
        const { sa, pending, log } = setup();
        await sa.searchByPolygon([[0, 0], [1, 1]]);
        await sa.searchByPolygon([[0, 0], ['x', 1], [1, 0]]);
        await flush();
        assert.equal(pending.length, 0);
        assert.equal(log.filter(l => l.startsWith('error:')).length, 2);
    },

    async 'zero population is kept, missing values become null'() {
        const { sa } = setup();
        const [city] = sa.processCityData([{ name: 'Z', population: 0, gdp_per_capita: null, latitude: '0', longitude: 'x' }]);
        assert.equal(city.population, 0);
        assert.equal(city.gdp_per_capita, null);
        assert.equal(city.latitude, 0);
        assert.equal(city.longitude, null);
    },
};

(async () => {
    let failed = 0;
    for (const [name, test] of Object.entries(tests)) {
        try {
            await test();
            console.log(`ok - ${name}`);
        } catch (error) {
            failed += 1;
            console.log(`FAIL - ${name}\n  ${error.message}`);
        }
    }
    console.log(`\n${Object.keys(tests).length - failed}/${Object.keys(tests).length} tests passed`);
    process.exitCode = failed ? 1 : 0;
})();
