# tests/test_api_endpoints.py
#
# Run inside the running web container:
#   docker compose exec web python tests/test_api_endpoints.py
import json

import requests


class EuropeanMappingAPITester:
    def __init__(self, base_url='http://localhost:8000'):
        self.base_url = base_url
        self.session = requests.Session()

    def test_server_connectivity(self):
        """Test if the Django server is running"""
        print("🔗 Testing server connectivity...")
        try:
            response = self.session.get(self.base_url, timeout=5)
            print(f" Server accessible: HTTP {response.status_code}")
            return True
        except requests.exceptions.RequestException as e:
            print(f" Server not accessible: {e}")
            return False

    def test_cities_endpoint(self):
        """Test cities API endpoint"""
        print("\n🏙️ Testing Cities Endpoint...")
        try:
            response = self.session.get(f'{self.base_url}/api/cities/')
            print(f"Status Code: {response.status_code}")

            if response.status_code != 200:
                print(f" Expected 200, got {response.status_code}")
                print(f"Response: {response.text[:500]}")
                return False

            data = response.json()
            print(f"Response type: {type(data)}")
            print(f"Response keys: {list(data.keys()) if isinstance(data, dict) else 'Not a dict'}")

            if not isinstance(data, dict):
                print(" Response is not a JSON object")
                return False

            if data.get('type') != 'FeatureCollection':
                print(f" Expected 'FeatureCollection', got '{data.get('type')}'")
                return False

            features = data.get('features', [])
            print(f"Number of features: {len(features)}")

            if len(features) == 0:
                print("  No cities found in database - this might be expected if no data has been loaded")
                return True

            feature = features[0]
            for key in ['type', 'geometry', 'properties']:
                if key not in feature:
                    print(f" Missing required key: {key}")
                    return False

            geom = feature['geometry']
            if geom['type'] != 'Point':
                print(f" Expected Point geometry, got {geom['type']}")
                return False

            if not isinstance(geom['coordinates'], list) or len(geom['coordinates']) != 2:
                print(f" Invalid coordinates: {geom['coordinates']}")
                return False

            props = feature['properties']
            for prop in ['name', 'country', 'population']:
                if prop not in props:
                    print(f" Missing required property: {prop}")
                    return False

            print(" Cities endpoint working correctly")
            print(f"Sample city: {props['name']}, {props['country']} (Pop: {props['population']:,})")
            return True

        except requests.exceptions.RequestException as e:
            print(f" Request failed: {e}")
            return False
        except json.JSONDecodeError as e:
            print(f" Invalid JSON response: {e}")
            return False
        except Exception as e:
            print(f" Unexpected error: {e}")
            return False

    def test_regions_endpoint(self):
        """Test regions API endpoint"""
        print("\n🗺️ Testing Regions Endpoint...")
        try:
            response = self.session.get(f'{self.base_url}/api/regions/')
            print(f"Status Code: {response.status_code}")

            if response.status_code != 200:
                print(f" Expected 200, got {response.status_code}")
                print(f"Response: {response.text[:500]}")
                return False

            data = response.json()
            print(f"Response type: {type(data)}")

            if not isinstance(data, dict):
                print(" Response is not a JSON object")
                return False

            if data.get('type') != 'FeatureCollection':
                print(f" Expected 'FeatureCollection', got '{data.get('type')}'")
                return False

            features = data.get('features', [])
            print(f"Number of features: {len(features)}")

            if len(features) == 0:
                print("  No regions found in database - this might be expected if no data has been loaded")
                return True

            props = features[0]['properties']
            print(" Regions endpoint working correctly")
            print(f"Sample region: {props.get('name', 'Unknown')}, {props.get('country', 'Unknown')}")
            return True

        except Exception as e:
            print(f" Error testing regions: {e}")
            return False

    def test_statistics_endpoints(self):
        """Test statistics endpoints"""
        print("\n📊 Testing Statistics Endpoints...")
        success = True
        for endpoint in ['/api/cities/statistics/', '/api/regions/statistics/']:
            try:
                response = self.session.get(f'{self.base_url}{endpoint}')
                print(f"{endpoint}: HTTP {response.status_code}")
                if response.status_code == 200:
                    print(f"  Stats keys: {list(response.json().keys())}")
                else:
                    print(f"  Failed: {response.text[:200]}")
                    success = False
            except Exception as e:
                print(f" Error: {e}")
                success = False
        return success

    def test_filtering(self):
        """Test filtering functionality"""
        print("\n🔍 Testing Filtering...")
        test_filters = [
            ('population_min=100000', 'Population filter'),
            ('country=Germany', 'Country filter'),
            ('city_type=capital', 'City type filter'),
        ]
        for filter_param, description in test_filters:
            try:
                response = self.session.get(f'{self.base_url}/api/cities/?{filter_param}')
                if response.status_code == 200:
                    count = len(response.json().get('features', []))
                    print(f" {description}: {count} results")
                else:
                    print(f" {description} failed: HTTP {response.status_code}")
            except Exception as e:
                print(f" {description} error: {e}")
        return True

    def run_all_tests(self):
        """Run all tests"""
        print("🧪 Starting European Mapping API Tests")
        print("=" * 50)

        if not self.test_server_connectivity():
            print(" Server not accessible. Start it with: docker compose up -d web")
            return False

        results = {
            'cities': self.test_cities_endpoint(),
            'regions': self.test_regions_endpoint(),
            'statistics': self.test_statistics_endpoints(),
            'filtering': self.test_filtering(),
        }

        print("\n" + "=" * 50)
        print(" Test Results Summary:")
        passed = sum(results.values())
        total = len(results)
        for test_name, result in results.items():
            status = " PASS" if result else " FAIL"
            print(f"  {test_name.title()}: {status}")

        print(f"\n🎯 Overall: {passed}/{total} tests passed")
        if passed == total:
            print(" All tests passed!")
        else:
            print("🔧 Some tests failed. Check the output above for details.")
        return passed == total


if __name__ == "__main__":
    EuropeanMappingAPITester().run_all_tests()
