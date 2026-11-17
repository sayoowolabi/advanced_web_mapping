from django.contrib.gis import admin

from .models import City


@admin.register(City)
class CityAdmin(admin.GISModelAdmin):
    list_display = ('name', 'country', 'city_type', 'population')
    list_filter = ('city_type', 'country')
    search_fields = ('name', 'country')
