from django.contrib.gis import admin

from .models import Region


@admin.register(Region)
class RegionAdmin(admin.GISModelAdmin):
    list_display = ('name', 'country', 'region_type', 'total_population', 'area_km2')
    list_filter = ('region_type', 'country')
    search_fields = ('name', 'region_code')
