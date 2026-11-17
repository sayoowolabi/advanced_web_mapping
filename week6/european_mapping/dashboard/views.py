# dashboard/views.py
from django.db.models import Avg, Count, Max, Min, Sum
from django.shortcuts import render

from cities.models import City
from regions.models import Region


def index(request):
    """Main dashboard view"""
    context = {
        'total_cities': City.objects.count(),
        'total_regions': Region.objects.count(),
        'countries': City.objects.values_list('country', flat=True).distinct().order_by('country'),
        'region_types': Region.objects.values_list('region_type', flat=True).distinct(),
        'city_types': [choice[0] for choice in City._meta.get_field('city_type').choices],
    }
    return render(request, 'dashboard/index.html', context)


def analytics(request):
    """Analytics page with detailed statistics.

    Each table is aggregated in a single query; the dictionary keys
    match exactly what analytics.html reads (city_stats.total_cities, ...).
    """
    city_queryset = City.objects.all()
    city_agg = city_queryset.aggregate(
        total_cities=Count('id'),
        total_population=Sum('population'),
        avg_population=Avg('population'),
        max_population=Max('population'),
        min_population=Min('population'),
        avg_area=Avg('urban_area_km2'),
    )
    city_stats = {
        'total_cities': city_agg['total_cities'],
        'total_population': city_agg['total_population'] or 0,
        'avg_population': city_agg['avg_population'] or 0,
        'max_population': city_agg['max_population'] or 0,
        'min_population': city_agg['min_population'] or 0,
        'avg_area': city_agg['avg_area'] or 0,
    }

    region_queryset = Region.objects.all()
    # The alias for the population sum cannot be 'total_population',
    # because Region already has a field with that name (Django raises
    # FieldError on the clash), so it is called 'population_sum' here.
    region_agg = region_queryset.aggregate(
        total_regions=Count('id'),
        population_sum=Sum('total_population'),
        avg_population=Avg('total_population'),
        max_population=Max('total_population'),
        min_population=Min('total_population'),
        avg_area=Avg('area_km2'),
        avg_gdp_per_capita=Avg('gdp_per_capita'),
    )
    region_stats = {
        'total_regions': region_agg['total_regions'],
        'total_population': region_agg['population_sum'] or 0,
        'avg_population': region_agg['avg_population'] or 0,
        'max_population': region_agg['max_population'] or 0,
        'min_population': region_agg['min_population'] or 0,
        'avg_area': region_agg['avg_area'] or 0,
        'avg_gdp_per_capita': region_agg['avg_gdp_per_capita'] or 0,
    }

    context = {
        'city_stats': city_stats,
        'region_stats': region_stats,
    }
    return render(request, 'dashboard/analytics.html', context)
