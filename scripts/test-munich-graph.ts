import path from 'path'
import { buildGraphFromGeoJSON } from '../lib/graph/builder.js'
import { SpatialIndex } from '../lib/graph/spatial-index.js'
import { connectedComponents } from 'graphology-components'

console.log('================================================================')
console.log('         Testing Munich-Only Graph Build                   ')
console.log('================================================================')
console.log('')

const GEOJSON_PATH = path.join(process.cwd(), 'fixtures/munich-streets.geojson')

async function testMunichGraph() {
    try {
        // Build graph
        console.log('🔧 Building Munich graph...')
        const startTime = Date.now()

        const graph = await buildGraphFromGeoJSON(GEOJSON_PATH, {
            mergeThreshold: 20,
        })

        const buildTime = (Date.now() - startTime) / 1000
        console.log('')
        console.log(`⏱️  Graph built in ${buildTime.toFixed(1)}s`)
        console.log('')

        // Basic stats
        console.log('📊 Graph Statistics:')
        console.log(`   - Nodes: ${graph.order.toLocaleString()}`)
        console.log(`   - Edges: ${graph.size.toLocaleString()}`)
        console.log(`   - Avg degree: ${(graph.size * 2 / graph.order).toFixed(2)}`)
        console.log('')

        // Build spatial index
        console.log('🔧 Building spatial index with component filtering...')
        const indexStart = Date.now()
        const spatialIndex = new SpatialIndex(graph, {
            filterToLargestComponent: true,
        })
        const indexTime = (Date.now() - indexStart) / 1000
        console.log(`⏱️  Spatial index built in ${indexTime.toFixed(1)}s`)
        console.log('')

        // Total time
        const totalTime = buildTime + indexTime
        console.log('📊 Performance Summary:')
        console.log(`   - Graph build: ${buildTime.toFixed(1)}s`)
        console.log(`   - Spatial index: ${indexTime.toFixed(1)}s`)
        console.log(`   - Total: ${totalTime.toFixed(1)}s`)
        console.log('')

        // Compare to Oberbayern
        console.log('📊 Comparison to Full Oberbayern:')
        console.log('   Oberbayern: 243K nodes, 40s build time')
        console.log(`   Munich:     ${Math.round(graph.order / 1000)}K nodes, ${Math.round(totalTime)}s build time`)
        console.log(`   Speedup:    ${(40 / totalTime).toFixed(1)}x faster! 🚀`)
        console.log('')

        // Memory estimate
        const estimatedMemoryMB = Math.round((graph.order * 200) / (1024 * 1024))
        console.log(`💾 Estimated memory usage: ~${estimatedMemoryMB}MB`)
        console.log('')

        console.log('✅ Munich graph is ready for use!')
        console.log('')
        console.log('💡 To use it:')
        console.log('   1. API already configured to use munich-streets.geojson')
        console.log('   2. Start server: npm run dev')
        console.log('   3. Test in Munich area (48.1351, 11.5820)')
        console.log('   4. First request will build graph (~15s)')
        console.log('   5. Subsequent requests: <10ms')

    } catch (error) {
        console.error('')
        console.error('❌ Error:', error)
        process.exit(1)
    }
}

testMunichGraph()
