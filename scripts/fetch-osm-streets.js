#!/usr/bin/env node

/**
 * Fetch street network data from OpenStreetMap for a given region
 * Saves as GeoJSON for development/testing without repeated API calls
 *
 * Usage:
 *   node scripts/fetch-osm-streets.js --preset munich
 *   node scripts/fetch-osm-streets.js --preset bavaria
 *   node scripts/fetch-osm-streets.js --bbox 48.0,11.3,48.3,11.8 --output custom.geojson
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Predefined regions
const PRESETS = {
  munich: {
    name: 'Munich Metropolitan Area',
    // Munich city center + suburbs (reasonable size for development)
    bbox: {
      south: 48.0,
      west: 11.3,
      north: 48.3,
      east: 11.9
    },
    output: 'fixtures/munich-streets.geojson'
  },
  bavaria: {
    name: 'Bavaria (Full State - may timeout!)',
    // Full Bavaria - WARNING: This is huge and may timeout
    bbox: {
      south: 47.2,
      west: 8.9,
      north: 50.6,
      east: 13.9
    },
    output: 'fixtures/bavaria-streets.geojson'
  },
  'bavaria-south': {
    name: 'Southern Bavaria (Alps region)',
    bbox: {
      south: 47.2,
      west: 10.0,
      north: 48.5,
      east: 13.0
    },
    output: 'fixtures/bavaria-south-streets.geojson'
  },
  'bavaria-central': {
    name: 'Central Bavaria (Munich region)',
    bbox: {
      south: 47.8,
      west: 10.5,
      north: 49.0,
      east: 12.5
    },
    output: 'fixtures/bavaria-central-streets.geojson'
  }
};

// Highway types optimized for cycling art routes
// Excludes busy roads (primary, secondary) and pedestrian-only paths
const HIGHWAY_TYPES = {
  // Bike-friendly roads (recommended for art routes)
  default: [
    'residential',    // Neighborhood streets - best for art routes
    'cycleway',       // Dedicated bike paths
    'tertiary',       // Smaller local roads
    'unclassified',   // Minor roads
    'service'         // Service roads (driveways, parking)
  ],
  // Include smaller paths (may be unpaved)
  withPaths: [
    'residential',
    'cycleway',
    'tertiary',
    'unclassified',
    'service',
    'track',          // Can be gravel/dirt
    'path'            // Multi-use paths
  ],
  // API route.js compatibility (current production settings)
  apiCompatible: [
    'primary',        // Major roads (busy!)
    'secondary',      // Secondary roads (still busy)
    'tertiary',
    'residential',
    'cycleway'
  ]
};

/**
 * Build Overpass QL query for fetching street network
 */
function buildOverpassQuery(bbox, options = {}) {
  const { south, west, north, east } = bbox;
  const bboxString = `${south},${west},${north},${east}`;

  // Select highway types
  const roadType = options.roadType || 'default';
  const highwayTypes = HIGHWAY_TYPES[roadType] || HIGHWAY_TYPES.default;

  // Build highway filter
  const highwayFilter = highwayTypes.join('|');

  // Build surface filter if requested
  let surfaceFilter = '';
  if (options.pavedOnly) {
    // Only include paved surfaces (asphalt, paved, concrete, paving_stones)
    surfaceFilter = '["surface"~"^(asphalt|paved|concrete|paving_stones)$"]';
  }

  return `
[out:json][timeout:300];
(
  way[highway~"^(${highwayFilter})$"]${surfaceFilter}(${bboxString});
);
out geom;
  `.trim();
}

/**
 * Fetch data from Overpass API
 */
function fetchFromOverpass(query) {
  return new Promise((resolve, reject) => {
    const url = 'https://overpass-api.de/api/interpreter';
    const postData = query;

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    console.log('🌍 Fetching data from Overpass API...');
    console.log(`📍 Query size: ${postData.length} bytes`);

    const req = https.request(url, options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
        // Show progress
        if (data.length % 100000 < chunk.length) {
          process.stdout.write(`\r📥 Downloaded: ${(data.length / 1024 / 1024).toFixed(2)} MB`);
        }
      });

      res.on('end', () => {
        console.log('\n✅ Download complete');

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          return;
        }

        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (err) {
          reject(new Error(`Failed to parse JSON: ${err.message}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Convert Overpass JSON to GeoJSON
 */
function convertToGeoJSON(overpassData) {
  console.log('🔄 Converting to GeoJSON...');

  const features = [];

  for (const element of overpassData.elements) {
    if (element.type === 'way' && element.geometry) {
      // Convert way to LineString
      const coordinates = element.geometry.map(node => [node.lon, node.lat]);

      features.push({
        type: 'Feature',
        properties: {
          osmid: element.id,
          highway: element.tags?.highway || null,
          name: element.tags?.name || null,
          ref: element.tags?.ref || null,
          surface: element.tags?.surface || null,
          maxspeed: element.tags?.maxspeed || null
        },
        geometry: {
          type: 'LineString',
          coordinates: coordinates
        }
      });
    }
  }

  console.log(`✨ Created ${features.length} street features`);

  return {
    type: 'FeatureCollection',
    features: features
  };
}

/**
 * Save GeoJSON to file
 */
function saveGeoJSON(geojson, outputPath) {
  const fullPath = path.resolve(outputPath);
  const dir = path.dirname(fullPath);

  // Create directory if it doesn't exist
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(fullPath, JSON.stringify(geojson, null, 2));

  const sizeKB = (fs.statSync(fullPath).size / 1024).toFixed(2);
  console.log(`💾 Saved to: ${fullPath}`);
  console.log(`📊 File size: ${sizeKB} KB`);
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--preset' || arg === '-p') {
      config.preset = args[++i];
    } else if (arg === '--bbox' || arg === '-b') {
      const [south, west, north, east] = args[++i].split(',').map(Number);
      config.bbox = { south, west, north, east };
    } else if (arg === '--output' || arg === '-o') {
      config.output = args[++i];
    } else if (arg === '--roads' || arg === '-r') {
      config.roadType = args[++i];
    } else if (arg === '--paved-only') {
      config.pavedOnly = true;
    } else if (arg === '--help' || arg === '-h') {
      config.help = true;
    }
  }

  return config;
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
📍 OSM Street Network Fetcher for Cycling Art Routes

Usage:
  node scripts/fetch-osm-streets.js [options]

Options:
  --preset, -p <name>          Use predefined region preset
  --bbox, -b <s,w,n,e>        Custom bounding box (south,west,north,east)
  --output, -o <path>         Output file path
  --roads, -r <type>          Road type filter (default|withPaths|apiCompatible)
  --paved-only                Only include paved surfaces (asphalt, concrete, etc.)
  --help, -h                  Show this help message

Road Type Filters:
  default (recommended)       Bike-friendly roads without busy streets
                              → residential, cycleway, tertiary, unclassified, service

  withPaths                   Includes smaller paths (may be unpaved)
                              → default + track, path

  apiCompatible               Matches current API (includes busy roads)
                              → primary, secondary, tertiary, residential, cycleway

Available Presets:
${Object.keys(PRESETS).map(key => {
  const preset = PRESETS[key];
  const bbox = preset.bbox;
  return `  ${key.padEnd(20)} ${preset.name}
                        BBox: ${bbox.south},${bbox.west},${bbox.north},${bbox.east}
                        Output: ${preset.output}`;
}).join('\n\n')}

Examples:
  # Fetch Bavaria (bike-friendly roads only, recommended)
  node scripts/fetch-osm-streets.js --preset bavaria-central

  # Fetch Munich with paved roads only
  node scripts/fetch-osm-streets.js --preset munich --paved-only

  # Fetch with all paths included (unpaved trails too)
  node scripts/fetch-osm-streets.js --preset munich --roads withPaths

  # Fetch matching current API behavior
  node scripts/fetch-osm-streets.js --preset bavaria-central --roads apiCompatible

Notes:
  - 'default' road type excludes busy primary/secondary roads (safer for cycling art)
  - '--paved-only' filters by surface tag (may miss roads without surface data)
  - Larger regions may timeout (Overpass has 300s timeout)
  - Recommend 'bavaria-central' for development (good coverage, reasonable size)
`);
}

/**
 * Main execution
 */
async function main() {
  const config = parseArgs();

  if (config.help) {
    showHelp();
    return;
  }

  // Determine bbox and output
  let bbox, output, regionName;

  if (config.preset) {
    const preset = PRESETS[config.preset];
    if (!preset) {
      console.error(`❌ Unknown preset: ${config.preset}`);
      console.log(`Available presets: ${Object.keys(PRESETS).join(', ')}`);
      process.exit(1);
    }
    bbox = preset.bbox;
    output = config.output || preset.output;
    regionName = preset.name;
  } else if (config.bbox) {
    bbox = config.bbox;
    output = config.output || 'fixtures/custom-streets.geojson';
    regionName = 'Custom Region';
  } else {
    console.error('❌ Please specify --preset or --bbox');
    console.log('Run with --help for usage information');
    process.exit(1);
  }

  // Build query options
  const queryOptions = {
    roadType: config.roadType || 'default',
    pavedOnly: config.pavedOnly || false
  };

  const roadTypes = HIGHWAY_TYPES[queryOptions.roadType] || HIGHWAY_TYPES.default;

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           OSM Street Network Fetcher                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\n📍 Region: ${regionName}`);
  console.log(`📦 BBox: ${bbox.south},${bbox.west} → ${bbox.north},${bbox.east}`);
  console.log(`🚴 Road types: ${queryOptions.roadType} (${roadTypes.join(', ')})`);
  console.log(`🛣️  Paved only: ${queryOptions.pavedOnly ? 'Yes' : 'No'}`);
  console.log(`💾 Output: ${output}\n`);

  try {
    // Build query
    const query = buildOverpassQuery(bbox, queryOptions);

    // Fetch from Overpass
    const overpassData = await fetchFromOverpass(query);

    // Convert to GeoJSON
    const geojson = convertToGeoJSON(overpassData);

    // Save to file
    saveGeoJSON(geojson, output);

    console.log('\n✅ Success! Street data fetched and saved.');
    console.log(`\n💡 You can now use this fixture in development mode to avoid API calls.`);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { buildOverpassQuery, convertToGeoJSON };
