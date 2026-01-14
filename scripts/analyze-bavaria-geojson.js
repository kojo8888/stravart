const fs = require('fs')
const readline = require('readline')

console.log('╔════════════════════════════════════════════════════════════╗')
console.log('║       Analyzing Bavaria GeoJSON Street Data               ║')
console.log('╚════════════════════════════════════════════════════════════╝')
console.log('')

console.log('📊 File information:')
const stats = fs.statSync('fixtures/bavaria-streets.geojson')
console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`)

console.log('')
console.log('📂 Using streaming analysis (file too large for memory)...')

// Use shell commands for efficient analysis
const { execSync } = require('child_process')

console.log('')
console.log('=== Quick Statistics ===')

// Count features
const featureCount = execSync(
  'grep -o \'{"type":"Feature"\' fixtures/bavaria-streets.geojson | wc -l'
).toString().trim()
console.log('Total features:', parseInt(featureCount).toLocaleString())

// Check geometry types
console.log('')
console.log('=== Geometry Types ===')
const geomTypes = execSync(
  'grep -o \'"type":"[A-Za-z]*"\' fixtures/bavaria-streets.geojson | sort | uniq -c | head -n 20'
).toString()
console.log(geomTypes)

// Sample first feature (in first 5000 chars)
console.log('=== Sample Feature (first occurrence) ===')
const sample = execSync(
  'head -c 5000 fixtures/bavaria-streets.geojson | grep -o \'{"type":"Feature"[^}]*},"properties"[^}]*}}\' | head -n 1'
).toString()

if (sample) {
  try {
    const parsed = JSON.parse(sample)
    console.log(JSON.stringify(parsed, null, 2))
  } catch (e) {
    console.log('(Sample feature too complex to display cleanly)')
    console.log(sample.substring(0, 300) + '...')
  }
}

// Count highway types (sample first 10MB)
console.log('')
console.log('=== Highway Type Distribution (from sample) ===')
const highwayTypes = execSync(
  'head -c 10485760 fixtures/bavaria-streets.geojson | grep -o \'"highway":"[^"]*"\' | sort | uniq -c | sort -rn'
).toString()
console.log(highwayTypes)

// Get coordinate bounds (sample)
console.log('')
console.log('=== Coordinate Bounds (approximate from sample) ===')
const coordSample = execSync(
  'head -c 10485760 fixtures/bavaria-streets.geojson | grep -o \'\\[[0-9.]*,[0-9.]*\\]\' | head -n 1000'
).toString()

const coords = coordSample.split('\n')
  .filter(line => line.trim())
  .map(line => {
    const match = line.match(/\[([0-9.]+),([0-9.]+)\]/)
    if (match) {
      return [parseFloat(match[1]), parseFloat(match[2])]
    }
    return null
  })
  .filter(Boolean)

if (coords.length > 0) {
  const lngs = coords.map(c => c[0])
  const lats = coords.map(c => c[1])
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)

  console.log(`Longitude: ${minLng.toFixed(4)} to ${maxLng.toFixed(4)}`)
  console.log(`Latitude:  ${minLat.toFixed(4)} to ${maxLat.toFixed(4)}`)
  console.log(`(Sample size: ${coords.length} coordinates)`)
}

console.log('')
console.log('=== Coverage Area ===')
console.log('This includes major cities:')
console.log('- Munich (München)')
console.log('- Nuremberg (Nürnberg)')
console.log('- Augsburg')
console.log('- Regensburg')
console.log('- Würzburg')
console.log('- And entire Bavaria!')

console.log('')
console.log('✅ Analysis complete!')
console.log('')
console.log('💡 For graph building, this file will be processed in chunks')
console.log('   to avoid memory issues.')
