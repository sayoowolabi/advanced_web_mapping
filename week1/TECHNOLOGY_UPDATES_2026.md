# Technology Stack Updates - Week 1 Lab (2026)
## CMPU4058 - Advanced Web Mapping

This document summarizes all technology updates made to the Week 1 lab for the 2026 academic year.

---

## Summary of Changes

### 1. **Python Version Updated**
- **Old**: Python 3.8+
- **New**: Python 3.11 or higher (3.12 recommended)
- **Reason**: Python 3.8 reached end-of-life in October 2024. Version 3.11+ provides:
  - Better error messages and stack traces
  - Improved type hint support
  - Better performance (~10-15% faster)
  - Enhanced async/await capabilities

### 2. **Django Framework Updated**
- **Old**: Django 4.2.0+
- **New**: Django 5.0+ (recommended), with 4.2 LTS as fallback
- **Reason**:
  - Django 5.0+ released November 2023
  - Better async support for real-time mapping
  - Improved admin interface with modern UI
  - Enhanced type hints throughout
  - Better ORM performance

### 3. **Database System Updated**
- **PostgreSQL**: 
  - **Old**: 12+
  - **New**: 15+ (16 recommended)
  - Better spatial performance, security patches
  
- **PostGIS**:
  - **Old**: Not specified
  - **New**: 3.3+ (3.4 recommended)
  - Enhanced spatial operations, better performance

### 4. **Python Dependencies Updated**

| Package | Old Version | New Version | What's New |
|---------|------------|------------|-----------|
| **Django** | ≥4.2.0 | ≥5.0,<6.0 | Better async, admin UI, type hints |
| **DRF** | ≥3.14.0 | ≥3.15.0 | Improved OpenAPI schema, validation |
| **psycopg2-binary** | ≥2.9.5 | ≥3.1.0 | Major version with async support |
| **django-environ** | ≥0.10.0 | ≥0.11.0 | Better env var handling |
| **django-cors-headers** | ≥4.0.0 | ≥4.3.0 | Security improvements |
| **Pillow** | ≥9.5.0 | ≥10.0.0 | Better image handling |

### 5. **New Packages Added**

| Package | Version | Purpose |
|---------|---------|---------|
| **django-crispy-forms** | ≥2.1 | Better form rendering with Bootstrap |
| **django-extensions** | ≥3.2.3 | Development utilities (shell_plus, graph_models) |
| **django-filter** | ≥24.1 | Advanced API filtering |
| **djangorestframework-gis** | ≥0.20 | Spatial support for Django REST Framework |
| **pytest** | ≥7.4.0 | Professional testing framework |
| **pytest-django** | ≥4.7.0 | Django integration for pytest |
| **pytest-cov** | ≥4.1.0 | Code coverage reporting |
| **django-debug-toolbar** | ≥4.2.0 | Development debugging interface |
| **black** | ≥24.0.0 | Code formatting (PEP 8 enforced) |
| **flake8** | ≥7.0.0 | Code linting |
| **mypy** | ≥1.8.0 | Static type checking |
| **gunicorn** | ≥21.2.0 | Production WSGI server |

### 6. **VS Code Extensions Updated**

**Added**:
- Pylance - Advanced type checking and IntelliSense
- Black Formatter - Automatic code formatting
- Flake8 - Real-time linting
- Thunder Client or REST Client - API testing

**Enhanced Configuration**: Updated `.vscode/settings.json` with:
- Black formatter as default formatter
- Flake8 linting enabled
- 120-character line length standard
- Django-HTML template support

### 7. **Code Quality Tools Setup**

New optional setup for professional development:

1. **Black**: Automatic code formatting
2. **Flake8**: Linting and code style checking
3. **MyPy**: Static type checking
4. **Pre-commit hooks**: Automated checks before commits

### 8. **Documentation Updates**

- Updated installation instructions for PostgreSQL 16
- Added backward compatibility notes for Django 4.2 users
- Expanded troubleshooting section
- Added code quality tools configuration guide
- Enhanced environment setup documentation

### 9. **Settings Configuration Enhanced**

Django settings.py now includes:
- Type hints for better IDE support (Django 5.0+ feature)
- `django_filters` in INSTALLED_APPS
- Modern middleware configuration
- Enhanced REST Framework configuration

---

## Files Modified

1. **README.md**
   - Updated Python version requirements (3.11+)
   - Updated PostgreSQL installation (v16, PostGIS 3.4+)
   - Enhanced requirements.txt with new packages
   - Updated Django settings with type hints

2. **SETUP.md**
   - Updated Python version (3.11+ recommended)
   - Updated PostgreSQL/PostGIS versions
   - Enhanced VS Code extensions list
   - Added Code Quality Tools section
   - Added Technology Stack Notes and backward compatibility info
   - Enhanced troubleshooting documentation

3. **requirements.txt**
   - Completely updated all package versions
   - Added development and testing dependencies
   - Added code quality tools
   - Added production server (gunicorn)
   - Organized by category with comments

4. **NEW: TECHNOLOGY_UPDATES_2026.md** (This file)
   - Comprehensive summary of all changes

---

## Migration Guide for Existing Students

### If You're Using Django 4.2 LTS

The lab still supports Django 4.2 LTS. To use it:

```bash
# Update requirements.txt
Django>=4.2,<5.0
djangorestframework>=3.14.0
psycopg2-binary>=2.9.5
django-environ>=0.10.0
django-cors-headers>=4.0.0
Pillow>=9.5.0
```

**Note**: Type hints and async features won't be available.

### If You're Upgrading from Python 3.8

1. Check your current version: `python3 --version`
2. Install Python 3.11+ via Homebrew or python.org
3. Create a fresh virtual environment
4. Run `pip install -r requirements.txt`

---

## Performance Improvements

With these updates, you should see:

- **Faster startup**: Django 5.0 loads ~15-20% faster
- **Better response times**: Python 3.11+ ~10-15% performance improvement
- **Faster database queries**: PostgreSQL 16 optimizations for spatial data
- **Better caching**: Enhanced Redis/cache support

---

## Backward Compatibility Notes

### Django 4.2 → 5.0 Migration

Most code is compatible, but note these changes:

1. **Async Views**: New in Django 5.0, enhanced async support
2. **Type Hints**: Django 5.0 has comprehensive type hints
3. **Admin Interface**: Modernized UI (optional in 4.2)
4. **Removed Features**: Some deprecated 3.2 features removed

### Python 3.8 → 3.11+ Migration

- Switch statements (match/case) now available
- Better exception groups for error handling
- Type hints are more powerful
- Performance improvements are automatic

---

## Testing the New Stack

After updating, verify everything works:

```bash
# Test Python version
python3 --version  # Should show 3.11+ or 3.12

# Test Django
python -c "import django; print('Django:', django.get_version())"

# Test PostgreSQL
psql --version  # Should show 15+ or 16

# Test database connection
psql -h localhost -U map_developer -d hello_map_dublin -c "SELECT PostGIS_Version();"

# Test virtual environment
source venv_hello_map/bin/activate
pip show Django  # Should show 5.0+

# Test code quality tools
black --version
flake8 --version
mypy --version
```

---

## Recommended Timeline

1. **Week 1-2**: Update environment and install packages
2. **Week 3-4**: Adapt to new Django 5.0 features if using it
3. **Week 5+**: Leverage new async capabilities for real-time features

---

## Additional Resources

- **Django 5.0 Release Notes**: https://docs.djangoproject.com/en/5.0/releases/5.0/
- **Python 3.11 Features**: https://docs.python.org/3/whatsnew/3.11.html
- **Python 3.12 Features**: https://docs.python.org/3/whatsnew/3.12.html
- **PostgreSQL 16 Improvements**: https://www.postgresql.org/about/news/
- **PostGIS 3.4 Release**: https://postgis.net/

---

## Questions or Issues?

If you encounter compatibility issues:

1. Check the Troubleshooting section in SETUP.md
2. Review the backward compatibility notes above
3. Refer to official documentation links
4. Check course forums or ask during lab sessions

---

**Last Updated**: September 7, 2026
**For**: CMPU4058 - Advanced Web Mapping (2026)
