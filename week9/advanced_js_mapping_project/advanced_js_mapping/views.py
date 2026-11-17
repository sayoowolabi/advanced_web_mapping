import json
import logging
import time
from collections import Counter
from datetime import timedelta
from numbers import Real

from django.contrib.gis.db.models.functions import Distance as DistanceFunc
from django.contrib.gis.geos import Point, Polygon
from django.contrib.gis.measure import D
from django.core.paginator import Paginator
from django.db.models import Avg, Count, Sum
from django.http import JsonResponse
from django.shortcuts import render
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .models import AdvancedCity, PolygonAnalysis, SearchSession

logger = logging.getLogger(__name__)

# Equal-area projection (WGS 84 / NSIDC EASE-Grid 2.0 Global) used for polygon areas.
# The handout used Web Mercator (3857), which inflates areas away from the equator
# by 1/cos²(latitude): about 2.8x at Dublin's latitude, about 4x at Oslo's.
EQUAL_AREA_SRID = 6933

ANALYSIS_TYPES = {'polygon', 'rectangle'}


def _error(message, code, status=400):
    return JsonResponse({'status': 'error', 'message': message, 'error_code': code}, status=status)


def _is_number(value):
    """True for int/float values, excluding booleans (bool is a subclass of int)."""
    return isinstance(value, Real) and not isinstance(value, bool)


def _city_dict(city):
    return {
        'id': city.id,
        'name': city.name,
        'country': city.country,
        'region': city.region,
        'population': city.population,
        'gdp_per_capita': city.gdp_per_capita,
        'latitude': float(city.latitude) if city.latitude is not None else None,
        'longitude': float(city.longitude) if city.longitude is not None else None,
        'city_type': city.city_type,
        'elevation_m': city.elevation_m,
        'area_km2': city.area_km2,
        'population_density': city.population_density,
        'timezone': city.timezone_name,
        'climate_zone': city.climate_zone,
    }


def index_view(request):
    """Homepage view with application overview and quick statistics."""
    active = AdvancedCity.objects.filter(is_active=True)
    context = {
        'total_cities': active.count(),
        'total_countries': active.values('country').distinct().count(),
        'recent_analyses': PolygonAnalysis.objects.filter(
            analysis_timestamp__gte=timezone.now() - timedelta(days=7)
        ).count(),
        'app_version': '1.0.0',
        'last_updated': timezone.now().date(),
    }
    return render(request, 'advanced_js_mapping/index.html', context)


def map_view(request):
    """Interactive map interface with drawing tools and real-time spatial analysis."""
    total_cities = AdvancedCity.objects.filter(is_active=True).count()

    # Up to 50 major cities for the initial map; searches use every active city
    sample_cities = AdvancedCity.objects.filter(is_active=True, population__gte=1000000)[:50]

    cities_geojson = {
        "type": "FeatureCollection",
        "features": [city.to_geojson_feature() for city in sample_cities],
    }

    context = {
        'total_cities': total_cities,
        'cities_geojson': json.dumps(cities_geojson),
        'map_center_lat': 54.5,  # Centre on Europe
        'map_center_lng': 15.0,
        'map_zoom': 4,
    }
    return render(request, 'advanced_js_mapping/map.html', context)


@csrf_exempt
@require_http_methods(["POST"])
def polygon_search(request):
    """
    Search for active cities strictly inside a polygon.

    Body: {"coordinates": [[lng, lat], ...], "analysis_type": "polygon" | "rectangle"}
    The ring is closed automatically if the last point differs from the first.
    """
    start_time = time.time()

    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return _error('Invalid JSON in request body.', 'INVALID_JSON')

    if not isinstance(data, dict):
        return _error('Request body must be a JSON object.', 'INVALID_JSON')

    coordinates = data.get('coordinates')
    if not isinstance(coordinates, list) or len(coordinates) < 3:
        return _error('Invalid polygon coordinates. At least 3 points required.', 'INVALID_COORDINATES')

    # Validate every [longitude, latitude] pair
    for coord in coordinates:
        if not isinstance(coord, list) or len(coord) != 2 or not all(_is_number(v) for v in coord):
            return _error('Each coordinate must be [longitude, latitude] with numeric values.',
                          'INVALID_COORDINATE_FORMAT')
        lng, lat = coord
        if not (-180 <= lng <= 180) or not (-90 <= lat <= 90):
            return _error(f'Invalid coordinate values: longitude={lng}, latitude={lat}',
                          'COORDINATE_OUT_OF_BOUNDS')

    # Close the ring
    coordinates = [list(c) for c in coordinates]
    if coordinates[0] != coordinates[-1]:
        coordinates.append(coordinates[0])
    if len(coordinates) < 4:
        return _error('A polygon needs at least 3 distinct points.', 'INVALID_COORDINATES')

    try:
        polygon = Polygon(coordinates, srid=4326)
    except Exception as e:
        logger.warning("Failed to create polygon: %s", e)
        return _error('Failed to create valid polygon from coordinates.', 'POLYGON_CREATION_FAILED')

    # Self-intersecting ("bow-tie") shapes are not valid areas
    if not polygon.valid:
        return _error(f'Polygon is not valid: {polygon.valid_reason}', 'INVALID_POLYGON')

    analysis_type = data.get('analysis_type', 'polygon')
    if analysis_type not in ANALYSIS_TYPES:
        analysis_type = 'polygon'

    try:
        # Spatial query: ST_Within uses the GiST index on location
        query_start = time.time()
        cities_list = list(
            AdvancedCity.objects.filter(location__within=polygon, is_active=True)
            .order_by('-population')
        )
        query_duration = (time.time() - query_start) * 1000  # ms

        # Statistics (keep valid zero values; skip only missing ones)
        total_cities = len(cities_list)
        total_population = sum(c.population for c in cities_list if c.population is not None)
        gdps = [c.gdp_per_capita for c in cities_list if c.gdp_per_capita is not None]
        average_gdp = sum(gdps) / len(gdps) if gdps else None

        cities_data = [_city_dict(c) for c in cities_list]
        geojson = {"type": "FeatureCollection", "features": [c.to_geojson_feature() for c in cities_list]}

        # Area in an equal-area projection (m² -> km²)
        try:
            polygon_area_km2 = polygon.transform(EQUAL_AREA_SRID, clone=True).area / 1_000_000
        except Exception as e:
            logger.warning("Failed to calculate polygon area: %s", e)
            polygon_area_km2 = None

        # Track the analysis; tracking failures never break the search response
        try:
            session_id = request.session.session_key or f"anon_{request.META.get('REMOTE_ADDR', 'unknown')}"
            xmin, ymin, xmax, ymax = polygon.extent
            PolygonAnalysis.objects.create(
                session_id=session_id,
                user_agent=request.META.get('HTTP_USER_AGENT', ''),
                ip_address=request.META.get('REMOTE_ADDR'),
                polygon_coordinates=coordinates,
                polygon_area_km2=polygon_area_km2,
                area_analyzed_km2=polygon_area_km2,
                cities_count=total_cities,
                cities_found=[c.id for c in cities_list],
                total_population=total_population,
                average_gdp=average_gdp,
                query_duration_ms=int(query_duration),
                centroid_latitude=polygon.centroid.y,
                centroid_longitude=polygon.centroid.x,
                bounding_box={'west': xmin, 'south': ymin, 'east': xmax, 'north': ymax},
                analysis_type=analysis_type,
            )
            session, _ = SearchSession.objects.get_or_create(
                session_id=session_id,
                defaults={
                    'user_agent': request.META.get('HTTP_USER_AGENT', ''),
                    'ip_address': request.META.get('REMOTE_ADDR'),
                },
            )
            session.update_metrics()
        except Exception as e:
            logger.error("Failed to save analysis tracking: %s", e)

        total_time = (time.time() - start_time) * 1000

        populations = [c['population'] for c in cities_data if c['population'] is not None]
        response = {
            'status': 'success',
            'timestamp': timezone.now().isoformat(),
            'analysis_type': analysis_type,
            'cities_found': total_cities,
            'total_population': total_population,
            'average_gdp': round(average_gdp, 2) if average_gdp is not None else None,
            'polygon_area_km2': round(polygon_area_km2, 2) if polygon_area_km2 is not None else None,
            'query_time_ms': round(query_duration, 2),
            'total_time_ms': round(total_time, 2),
            'cities': cities_data,
            'geojson': geojson,
            'statistics': {
                'countries_represented': len({c['country'] for c in cities_data}),
                'largest_city': cities_data[0] if cities_data else None,
                'city_types': dict(Counter(c['city_type'] for c in cities_data if c['city_type'])),
                'population_range': {
                    'min': min(populations, default=0),
                    'max': max(populations, default=0),
                },
            },
        }

        logger.info("Polygon search completed: %d cities found in %.2fms", total_cities, total_time)
        return JsonResponse(response)

    except Exception as e:
        logger.error("Unexpected error in polygon_search: %s", e, exc_info=True)
        return _error('Internal server error occurred.', 'INTERNAL_ERROR', status=500)


def cities_api(request):
    """List active cities with optional filtering, sorting and pagination."""
    try:
        page = int(request.GET.get('page', 1))
        limit = min(max(int(request.GET.get('limit', 50)), 1), 1000)  # 1..1000 per page
    except ValueError:
        return JsonResponse({'status': 'error', 'message': 'page and limit must be integers.'}, status=400)

    try:
        queryset = AdvancedCity.objects.filter(is_active=True)

        country = request.GET.get('country')
        city_type = request.GET.get('type')
        if country:
            queryset = queryset.filter(country__icontains=country)
        if city_type:
            queryset = queryset.filter(city_type=city_type)

        for param, lookup in (('min_population', 'population__gte'), ('max_population', 'population__lte')):
            value = request.GET.get(param)
            if value:
                try:
                    queryset = queryset.filter(**{lookup: int(value)})
                except ValueError:
                    pass

        sort_by = request.GET.get('sort', 'name')
        valid_sort_fields = ['name', 'country', 'population', '-population', 'gdp_per_capita', '-gdp_per_capita']
        queryset = queryset.order_by(sort_by if sort_by in valid_sort_fields else 'name')

        paginator = Paginator(queryset, limit)
        cities_page = paginator.get_page(page)

        cities_data = [
            {
                'id': city.id,
                'name': city.name,
                'country': city.country,
                'region': city.region,
                'population': city.population,
                'gdp_per_capita': city.gdp_per_capita,
                'latitude': float(city.latitude) if city.latitude is not None else None,
                'longitude': float(city.longitude) if city.longitude is not None else None,
                'city_type': city.city_type,
                'coordinates': city.coordinates,
            }
            for city in cities_page
        ]

        return JsonResponse({
            'status': 'success',
            'count': len(cities_data),
            'total_count': paginator.count,
            'total_pages': paginator.num_pages,
            'current_page': cities_page.number,
            'has_next': cities_page.has_next(),
            'has_previous': cities_page.has_previous(),
            'cities': cities_data,
        })

    except Exception as e:
        logger.error("Error in cities_api: %s", e, exc_info=True)
        return JsonResponse({'status': 'error', 'message': 'Failed to retrieve cities data.'}, status=500)


def analytics_view(request):
    """Analytics dashboard with statistics, charts and recent search history."""
    try:
        active = AdvancedCity.objects.filter(is_active=True)
        total_cities = active.count()
        total_countries = active.values('country').distinct().count()
        total_population = active.aggregate(total=Sum('population'))['total'] or 0

        total_analyses = PolygonAnalysis.objects.count()
        recent_analyses = PolygonAnalysis.objects.filter(
            analysis_timestamp__gte=timezone.now() - timedelta(days=7)
        ).count()
        avg_cities_per_search = PolygonAnalysis.objects.aggregate(avg=Avg('cities_count'))['avg'] or 0
        avg_query_time = PolygonAnalysis.objects.filter(
            query_duration_ms__isnull=False
        ).aggregate(avg=Avg('query_duration_ms'))['avg'] or 0

        # Top 10 countries by number of cities
        countries_data = active.values('country').annotate(count=Count('id')).order_by('-count', 'country')[:10]
        countries_labels = [item['country'] for item in countries_data]
        countries_counts = [item['count'] for item in countries_data]

        # City types
        city_types_data = active.values('city_type').annotate(count=Count('id')).order_by('-count')
        city_types_labels = [item['city_type'].title() for item in city_types_data if item['city_type']]
        city_types_counts = [item['count'] for item in city_types_data if item['city_type']]

        # Population distribution (only ranges with data)
        population_ranges = [
            ('< 100K', 0, 100_000),
            ('100K - 500K', 100_000, 500_000),
            ('500K - 1M', 500_000, 1_000_000),
            ('1M - 5M', 1_000_000, 5_000_000),
            ('> 5M', 5_000_000, None),
        ]
        population_labels, population_counts = [], []
        for label, min_pop, max_pop in population_ranges:
            qs = active.filter(population__gte=min_pop)
            if max_pop is not None:
                qs = qs.filter(population__lt=max_pop)
            count = qs.count()
            if count > 0:
                population_labels.append(label)
                population_counts.append(count)

        context = {
            'total_cities': total_cities,
            'total_countries': total_countries,
            'total_population': total_population,
            'total_analyses': total_analyses,
            'recent_analyses': recent_analyses,
            'avg_cities_per_search': round(avg_cities_per_search, 1),
            'avg_query_time': round(avg_query_time, 0),

            # Chart data (JSON strings, read back with json_script in the template)
            'countries_labels': json.dumps(countries_labels),
            'countries_data': json.dumps(countries_counts),
            'city_types_labels': json.dumps(city_types_labels),
            'city_types_data': json.dumps(city_types_counts),
            'population_labels': json.dumps(population_labels),
            'population_data': json.dumps(population_counts),

            'top_cities_by_population': active.order_by('-population')[:10],
            'top_cities_by_gdp': active.filter(gdp_per_capita__isnull=False).order_by('-gdp_per_capita')[:10],
            'recent_analyses_list': PolygonAnalysis.objects.filter(
                analysis_timestamp__gte=timezone.now() - timedelta(days=30)
            ).order_by('-analysis_timestamp')[:20],
        }
        return render(request, 'advanced_js_mapping/analytics.html', context)

    except Exception as e:
        logger.error("Error in analytics_view: %s", e, exc_info=True)
        empty = json.dumps([])
        context = {
            'error_message': 'Some analytics data could not be loaded. Please try refreshing the page.',
            'total_cities': 0, 'total_countries': 0, 'total_population': 0,
            'total_analyses': 0, 'recent_analyses': 0,
            'avg_cities_per_search': 0, 'avg_query_time': 0,
            'countries_labels': empty, 'countries_data': empty,
            'city_types_labels': empty, 'city_types_data': empty,
            'population_labels': empty, 'population_data': empty,
            'top_cities_by_population': [], 'top_cities_by_gdp': [], 'recent_analyses_list': [],
        }
        return render(request, 'advanced_js_mapping/analytics.html', context)


@csrf_exempt
@require_http_methods(["POST"])
def distance_search(request):
    """
    Radius search around a point.

    Body: {"latitude": 53.35, "longitude": -6.26, "radius_km": 200}
    Distances are measured on the sphere by PostGIS and returned in km.
    """
    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({'status': 'error', 'message': 'Invalid JSON in request body.'}, status=400)
    if not isinstance(data, dict):
        return JsonResponse({'status': 'error', 'message': 'Request body must be a JSON object.'}, status=400)

    latitude = data.get('latitude')
    longitude = data.get('longitude')
    radius_km = data.get('radius_km', 10)  # Default 10 km

    if latitude is None or longitude is None:
        return JsonResponse({'status': 'error', 'message': 'Latitude and longitude are required.'}, status=400)
    if not all(_is_number(v) for v in (latitude, longitude, radius_km)):
        return JsonResponse({'status': 'error', 'message': 'latitude, longitude and radius_km must be numbers.'},
                            status=400)
    if not (-90 <= latitude <= 90) or not (-180 <= longitude <= 180):
        return JsonResponse({'status': 'error', 'message': 'Invalid coordinate values.'}, status=400)
    if not (0 < radius_km <= 1000):
        return JsonResponse({'status': 'error', 'message': 'Radius must be between 0 and 1000 kilometers.'},
                            status=400)

    try:
        center_point = Point(longitude, latitude, srid=4326)

        cities_within = (
            AdvancedCity.objects.filter(
                location__distance_lte=(center_point, D(km=radius_km)),
                is_active=True,
            )
            # Distance() on a geographic field returns metres, so this is accurate,
            # unlike the handout's "degrees * 111" approximation
            .annotate(distance=DistanceFunc('location', center_point))
            .order_by('distance')
        )

        cities_data = [
            {
                'id': city.id,
                'name': city.name,
                'country': city.country,
                'population': city.population,
                'gdp_per_capita': city.gdp_per_capita,
                'latitude': city.latitude,
                'longitude': city.longitude,
                'distance_km': round(city.distance.km, 2),
            }
            for city in cities_within
        ]

        return JsonResponse({
            'status': 'success',
            'center_point': {'latitude': latitude, 'longitude': longitude},
            'radius_km': radius_km,
            'cities_found': len(cities_data),
            'cities': cities_data,
        })

    except Exception as e:
        logger.error("Error in distance_search: %s", e, exc_info=True)
        return JsonResponse({'status': 'error', 'message': 'Distance search failed.'}, status=500)
