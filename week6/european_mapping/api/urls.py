from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import CityViewSet, RegionViewSet

router = DefaultRouter()
router.register(r'cities', CityViewSet)
router.register(r'regions', RegionViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
