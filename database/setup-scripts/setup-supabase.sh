#!/bin/bash

# =============================================
# Rwanda Water Resources Board Database Setup Script
# For Supabase Integration
# =============================================

set -e  # Exit on any error

echo "🚀 Setting up Rwanda Water Resources Board Database Schema..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    print_error "Supabase CLI is not installed. Please install it first:"
    echo "npm install -g supabase"
    exit 1
fi

print_status "Supabase CLI found"

# Check if we're in a Supabase project
if [ ! -f "supabase/config.toml" ]; then
    print_warning "No Supabase project found. Initializing..."
    supabase init
    print_status "Supabase project initialized"
fi

# Create migrations directory if it doesn't exist
mkdir -p supabase/migrations
print_status "Migrations directory ready"

# Copy schema to migrations
MIGRATION_FILE="supabase/migrations/$(date +%Y%m%d%H%M%S)_initial_rwb_schema.sql"

if [ -f "database/schema.sql" ]; then
    cp database/schema.sql "$MIGRATION_FILE"
    print_status "Schema copied to migrations: $MIGRATION_FILE"
else
    print_error "Schema file not found at database/schema.sql"
    exit 1
fi

# Start Supabase local development
print_info "Starting Supabase local development environment..."
supabase start

# Wait for services to be ready
sleep 5

# Apply migrations
print_info "Applying database migrations..."
supabase db push

# Verify setup
print_info "Verifying database setup..."

# Check if tables were created successfully
TABLES_COUNT=$(supabase db connect --local -c "
SELECT COUNT(*) 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('users', 'applications', 'permits', 'documents', 'inspections');
")

if [ "$TABLES_COUNT" -eq 5 ]; then
    print_status "Core tables created successfully"
else
    print_error "Some core tables are missing. Please check the migration logs."
    exit 1
fi

# Check if extensions are enabled
EXTENSIONS_COUNT=$(supabase db connect --local -c "
SELECT COUNT(*) 
FROM pg_extension 
WHERE extname IN ('uuid-ossp', 'postgis');
")

if [ "$EXTENSIONS_COUNT" -eq 2 ]; then
    print_status "Required extensions enabled"
else
    print_warning "Some extensions may not be enabled. Please check manually."
fi

# Generate TypeScript types
print_info "Generating TypeScript types..."
supabase gen types typescript --local > types/supabase.ts
print_status "TypeScript types generated at types/supabase.ts"

# Display connection information
print_info "Database setup complete!"
echo ""
echo "📊 Local Development URLs:"
echo "- Studio URL: http://localhost:54323"
echo "- API URL: http://localhost:54321"
echo "- DB URL: postgresql://postgres:postgres@localhost:54322/postgres"
echo ""
echo "🔑 Default credentials:"
echo "- Email: admin@example.com"
echo "- Password: password (change this in production!)"
echo ""
echo "📝 Next steps:"
echo "1. Open Supabase Studio at http://localhost:54323"
echo "2. Create your first admin user"
echo "3. Configure authentication providers if needed"
echo "4. Update environment variables in your Next.js app"
echo ""
echo "🚀 Ready to start developing!"

# Optional: Seed data
read -p "Would you like to insert sample data for testing? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_info "Inserting sample data..."
    if [ -f "database/sample-data.sql" ]; then
        supabase db connect --local -f database/sample-data.sql
        print_status "Sample data inserted"
    else
        print_warning "No sample data file found at database/sample-data.sql"
    fi
fi

print_status "Setup complete! Happy coding!" 