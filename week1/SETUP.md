# Setup Guide: Full-Stack Web Mapping Environment
## CMPU4058 - Advanced Web Mapping - Week 1

This guide will help you set up a complete development environment for full-stack web mapping with Django, PostGIS, and Leaflet.

---

## System Requirements

### Minimum Requirements
- **Operating System**: macOS 10.14+, Windows 10+, or Ubuntu 18.04+
- **RAM**: 4GB minimum, 8GB recommended
- **Storage**: 5GB free space
- **Network**: Internet connection for downloads

### Required Software
- **Python 3.11 or higher** (3.12 recommended)
  - Python 3.8 reached end-of-life in October 2024
  - 3.11+ provides improved error messages and type hint support
  - Verify with: `python3 --version`
- **PostgreSQL 15+** (version 16 recommended)
  - PostGIS 3.3+ for enhanced spatial operations
- **Code Editor**: VS Code recommended
- **Git**: Version control (optional but recommended)

---

## Installation Guide

### Step 1: Python Installation

#### Check Current Python Version
```bash
python3 --version
```

#### macOS
```bash
# Install using Homebrew (recommended)
brew install python@3.12

# Alternative: Download from python.org
# https://www.python.org/downloads/
```

#### Ubuntu/Linux
```bash
sudo apt update
sudo apt install python3 python3-pip python3-venv
```

#### Windows
1. Download from https://python.org/downloads/
2. Run installer, check "Add Python to PATH"
3. Verify installation: `python --version`

### Step 2: PostgreSQL and PostGIS Installation

#### macOS (using Homebrew)
```bash
# Install Homebrew if not present
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install PostgreSQL 16 (or 15) and PostGIS 3.4+
brew install postgresql@16 postgis

# Start PostgreSQL service
brew services start postgresql@16

# Verify installation
psql --version  # Should show PostgreSQL 16.x
```

#### Ubuntu/Linux
```bash
# Add PostgreSQL official repository for latest versions
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -

# Update package manager
sudo apt update

# Install PostgreSQL 16 and PostGIS 3.4+
sudo apt install postgresql-16 postgresql-contrib-16 postgis postgresql-16-postgis-3

# Start PostgreSQL service
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Set up PostgreSQL user (if needed)
sudo -u postgres createuser --interactive --pwprompt

# Verify installation
psql --version  # Should show PostgreSQL 16.x
```

#### Windows
1. **Download PostgreSQL**:
   - Visit https://www.postgresql.org/download/windows/
   - Download PostgreSQL installer (version 12+)
   - Run installer with default settings

2. **Install PostGIS**:
   - During PostgreSQL installation, select "Stack Builder"
   - After installation, run Stack Builder
   - Select PostGIS extension and install

3. **Verify Installation**:
   - Open Command Prompt
   - Run: `psql --version`

### Step 3: Database Setup

#### Access PostgreSQL
```bash
# Method 1: Default user (macOS/Linux)
sudo -u postgres psql

# Method 2: Your user account
psql -U your_username

# Method 3: With password prompt
psql -U postgres -h localhost
```

#### Create Project Database
```sql
-- Create database
CREATE DATABASE hello_map_dublin;

-- Create user
CREATE USER map_developer WITH PASSWORD 'dublin2025!';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE hello_map_dublin TO map_developer;

-- Connect to database
\c hello_map_dublin;

-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- Verify PostGIS
SELECT PostGIS_Version();

-- Exit PostgreSQL
\q
```

### Step 4: Python Development Environment

#### Create Project Directory
```bash
mkdir hello_map_project
cd hello_map_project
```

#### Create Virtual Environment
```bash
# Create virtual environment
python3 -m venv venv_hello_map

# Activate virtual environment
# macOS/Linux:
source venv_hello_map/bin/activate

# Windows:
venv_hello_map\Scripts\activate

# Verify activation (should show (venv_hello_map) in prompt)
which python
```

#### Install Required Packages
```bash
# Create requirements file with updated package versions
cat > requirements.txt << 'EOF'
# Core Django (5.0+ recommended for latest features)
Django>=5.0,<6.0
djangorestframework>=3.15.0
django-cors-headers>=4.3.0
django-environ>=0.11.0
django-crispy-forms>=2.1
django-extensions>=3.2.3
django-filter>=24.1

# Database
psycopg2-binary>=3.1.0
djangorestframework-gis>=0.20

# File handling
Pillow>=10.0.0

# Development & Testing
pytest>=7.4.0
pytest-django>=4.7.0
pytest-cov>=4.1.0
django-debug-toolbar>=4.2.0

# Code Quality
black>=24.0.0
flake8>=7.0.0
mypy>=1.8.0

# Production
gunicorn>=21.2.0
EOF

# Update pip, setuptools, and wheel
pip install --upgrade pip setuptools wheel

# Install all packages
pip install -r requirements.txt

# Verify Django installation
python -c "import django; print('Django version:', django.get_version())"
```

---

## Development Tools Setup

### VS Code Configuration

#### Install VS Code
- **macOS**: `brew install --cask visual-studio-code`
- **Windows/Linux**: Download from https://code.visualstudio.com/

#### Recommended Extensions
Install these extensions for optimal development:

1. **Python** (Microsoft) - Python language support and debugging
2. **Pylance** - Advanced Python type checking and IntelliSense
3. **Django** - Django template support and snippets
4. **PostgreSQL** - Database management within VS Code
5. **GitLens** - Enhanced Git capabilities
6. **Bracket Pair Colorizer** - Code readability
7. **Black Formatter** - Code formatting
8. **Flake8** - Linting support
9. **Thunder Client** or **REST Client** - API testing

#### VS Code Settings
Create `.vscode/settings.json` in your project:
```json
{
    "python.defaultInterpreterPath": "./venv_hello_map/bin/python",
    "python.linting.enabled": true,
    "python.linting.pylintEnabled": false,
    "python.linting.flake8Enabled": true,
    "python.formatting.provider": "black",
    "python.linting.flake8Args": ["--max-line-length=120"],
    "emmet.includeLanguages": {
        "django-html": "html"
    },
    "files.associations": {
        "**/*.html": "django-html"
    },
    "editor.defaultFormatter": "ms-python.black-formatter"
}
```

---

## Environment Configuration

### Create Environment Variables
Create `.env` file in project root:
```env
# Django Configuration
DEBUG=True
SECRET_KEY=hello-map-super-secret-key-change-in-production
DJANGO_SETTINGS_MODULE=hello_map_django.settings

# Database Configuration
DB_NAME=hello_map_dublin
DB_USER=map_developer
DB_PASSWORD=dublin2025!
DB_HOST=localhost
DB_PORT=5432

# Application Settings
ALLOWED_HOSTS=localhost,127.0.0.1,0.0.0.0
```

### Create .gitignore
```bash
cat > .gitignore << 'EOF'
# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
build/
develop-eggs/
dist/
downloads/
eggs/
.eggs/
lib/
lib64/
parts/
sdist/
var/
wheels/
share/python-wheels/
*.egg-info/
.installed.cfg
*.egg
MANIFEST

# Django
*.log
local_settings.py
db.sqlite3
db.sqlite3-journal

# Environment variables
.env

# Virtual environment
venv_hello_map/
ENV/
env/
venv/

# IDEs
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db
EOF
```

---

## Code Quality & Development Tools Setup (Optional but Recommended)

### Configure Code Formatting with Black

Black is an opinionated Python code formatter that ensures consistent code style across your project.

```bash
# Black is already included in requirements.txt
# Configure Black for the project by creating pyproject.toml:

cat > pyproject.toml << 'EOF'
[tool.black]
line-length = 120
target-version = ['py311', 'py312']
include = '\.pyi?$'
extend-exclude = '''
/(
  # directories
  \.eggs
  | \.git
  | \.hg
  | \.mypy_cache
  | \.tox
  | \.venv
  | build
  | dist
)/
'''
EOF

# Format all Python files
black .
```

### Setup Flake8 Linting

Create a `.flake8` configuration file:

```bash
cat > .flake8 << 'EOF'
[flake8]
max-line-length = 120
exclude = .git,__pycache__,venv_hello_map,.venv,build,dist
ignore = E203,W503
EOF
```

### Setup MyPy Type Checking

Create a `mypy.ini` configuration file:

```bash
cat > mypy.ini << 'EOF'
[mypy]
python_version = 3.11
warn_return_any = True
warn_unused_configs = True
ignore_missing_imports = True
exclude = venv_hello_map/,migrations/
EOF

# Run type checking
mypy .
```

### Setup Pre-commit Hooks (Optional)

To automatically run code quality checks before commits:

```bash
# Install pre-commit
pip install pre-commit

# Create .pre-commit-config.yaml
cat > .pre-commit-config.yaml << 'EOF'
repos:
  - repo: https://github.com/psf/black
    rev: 24.1.0
    hooks:
      - id: black
        language_version: python3.11

  - repo: https://github.com/PyCQA/flake8
    rev: 7.0.0
    hooks:
      - id: flake8
        args: ['--max-line-length=120']

  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.8.0
    hooks:
      - id: mypy
        additional_dependencies: ['types-all']
EOF

# Install git hooks
pre-commit install

# Run pre-commit on all files
pre-commit run --all-files
```

---

## Verification Steps


### Test Database Connection
```bash
# Test PostgreSQL connection
psql -h localhost -U map_developer -d hello_map_dublin -c "SELECT version();"

# Test PostGIS functionality
psql -h localhost -U map_developer -d hello_map_dublin -c "SELECT PostGIS_Version();"
```

### Test Python Environment
```bash
# Activate virtual environment
source venv_hello_map/bin/activate

# Test Django
python -c "import django; print('Django:', django.get_version())"

# Test PostgreSQL adapter
python -c "import psycopg2; print('psycopg2: OK')"

# Test environment variables
python -c "import environ; print('django-environ: OK')"
```

### Test Spatial Capabilities
```bash
python -c "
from django.contrib.gis.gdal import HAS_GDAL
from django.contrib.gis.geos import HAS_GEOS
print('GDAL available:', HAS_GDAL)
print('GEOS available:', HAS_GEOS)
"
```

---

## Troubleshooting

### PostgreSQL Issues

**Problem**: PostgreSQL not starting
```bash
# macOS
brew services list | grep postgresql
brew services start postgresql

# Linux
sudo systemctl status postgresql
sudo systemctl start postgresql

# Windows
# Check Services panel, start PostgreSQL service
```

**Problem**: Permission denied
```bash
# Create PostgreSQL user
sudo -u postgres createuser --interactive --pwprompt map_developer

# Grant database permissions
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE hello_map_dublin TO map_developer;"
```

**Problem**: PostGIS extension not available
```sql
-- Connect as superuser
sudo -u postgres psql

-- Check available extensions
SELECT * FROM pg_available_extensions WHERE name = 'postgis';

-- Install if available
CREATE EXTENSION IF NOT EXISTS postgis;
```

### Python Environment Issues

**Problem**: Virtual environment not activating
```bash
# Remove and recreate virtual environment
rm -rf venv_hello_map
python3 -m venv venv_hello_map
source venv_hello_map/bin/activate
```

**Problem**: Package installation errors
```bash
# Update pip and setuptools
pip install --upgrade pip setuptools wheel

# Install packages individually to isolate issues
pip install Django
pip install psycopg2-binary
```

**Problem**: Django imports failing
```bash
# Verify Django installation
pip show Django

# Check Python path
python -c "import sys; print('\n'.join(sys.path))"
```

### Django Configuration Issues

**Problem**: Database connection errors
- Verify PostgreSQL is running
- Check database credentials in `.env` file
- Test manual connection: `psql -h localhost -U map_developer -d hello_map_dublin`

**Problem**: Static files not loading
- Ensure `STATIC_URL` is configured
- Run `python manage.py collectstatic` for production
- Check `STATICFILES_DIRS` in settings

---

## Backward Compatibility & Technology Stack Notes

### Using Older Django Versions

If you must use **Django 4.2 LTS** instead of 5.0+:

```bash
# Update requirements.txt
Django>=4.2,<5.0
djangorestframework>=3.14.0
psycopg2-binary>=2.9.5
django-environ>=0.10.0
django-cors-headers>=4.0.0
Pillow>=9.5.0
```

**Key Differences from Django 5.0+**:
- Async views are less mature in 4.2
- Admin interface has fewer features
- Type hints are not as comprehensive
- Some newer middleware options unavailable

### Technology Stack 2026 Updates

This lab has been updated to reflect modern best practices:

| Technology | Version | Why Updated |
|-----------|---------|------------|
| **Python** | 3.11+ | 3.8 EOL Oct 2024; better error messages & performance |
| **Django** | 5.0+ | Modern async support, better admin, improved type hints |
| **PostgreSQL** | 15+ | Enhanced performance, better JSON support, security |
| **PostGIS** | 3.3+ | Better spatial operations, modern coordinate systems |
| **DRF** | 3.15+ | Improved OpenAPI schema, better validation |
| **psycopg2** | 3.1+ | Major version with async support improvements |

### Why These Updates Matter

**Performance**: Modern versions include performance optimizations for geospatial operations

**Type Safety**: Python 3.11+ and Django 5.0+ have improved type hinting for better IDE support

**Security**: Latest versions include important security patches for production deployments

**Developer Experience**: Better error messages, improved debugging tools, and modern async support

---

## Next Steps


After completing this setup:

1. **Test Environment**: Run all verification steps
2. **Start Development**: Begin Django project creation
3. **Follow Lab Guide**: Proceed with main lab instructions
4. **Documentation**: Keep notes on any custom configurations

---

## Additional Resources

### Documentation Links
- **Django**: https://docs.djangoproject.com/
- **PostGIS**: https://postgis.net/documentation/
- **Leaflet**: https://leafletjs.com/reference.html
- **PostgreSQL**: https://www.postgresql.org/docs/

### Learning Resources
- **GeoDjango Tutorial**: https://docs.djangoproject.com/en/stable/ref/contrib/gis/tutorial/
- **PostGIS Workshop**: https://postgis.net/workshops/postgis-intro/
- **Leaflet Tutorials**: https://leafletjs.com/examples.html

### Community Support
- **Django Forum**: https://forum.djangoproject.com/
- **PostGIS Users List**: https://lists.osgeo.org/mailman/listinfo/postgis-users
- **Stack Overflow**: Use tags `django`, `postgis`, `leaflet`

---

## Success Checklist

Before proceeding with the lab, ensure you can:

- [ ] Connect to PostgreSQL database
- [ ] Create and activate Python virtual environment
- [ ] Import Django without errors
- [ ] Access PostGIS functions from Python
- [ ] View spatial data in PostgreSQL
- [ ] Open and configure VS Code for development

If all items are checked, you're ready to begin the Hello Map lab! 🚀
