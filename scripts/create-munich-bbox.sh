#!/bin/bash

# Create a Munich-focused street network (20km radius from city center)
# This is much smaller and faster for development/testing

set -e

echo "================================================================"
echo "   Creating Munich Bounding Box Street Network (20km radius)"
echo "================================================================"
echo ""

# Munich center coordinates
MUNICH_LAT=48.1351
MUNICH_LNG=11.5820
RADIUS_KM=20

# Calculate bounding box (approximate)
# 1 degree latitude ≈ 111 km
# 1 degree longitude ≈ 111 km * cos(latitude)
LAT_OFFSET=$(echo "scale=6; $RADIUS_KM / 111" | bc)
LNG_OFFSET=$(echo "scale=6; $RADIUS_KM / (111 * c(48.1351 * 3.14159265359 / 180))" | bc -l)

MIN_LAT=$(echo "scale=6; $MUNICH_LAT - $LAT_OFFSET" | bc)
MAX_LAT=$(echo "scale=6; $MUNICH_LAT + $LAT_OFFSET" | bc)
MIN_LNG=$(echo "scale=6; $MUNICH_LNG - $LNG_OFFSET" | bc)
MAX_LNG=$(echo "scale=6; $MUNICH_LNG + $LNG_OFFSET" | bc)

echo "📍 Munich Center: $MUNICH_LAT, $MUNICH_LNG"
echo "📏 Radius: ${RADIUS_KM}km"
echo "📦 Bounding Box:"
echo "   Latitude:  $MIN_LAT to $MAX_LAT"
echo "   Longitude: $MIN_LNG to $MAX_LNG"
echo ""

# Find Oberbayern PBF file
OBERBAYERN_PBF=$(find fixtures/ -name "oberbayern*.osm.pbf" -type f | grep -v "filtered" | grep -v "highways" | grep -v "munich" | head -n 1)

if [ -z "$OBERBAYERN_PBF" ]; then
    echo "❌ Error: Oberbayern PBF file not found in fixtures/"
    echo "   Please download it first"
    exit 1
fi

echo "📁 Source file: $OBERBAYERN_PBF"
echo "   Size: $(du -h "$OBERBAYERN_PBF" | cut -f1)"
echo ""

# Step 1: Extract Munich bounding box
echo "🔧 Step 1/3: Extracting Munich bounding box from Oberbayern..."
osmium extract \
    --bbox "$MIN_LNG,$MIN_LAT,$MAX_LNG,$MAX_LAT" \
    --strategy complete_ways \
    "$OBERBAYERN_PBF" \
    -o fixtures/munich-bbox.osm.pbf \
    --overwrite

BBOX_SIZE=$(du -h fixtures/munich-bbox.osm.pbf | cut -f1)
echo "✅ Extracted to fixtures/munich-bbox.osm.pbf ($BBOX_SIZE)"
echo ""

# Step 2: Filter to cycling-friendly highways
echo "🔧 Step 2/3: Filtering to cycling-friendly highways..."
osmium tags-filter fixtures/munich-bbox.osm.pbf \
  w/highway=primary,secondary,tertiary,residential,cycleway,unclassified,service,track,path,footway,pedestrian,living_street \
  -o fixtures/munich-highways-filtered.osm.pbf \
  --overwrite

HIGHWAYS_SIZE=$(du -h fixtures/munich-highways-filtered.osm.pbf | cut -f1)
echo "✅ Filtered to fixtures/munich-highways-filtered.osm.pbf ($HIGHWAYS_SIZE)"
echo ""

# Step 3: Convert to GeoJSON
echo "🔧 Step 3/3: Converting to GeoJSON..."
osmium export fixtures/munich-highways-filtered.osm.pbf \
  --geometry-types=linestring \
  --output-format=geojson \
  -o fixtures/munich-streets.geojson \
  --overwrite

GEOJSON_SIZE=$(du -h fixtures/munich-streets.geojson | cut -f1)
echo "✅ Converted to fixtures/munich-streets.geojson ($GEOJSON_SIZE)"
echo ""

# Count features
FEATURE_COUNT=$(grep -o '"type":"Feature"' fixtures/munich-streets.geojson | wc -l | tr -d ' ')

echo "================================================================"
echo "                   Success! 🎉"
echo "================================================================"
echo ""
echo "📊 Munich Street Network Statistics:"
echo "   - Bounding box: ${RADIUS_KM}km radius from Munich center"
echo "   - PBF size: $BBOX_SIZE → $HIGHWAYS_SIZE (filtered)"
echo "   - GeoJSON size: $GEOJSON_SIZE"
echo "   - Street features: $FEATURE_COUNT"
echo ""
echo "📁 Output files:"
echo "   - fixtures/munich-bbox.osm.pbf (full extract)"
echo "   - fixtures/munich-highways-filtered.osm.pbf (highways only)"
echo "   - fixtures/munich-streets.geojson (final GeoJSON)"
echo ""
echo "💡 Next steps:"
echo "   1. Update API to use fixtures/munich-streets.geojson"
echo "   2. Update bounds check to Munich area only"
echo "   3. Test with: npm run dev"
echo ""
echo "⚠️  Old Oberbayern files are preserved (not deleted)"
echo ""
