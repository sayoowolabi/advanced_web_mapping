"""Tests for the advanced_js_mapping app.

Run in the container (Django creates a temporary PostGIS test database):
    docker compose run --rm web python manage.py test advanced_js_mapping --noinput
"""
import json

from django.contrib.gis.geos import Point
from django.test import TestCase
from django.urls import reverse

from .models import AdvancedCity, PolygonAnalysis, SearchSession

# Box around Dublin from the lab handout ([lng, lat], closed ring)
DUBLIN_BOX = [[-7, 53], [-5, 53], [-5, 54], [-7, 54], [-7, 53]]


class PolygonSearchTests(TestCase):
    url = reverse('advanced_js_mapping:polygon_search')

    @classmethod
    def setUpTestData(cls):
        def city(name, country, lat, lng, pop, **extra):
            return AdvancedCity.objects.create(
                name=name, country=country, location=Point(lng, lat, srid=4326), population=pop, **extra
            )

        cls.dublin = city("Dublin", "Ireland", 53.3498, -6.2603, 592000, gdp_per_capita=100000)
        cls.belfast = city("Belfast", "United Kingdom", 54.5973, -5.9301, 345000)
        cls.cork = city("Cork", "Ireland", 51.8985, -8.4756, 224000, gdp_per_capita=50000)
        cls.inactive = city("Drogheda", "Ireland", 53.7179, -6.3561, 41000, is_active=False)
        # Exactly on the box's western edge (lng -7): must be excluded by ST_Within
        cls.edge = city("Edge Town", "Ireland", 53.5, -7.0, 1000)

    def post(self, payload):
        return self.client.post(self.url, data=json.dumps(payload), content_type='application/json')

    def test_finds_city_inside_polygon(self):
        response = self.post({'coordinates': DUBLIN_BOX})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['status'], 'success')
        self.assertEqual([c['name'] for c in data['cities']], ['Dublin'])
        self.assertEqual(data['cities_found'], 1)
        self.assertEqual(data['total_population'], 592000)
        self.assertEqual(data['average_gdp'], 100000)
        self.assertEqual(data['geojson']['type'], 'FeatureCollection')
        self.assertEqual(data['geojson']['features'][0]['geometry']['coordinates'], [-6.2603, 53.3498])

    def test_excludes_inactive_and_boundary_cities(self):
        names = [c['name'] for c in self.post({'coordinates': DUBLIN_BOX}).json()['cities']]
        self.assertNotIn('Drogheda', names)    # inactive
        self.assertNotIn('Edge Town', names)   # on the boundary

    def test_unclosed_ring_is_closed_automatically(self):
        response = self.post({'coordinates': DUBLIN_BOX[:-1]})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['cities_found'], 1)

    def test_results_ordered_by_population(self):
        ireland = [[-11, 51], [-5, 51], [-5, 55.5], [-11, 55.5]]
        names = [c['name'] for c in self.post({'coordinates': ireland}).json()['cities']]
        # Edge Town (lng -7) is on the Dublin box's edge but well inside this larger box
        self.assertEqual(names, ['Dublin', 'Belfast', 'Cork', 'Edge Town'])

    def test_area_uses_equal_area_projection(self):
        # 1° x 1° cell at 53-54°N is about 7,400 km² (Web Mercator would give ~20,000)
        area = self.post({'coordinates': [[-7, 53], [-6, 53], [-6, 54], [-7, 54]]}).json()['polygon_area_km2']
        self.assertAlmostEqual(area, 7400, delta=150)

    def test_search_is_recorded_for_analytics(self):
        self.post({'coordinates': DUBLIN_BOX, 'analysis_type': 'rectangle'})
        analysis = PolygonAnalysis.objects.get()
        self.assertEqual(analysis.cities_count, 1)
        self.assertEqual(analysis.cities_found, [self.dublin.id])
        self.assertEqual(analysis.analysis_type, 'rectangle')
        self.assertEqual(analysis.bounding_box, {'west': -7, 'south': 53, 'east': -5, 'north': 54})
        session = SearchSession.objects.get()
        self.assertEqual(session.total_analyses, 1)
        self.assertEqual(session.unique_countries, 1)

    def test_get_is_not_allowed(self):
        self.assertEqual(self.client.get(self.url).status_code, 405)

    def test_invalid_input_returns_400(self):
        cases = {
            'too few points': {'coordinates': [[0, 0], [1, 1]]},
            'not a pair': {'coordinates': [[0, 0, 0], [1, 1], [1, 0]]},
            'strings': {'coordinates': [["a", "b"], [1, 1], [1, 0]]},
            'out of range': {'coordinates': [[200, 0], [1, 1], [1, 0]]},
            'self-intersecting': {'coordinates': [[0, 0], [1, 1], [1, 0], [0, 1]]},
            'missing key': {},
            'not an object': [1, 2, 3],
        }
        for label, payload in cases.items():
            with self.subTest(label):
                response = self.post(payload)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json()['status'], 'error')
        self.assertEqual(PolygonAnalysis.objects.count(), 0)

    def test_malformed_json_returns_400(self):
        response = self.client.post(self.url, data='{not json', content_type='application/json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error_code'], 'INVALID_JSON')


class OtherEndpointTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        for i, (name, lat, lng, pop) in enumerate([
            ("Dublin", 53.3498, -6.2603, 592000),
            ("Cork", 51.8985, -8.4756, 224000),
            ("London", 51.5074, -0.1278, 9000000),
        ]):
            AdvancedCity.objects.create(name=name, country="X", location=Point(lng, lat, srid=4326), population=pop)

    def test_cities_api_paginates(self):
        data = self.client.get(reverse('advanced_js_mapping:cities_api'), {'limit': 2}).json()
        self.assertEqual(data['count'], 2)
        self.assertEqual(data['total_count'], 3)
        self.assertEqual(data['total_pages'], 2)
        self.assertTrue(data['has_next'])
        self.assertEqual([c['name'] for c in data['cities']], ['Cork', 'Dublin'])  # sorted by name

    def test_cities_api_bad_page_returns_400(self):
        response = self.client.get(reverse('advanced_js_mapping:cities_api'), {'page': 'abc'})
        self.assertEqual(response.status_code, 400)

    def test_distance_search_returns_true_distances(self):
        response = self.client.post(
            reverse('advanced_js_mapping:distance_search'),
            data=json.dumps({'latitude': 53.3498, 'longitude': -6.2603, 'radius_km': 250}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)
        cities = response.json()['cities']
        self.assertEqual([c['name'] for c in cities], ['Dublin', 'Cork'])
        self.assertEqual(cities[0]['distance_km'], 0)
        self.assertAlmostEqual(cities[1]['distance_km'], 219, delta=3)  # Dublin-Cork ≈ 219 km

    def test_distance_search_validates_input(self):
        url = reverse('advanced_js_mapping:distance_search')
        self.assertEqual(self.client.get(url).status_code, 405)
        for payload in ({'latitude': 53}, {'latitude': 'x', 'longitude': 1},
                        {'latitude': 53, 'longitude': -6, 'radius_km': 5000}):
            response = self.client.post(url, data=json.dumps(payload), content_type='application/json')
            self.assertEqual(response.status_code, 400)

    def test_model_distance_helper(self):
        dublin = AdvancedCity.objects.get(name="Dublin")
        self.assertAlmostEqual(dublin.distance_to_point(-0.1278, 51.5074), 464, delta=5)  # Dublin-London

    def test_pages_render(self):
        for name in ('index', 'map', 'analytics'):
            with self.subTest(name):
                response = self.client.get(reverse(f'advanced_js_mapping:{name}'))
                self.assertEqual(response.status_code, 200)
        map_page = self.client.get(reverse('advanced_js_mapping:map'))
        self.assertContains(map_page, 'id="initial-cities"')
        self.assertContains(map_page, 'London')  # only cities with population >= 1M are preloaded
        self.assertNotContains(map_page, 'Cork')
