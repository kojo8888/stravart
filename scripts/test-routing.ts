import path from 'path'
import { buildGraphFromGeoJSON } from '../lib/graph/builder.js'
import { SpatialIndex } from '../lib/graph/spatial-index.js'
import { findRoute, findRouteByCoordinates, getRouteStats, areNodesConnected } from '../lib/graph/router.js'
import { formatDistance, formatDuration } from '../lib/graph/utils.js'

console.log('╔════════════════════════════════════════════════════════════╗')
console.log('║         Testing A* Pathfinding on Bavaria Graph           ║')
console.log('╚════════════════════════════════════════════════════════════╝')
console.log('')

const GEOJSON_PATH = path.join(process.cwd(), 'fixtures/oberbayern-streets.geojson')

async function testRouting() {
    try {
        // Build graph
        console.log('🔧 Building Bavaria graph...')
        const graphStart = Date.now()
        const graph = await buildGraphFromGeoJSON(GEOJSON_PATH)
        const graphTime = (Date.now() - graphStart) / 1000
        console.log(`✅ Graph built in ${graphTime.toFixed(2)}s`)
        console.log('')

        // Build spatial index
        console.log('🔧 Building spatial index...')
        const spatialIndex = new SpatialIndex(graph)
        console.log('')

        // Test locations in Munich
        const testRoutes = [
            {
                name: 'Munich: Marienplatz → Olympiapark',
                start: { lat: 48.1374, lng: 11.5755 }, // Marienplatz
                end: { lat: 48.1741, lng: 11.5516 },   // Olympiapark
            },
            {
                name: 'Munich: Hauptbahnhof → English Garden',
                start: { lat: 48.1401, lng: 11.5583 }, // Hauptbahnhof
                end: { lat: 48.1642, lng: 11.6050 },   // English Garden
            },
            {
                name: 'Munich: Short route (1km)',
                start: { lat: 48.1351, lng: 11.5820 }, // Center
                end: { lat: 48.1450, lng: 11.5820 },   // 1km north
            },
        ]

        console.log('🧪 Testing routes...')
        console.log('')

        for (let i = 0; i < testRoutes.length; i++) {
            const test = testRoutes[i]
            console.log(`═══ Test ${i + 1}/${testRoutes.length}: ${test.name} ═══`)
            console.log('')

            // Find nearest nodes
            console.log('📍 Finding nearest nodes...')
            const startNode = spatialIndex.findNearest(test.start)
            const endNode = spatialIndex.findNearest(test.end)

            if (!startNode || !endNode) {
                console.log('❌ Could not find nodes')
                console.log('')
                continue
            }

            console.log(`   Start: ${startNode.nodeId} (${startNode.distance.toFixed(2)}m away)`)
            console.log(`   End:   ${endNode.nodeId} (${endNode.distance.toFixed(2)}m away)`)
            console.log('')

            // Check connectivity
            console.log('🔗 Checking connectivity...')
            const connectedStart = Date.now()
            const connected = areNodesConnected(graph, startNode.nodeId, endNode.nodeId)
            const connectedTime = Date.now() - connectedStart
            console.log(`   ${connected ? '✅' : '❌'} Nodes ${connected ? 'are' : 'are NOT'} connected (checked in ${connectedTime}ms)`)
            console.log('')

            if (!connected) {
                console.log('⚠️  Skipping route - nodes in different components')
                console.log('')
                continue
            }

            // Find route
            console.log('🛣️  Finding route...')
            const routeStart = Date.now()
            const route = findRoute(graph, startNode.nodeId, endNode.nodeId)
            const routeTime = Date.now() - routeStart

            if (!route) {
                console.log('❌ No route found')
                console.log('')
                continue
            }

            console.log(`✅ Route found in ${routeTime}ms`)
            console.log('')

            // Display stats
            const stats = getRouteStats(route)
            console.log('📊 Route Statistics:')
            console.log(`   - Nodes: ${stats.nodes.toLocaleString()}`)
            console.log(`   - Distance: ${formatDistance(stats.distance)} (${stats.distanceKm}km)`)
            console.log(`   - Avg segment: ${stats.avgSegmentLength}m`)
            console.log(`   - Time: ${routeTime}ms`)
            console.log('')

            // Show first/last few nodes
            console.log('🗺️  Route preview:')
            const previewCount = Math.min(3, route.coordinates.length)
            for (let j = 0; j < previewCount; j++) {
                const coord = route.coordinates[j]
                console.log(`   ${j + 1}. ${coord.lat.toFixed(6)}, ${coord.lng.toFixed(6)}`)
            }
            if (route.coordinates.length > 6) {
                console.log(`   ... (${route.coordinates.length - 6} nodes)`)
            }
            for (let j = Math.max(previewCount, route.coordinates.length - 3); j < route.coordinates.length; j++) {
                const coord = route.coordinates[j]
                console.log(`   ${j + 1}. ${coord.lat.toFixed(6)}, ${coord.lng.toFixed(6)}`)
            }
            console.log('')
        }

        console.log('✅ All routing tests complete!')
        console.log('')
        console.log('💡 Next steps:')
        console.log('   1. Implement shape-to-waypoints converter')
        console.log('   2. Build waypoint router')
        console.log('   3. Test with actual shapes (heart, circle, etc.)')

    } catch (error) {
        console.error('')
        console.error('❌ Error during testing:', error)
        process.exit(1)
    }
}

testRouting()
