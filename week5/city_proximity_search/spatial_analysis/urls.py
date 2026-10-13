from django.urls import path
from . import views

app_name = "spatial_analysis"

urlpatterns = [
    path("", views.spatial_analysis_dashboard, name="home"),
    path("dashboard/", views.spatial_analysis_dashboard, name="dashboard"),
    path("poi/<int:pk>/", views.poi_detail, name="poi_details"),
]