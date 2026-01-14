import path from 'path'
import { buildGraphFromGeoJSON, getGraphStats } from '../lib/graph/builder.js'
import { saveGraphToCache } from '../lib/graph/cache.js'
import { SpatialIndex } from '../lib/graph/spatial-index.js'

console.log('================================================================')
console.log('       Building Oberbayern Street Network Graph               ')
console.log('================================================================')
console.log('')

const GEOJSON_PATH = path.join(process.cwd(), 'fixtures/oberbayern-streets.geojson')
const CACHE_FILENAME = 'oberbayern-graph.json'

async function buildGraph() {
    try {
        // Build graph from GeoJSON
        const graph = await buildGraphFromGeoJSON(GEOJSON_PATH, {
            mergeThreshold: 20, // Merge nodes within 20 meters
            onProgress: (progress) => {
                // Progress callback (optional)
                if (progress.processed % 50000 === 0) {
                    const percent = ((progress.processed / progress.total) * 100).toFixed(1)
                    console.log(`   ${percent}% - ${progress.phase}`)
                }
            },
        })

        console.log('')
        console.log('📊 Graph Statistics:')
        const stats = getGraphStats(graph)
        console.log(`   - Total nodes: ${stats.nodes.toLocaleString()}`)
        console.log(`   - Total edges: ${stats.edges.toLocaleString()}`)
        console.log(`   - Avg degree: ${stats.avgDegree}`)
        console.log(`   - Max degree: ${stats.maxDegree}`)
        console.log(`   - Min degree: ${stats.minDegree}`)

        // Build spatial index
        console.log('')
        const spatialIndex = new SpatialIndex(graph)

        // Test nearest node search
        console.log('')
        console.log('🧪 Testing spatial index...')
        const testCoord = { lat: 48.1351, lng: 11.5820 } // Munich city center
        const nearest = spatialIndex.findNearest(testCoord)
        if (nearest) {
            console.log(`   - Nearest node to Munich center: ${nearest.nodeId}`)
            console.log(`   - Distance: ${nearest.distance.toFixed(2)}m`)
        }

        // Skip caching for now (graph too large for JSON.stringify)
        // TODO: Implement SQLite or binary format caching
        console.log('')
        console.log('⚠️  Skipping cache (graph too large for JSON format)')
        console.log('   Graph builds quickly enough for development')

        console.log('')
        console.log('✅ Oberbayern graph ready for routing!')
        console.log('')
        console.log('💡 Next steps:')
        console.log('   1. Test routing with improved connectivity')
        console.log('   2. Run: NODE_OPTIONS="--max-old-space-size=8192" npx tsx scripts/test-shape-routing.ts')
        console.log('   3. Verify higher success rates with primary/secondary roads')
    } catch (error) {
        console.error('')
        console.error('❌ Error building graph:', error)
        process.exit(1)
    }
}

buildGraph()
