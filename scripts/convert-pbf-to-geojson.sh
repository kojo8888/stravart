#!/bin/bash

echo "================================================================"
echo "   Converting Oberbayern PBF to GeoJSON (Filtered)            "
echo "================================================================"
echo ""

# Find Oberbayern PBF file (exclude filtered files)
OBERBAYERN_PBF=$(find fixtures/ -name "oberbayern*.osm.pbf" -type f | grep -v "filtered" | grep -v "highways" | head -n 1)

if [ -z "$OBERBAYERN_PBF" ]; then
  echo "❌ Error: No Oberbayern PBF file found in fixtures/"
  echo "Please ensure you have downloaded a file like oberbayern-*.osm.pbf"
  echo ""
  echo "Download from: https://download.geofabrik.de/europe/germany/bayern/oberbayern.html"
  exit 1
fi

echo "📊 Using PBF file: $OBERBAYERN_PBF"
ls -lh "$OBERBAYERN_PBF"
echo ""

echo "🔧 Step 1: Filtering highways (including connectors)..."
echo "Keeping: primary, secondary, tertiary, residential, cycleway, unclassified, service, track, path, footway, pedestrian, living_street"
echo ""

# Filter to cycling-friendly highways + major roads + connectors for connectivity
osmium tags-filter "$OBERBAYERN_PBF" \
  w/highway=primary,secondary,tertiary,residential,cycleway,unclassified,service,track,path,footway,pedestrian,living_street \
  -o fixtures/oberbayern-highways-filtered.osm.pbf \
  --overwrite

echo ""
echo "✅ Filtered PBF created!"
echo ""
echo "📊 Filtered file size:"
ls -lh fixtures/oberbayern-highways-filtered.osm.pbf

echo ""
echo "🔧 Step 2: Creating Osmium export configuration..."

# Create osmium config for GeoJSON export
cat > osmium-config.json <<EOF
{
  "attributes": {
    "type": true,
    "id": true,
    "version": false,
    "changeset": false,
    "timestamp": false,
    "uid": false,
    "user": false
  },
  "linear_tags": false,
  "area_tags": false,
  "exclude_tags": [],
  "include_tags": [
    "highway",
    "name",
    "surface",
    "maxspeed"
  ]
}
EOF

echo "✅ Configuration created (osmium-config.json)"

echo ""
echo "🔧 Step 3: Exporting to GeoJSON..."
echo "This may take 2-3 minutes..."
echo ""

# Export to GeoJSON (ways only, as LineStrings)
osmium export fixtures/oberbayern-highways-filtered.osm.pbf \
  -f geojson \
  -o fixtures/oberbayern-streets.geojson \
  --config=osmium-config.json \
  --geometry-types=linestring \
  --overwrite

echo ""
echo "✅ GeoJSON export complete!"
echo ""
echo "📊 Final GeoJSON file:"
ls -lh fixtures/oberbayern-streets.geojson

echo ""
echo "📈 Quick statistics:"
grep -c '"type": "Feature"' fixtures/oberbayern-streets.geojson | \
  xargs -I {} echo "Total street features: {}"

echo ""
echo "✅ Oberbayern street data ready for graph building!"
echo ""
echo "💡 Next step: NODE_OPTIONS=\"--max-old-space-size=8192\" npx tsx scripts/build-bavaria-graph.ts"
