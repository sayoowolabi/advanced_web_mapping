import requests
from django.conf import settings
from django.core.cache import cache
from django.http import JsonResponse
from django.shortcuts import render

from .models import City

XWEATHER_CONDITIONS_URL = "https://data.api.xweather.com/conditions/closest"
XWEATHER_FORECAST_URL = "https://data.api.xweather.com/forecasts/closest"

CACHE_SECONDS = 600  # Enhancement 2: keep weather for 10 minutes
REQUEST_TIMEOUT = 5  # seconds before giving up on XWeather


class WeatherServiceError(Exception):
    """A failure talking to XWeather, carrying a message that is safe to show users.

    The message never contains the request URL, so the credentials (which
    are sent as query parameters) cannot leak into a response.
    """

    def __init__(self, message, status=502):
        super().__init__(message)
        self.message = message
        self.status = status


def map_view(request):
    """Render the main map page"""
    return render(request, 'weathermap/map.html')


def get_cities_json(request):
    """Return all cities as JSON"""
    cities = City.objects.all().values('id', 'name', 'country', 'latitude', 'longitude')
    return JsonResponse(list(cities), safe=False)


def _fetch_xweather(url, city, extra_params=None):
    """Call an XWeather endpoint for a city and return its list of periods.

    Runs on the server, inside the web container, so the client id and
    secret are added here and never reach the browser.
    Raises WeatherServiceError with a safe message on any failure.
    """
    client_id = getattr(settings, 'XWEATHER_CLIENT_ID', None)
    client_secret = getattr(settings, 'XWEATHER_CLIENT_SECRET', None)

    if not client_id or not client_secret:
        raise WeatherServiceError(
            'XWeather API credentials (XWEATHER_CLIENT_ID and XWEATHER_CLIENT_SECRET) '
            'are not configured',
            status=503,
        )

    params = {
        'p': f"{city.latitude},{city.longitude}",
        'client_id': client_id,
        'client_secret': client_secret,
        'units': 'metric',  # metric units: Celsius, m/s, hPa
    }
    if extra_params:
        params.update(extra_params)

    try:
        response = requests.get(url, params=params, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
        data = response.json()

        # XWeather can answer HTTP 200 with success=false (e.g. no data near the point)
        if data.get('success') is False:
            raise WeatherServiceError('XWeather has no data for this location')

        # Data is nested inside response -> periods
        return data['response'][0]['periods']

    except requests.exceptions.HTTPError as e:
        # Never return str(e): it contains the request URL, including the credentials
        status = e.response.status_code
        if status == 401:
            message = 'XWeather rejected the API credentials'
        else:
            message = f'XWeather returned HTTP {status}'
        raise WeatherServiceError(message) from None
    except requests.exceptions.RequestException:
        raise WeatherServiceError('Could not get a response from XWeather') from None
    except (KeyError, IndexError, TypeError, ValueError):
        raise WeatherServiceError('Unexpected response format from XWeather') from None


def get_weather(request, city_id):
    """Current weather for a city (server-side proxy to XWeather, cached 10 minutes)"""
    try:
        city = City.objects.get(id=city_id)
    except City.DoesNotExist:
        return JsonResponse({'error': 'City not found'}, status=404)

    cache_key = f'weather_{city_id}'
    cached_data = cache.get(cache_key)
    if cached_data:
        return JsonResponse(cached_data)

    try:
        period = _fetch_xweather(XWEATHER_CONDITIONS_URL, city)[0]
    except WeatherServiceError as e:
        return JsonResponse({'error': e.message}, status=e.status)
    except IndexError:
        return JsonResponse({'error': 'Unexpected response format from XWeather'}, status=502)

    result = {
        'city': city.name,
        'country': city.country,
        'temperature': period.get('tempC'),
        'feels_like': period.get('feelslikeC'),
        'humidity': period.get('humidity'),
        'pressure': period.get('pressureMB'),
        'wind_speed': period.get('windSpeedMPS'),
        'description': period.get('weather'),
        'icon': period.get('icon'),
    }

    # Only successful results are cached, so an error is retried next time
    cache.set(cache_key, result, CACHE_SECONDS)
    return JsonResponse(result)


def get_forecast(request, city_id):
    """Enhancement 1: 3-day daily forecast for a city (cached 10 minutes).

    XWeather's forecasts endpoint with filter=day returns one period per
    day, so the first three periods are the next three days.
    """
    try:
        city = City.objects.get(id=city_id)
    except City.DoesNotExist:
        return JsonResponse({'error': 'City not found'}, status=404)

    cache_key = f'forecast_{city_id}'
    cached_data = cache.get(cache_key)
    if cached_data:
        return JsonResponse(cached_data)

    try:
        periods = _fetch_xweather(XWEATHER_FORECAST_URL, city, {'filter': 'day', 'limit': 3})
    except WeatherServiceError as e:
        return JsonResponse({'error': e.message}, status=e.status)

    result = {
        'city': city.name,
        'country': city.country,
        'days': [
            {
                'date': (p.get('dateTimeISO') or '')[:10],  # YYYY-MM-DD
                'max_temp': p.get('maxTempC'),
                'min_temp': p.get('minTempC'),
                'description': p.get('weather'),
                'icon': p.get('icon'),
                'precip_chance': p.get('pop'),
            }
            for p in periods[:3]
        ],
    }

    cache.set(cache_key, result, CACHE_SECONDS)
    return JsonResponse(result)
