from django.contrib.gis import admin

from .models import AdvancedCity, PolygonAnalysis, SearchSession


@admin.register(AdvancedCity)
class AdvancedCityAdmin(admin.GISModelAdmin):
    list_display = ('name', 'country', 'population', 'gdp_per_capita', 'city_type', 'is_active')
    list_filter = ('city_type', 'is_active', 'country')
    search_fields = ('name', 'country', 'region')


@admin.register(PolygonAnalysis)
class PolygonAnalysisAdmin(admin.ModelAdmin):
    list_display = ('id', 'analysis_timestamp', 'analysis_type', 'cities_count',
                    'polygon_area_km2', 'query_duration_ms')
    list_filter = ('analysis_type',)
    readonly_fields = ('analysis_timestamp',)


@admin.register(SearchSession)
class SearchSessionAdmin(admin.ModelAdmin):
    list_display = ('session_id', 'start_timestamp', 'total_analyses', 'total_cities_found', 'unique_countries')
