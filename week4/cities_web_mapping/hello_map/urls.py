from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from mapping.views import map_view

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('cities_api.urls')),  # Week 3 REST API
    path('map/', map_view, name='map'),
    path('', map_view, name='map_home'),
]

if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)