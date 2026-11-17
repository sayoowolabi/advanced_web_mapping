"""Tests for the weather map API.

The tests never call the real XWeather API: requests.get is replaced with
a fake, so they run without credentials or network access.

Run inside the container:
    docker compose run --rm web python manage.py test weathermap
"""
from unittest.mock import MagicMock, patch

import requests
from django.core.cache import cache
from django.test import TestCase, override_settings

from .models import City

# Matches XWeather's JSON response structure (conditions endpoint)
SAMPLE_RESPONSE = {
    "success": True,
    "response": [{
        "periods": [{
            "tempC": 12.3,
            "feelslikeC": 11.0,
            "humidity": 80,
            "pressureMB": 1012,
            "windSpeedMPS": 4.1,
            "weather": "light rain",
            "icon": "rain.png"
        }]
    }]
}

# Matches XWeather's forecasts endpoint with filter=day
SAMPLE_FORECAST = {
    "success": True,
    "response": [{
        "periods": [
            {"dateTimeISO": "2026-11-18T07:00:00+00:00", "maxTempC": 10, "minTempC": 4,
             "weather": "Mostly Cloudy", "icon": "mcloudy.png", "pop": 20},
            {"dateTimeISO": "2026-11-19T07:00:00+00:00", "maxTempC": 9, "minTempC": 3,
             "weather": "Showers", "icon": "showers.png", "pop": 70},
            {"dateTimeISO": "2026-11-20T07:00:00+00:00", "maxTempC": 8, "minTempC": 2,
             "weather": "Sunny", "icon": "sunny.png", "pop": 0},
        ]
    }]
}

SECRET = "test-client-secret"


def fake_response(payload=None):
    response = MagicMock()
    response.json.return_value = payload
    response.raise_for_status.return_value = None
    return response


@override_settings(XWEATHER_CLIENT_ID="test-client-id", XWEATHER_CLIENT_SECRET=SECRET)
class WeatherApiTests(TestCase):
    def setUp(self):
        cache.clear()
        self.city = City.objects.create(
            name="Dublin", country="Ireland", latitude=53.3498, longitude=-6.2603
        )

    def test_map_page_renders(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'id="map"')

    def test_cities_json_lists_cities(self):
        response = self.client.get("/api/cities/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()[0]["name"], "Dublin")

    @patch("weathermap.views.requests.get")
    def test_weather_success(self, mock_get):
        mock_get.return_value = fake_response(SAMPLE_RESPONSE)
        response = self.client.get(f"/api/weather/{self.city.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["temperature"], 12.3)
        self.assertEqual(response.json()["description"], "light rain")
        self.assertEqual(mock_get.call_args.kwargs["params"]["units"], "metric")
        self.assertEqual(mock_get.call_args.kwargs["params"]["p"], "53.3498,-6.2603")

    def test_unknown_city_returns_404(self):
        response = self.client.get("/api/weather/999999/")
        self.assertEqual(response.status_code, 404)

    @override_settings(XWEATHER_CLIENT_ID=None, XWEATHER_CLIENT_SECRET=None)
    def test_missing_key_returns_503(self):
        response = self.client.get(f"/api/weather/{self.city.id}/")
        self.assertEqual(response.status_code, 503)

    @patch("weathermap.views.requests.get")
    def test_rejected_key_does_not_leak_secret(self, mock_get):
        rejected = MagicMock(status_code=401)
        failing = fake_response()
        failing.raise_for_status.side_effect = requests.exceptions.HTTPError(
            f"401 Client Error: Unauthorized for url: ...&client_id=test-client-id&client_secret={SECRET}",
            response=rejected,
        )
        mock_get.return_value = failing

        response = self.client.get(f"/api/weather/{self.city.id}/")
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()["error"], "XWeather rejected the API credentials")
        self.assertNotIn(SECRET, response.content.decode())

    @patch("weathermap.views.requests.get", side_effect=requests.exceptions.Timeout)
    def test_timeout_returns_502(self, mock_get):
        response = self.client.get(f"/api/weather/{self.city.id}/")
        self.assertEqual(response.status_code, 502)

    @patch("weathermap.views.requests.get")
    def test_unexpected_payload_returns_502(self, mock_get):
        mock_get.return_value = fake_response({"unexpected": "shape"})
        response = self.client.get(f"/api/weather/{self.city.id}/")
        self.assertEqual(response.status_code, 502)

    @patch("weathermap.views.requests.get")
    def test_success_false_payload_returns_502(self, mock_get):
        """XWeather can answer HTTP 200 with success=false and an empty response list."""
        mock_get.return_value = fake_response(
            {"success": False, "error": {"code": "warn_no_data"}, "response": []}
        )
        response = self.client.get(f"/api/weather/{self.city.id}/")
        self.assertEqual(response.status_code, 502)

    # ---- Enhancement 2: caching -------------------------------------------

    @patch("weathermap.views.requests.get")
    def test_weather_is_cached(self, mock_get):
        mock_get.return_value = fake_response(SAMPLE_RESPONSE)
        first = self.client.get(f"/api/weather/{self.city.id}/")
        second = self.client.get(f"/api/weather/{self.city.id}/")
        self.assertEqual(first.json(), second.json())
        self.assertEqual(mock_get.call_count, 1)  # second answer came from the cache

    @patch("weathermap.views.requests.get", side_effect=requests.exceptions.Timeout)
    def test_errors_are_not_cached(self, mock_get):
        self.client.get(f"/api/weather/{self.city.id}/")
        self.client.get(f"/api/weather/{self.city.id}/")
        self.assertEqual(mock_get.call_count, 2)

    # ---- Enhancement 1: forecast ------------------------------------------

    @patch("weathermap.views.requests.get")
    def test_forecast_success(self, mock_get):
        mock_get.return_value = fake_response(SAMPLE_FORECAST)
        response = self.client.get(f"/api/forecast/{self.city.id}/")
        self.assertEqual(response.status_code, 200)

        days = response.json()["days"]
        self.assertEqual(len(days), 3)
        self.assertEqual(days[0], {
            "date": "2026-11-18", "max_temp": 10, "min_temp": 4,
            "description": "Mostly Cloudy", "icon": "mcloudy.png", "precip_chance": 20,
        })
        params = mock_get.call_args.kwargs["params"]
        self.assertEqual(params["filter"], "day")
        self.assertEqual(params["limit"], 3)

    def test_forecast_unknown_city_returns_404(self):
        response = self.client.get("/api/forecast/999999/")
        self.assertEqual(response.status_code, 404)

    @patch("weathermap.views.requests.get")
    def test_forecast_rejected_key_does_not_leak_secret(self, mock_get):
        failing = fake_response()
        failing.raise_for_status.side_effect = requests.exceptions.HTTPError(
            f"401 Client Error for url: ...&client_secret={SECRET}",
            response=MagicMock(status_code=401),
        )
        mock_get.return_value = failing

        response = self.client.get(f"/api/forecast/{self.city.id}/")
        self.assertEqual(response.status_code, 502)
        self.assertNotIn(SECRET, response.content.decode())
