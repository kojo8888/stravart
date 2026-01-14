import path from 'path'
import fs from 'fs'
import { buildGraphFromGeoJSON } from '../lib/graph/builder.js'
import { SpatialIndex } from '../lib/graph/spatial-index.js'
import { generateWaypointsForShape, getWaypointStats } from '../lib/graph/shape-to-waypoints.js'
import { routeThroughWaypoints, getRouteStatistics, routeToGeoJSON } from '../lib/graph/waypoint-router.js'

console.log('================================================================')
console.log('       Testing Complete Shape Routing Pipeline             ')
console.log('================================================================')
console.log('')

const GEOJSON_PATH = path.join(process.cwd(), 'fixtures/oberbayern-streets.geojson')
const OUTPUT_DIR = path.join(process.cwd(), 'test-outputs')

async function testShapeRouting() {
    try {
        // Ensure output directory exists
        if (!fs.existsSync(OUTPUT_DIR)) {
            fs.mkdirSync(OUTPUT_DIR, { recursive: true })
        }

        // Build graph
        console.log('🔧 Building Bavaria graph...')
        const graphStart = Date.now()
        const graph = await buildGraphFromGeoJSON(GEOJSON_PATH, {
            mergeThreshold: 20, // Merge nodes within 20 meters for better connectivity
        })
        const graphTime = (Date.now() - graphStart) / 1000
        console.log(`✅ Graph built in ${graphTime.toFixed(2)}s`)
        console.log('')

        // Build spatial index (filter to largest connected component)
        console.log('🔧 Building spatial index...')
        const spatialIndex = new SpatialIndex(graph, { filterToLargestComponent: true })
        console.log('')

        // Test shapes in Munich
        const testShapes = [
            {
                name: 'Small Circle (500m radius)',
                type: 'circle' as const,
                center: { lat: 48.1351, lng: 11.5820 }, // Munich center
                radius: 500,
                pointCount: 50,
                waypointCount: 8,
            },
            {
                name: 'Medium Heart (1km radius)',
                type: 'heart' as const,
                center: { lat: 48.1351, lng: 11.5820 },
                radius: 1000,
                pointCount: 100,
                waypointCount: 16,
            },
            {
                name: 'Large Star (2km radius)',
                type: 'star' as const,
                center: { lat: 48.1351, lng: 11.5820 },
                radius: 2000,
                pointCount: 100,
                waypointCount: 20,
            },
        ]

        console.log(`🧪 Testing ${testShapes.length} shapes...`)
        console.log('')

        for (let i = 0; i < testShapes.length; i++) {
            const test = testShapes[i]
            console.log(`=== Test ${i + 1}/${testShapes.length}: ${test.name} ===`)
            console.log('')

            // Generate waypoints for shape
            console.log('📍 Generating waypoints...')
            const waypoints = generateWaypointsForShape(
                test.type,
                test.center,
                test.radius,
                test.pointCount,
                test.waypointCount
            )

            const waypointStats = getWaypointStats(waypoints)
            console.log(`   - Waypoints: ${waypointStats.count}`)
            console.log(`   - Perimeter: ${(waypointStats.perimeter / 1000).toFixed(2)}km`)
            console.log(`   - Avg distance: ${waypointStats.avgDistance}m`)
            console.log('')

            // Route through waypoints
            console.log('🛣️  Routing through waypoints...')
            const routeStart = Date.now()

            let successCount = 0
            let failCount = 0

            const route = routeThroughWaypoints(graph, spatialIndex, waypoints, {
                closeLoop: true,
                skipUnreachable: true,
                onProgress: (current, total) => {
                    if (current % 5 === 0 || current === total) {
                        process.stdout.write(`\r   Progress: ${current}/${total} segments`)
                    }
                },
            })

            process.stdout.write('\n')

            if (!route) {
                console.log('❌ Failed to create route')
                console.log('')
                continue
            }

            const routeTime = Date.now() - routeStart
            console.log(`✅ Route created in ${(routeTime / 1000).toFixed(2)}s`)
            console.log('')

            // Display statistics
            const stats = getRouteStatistics(route)
            console.log('📊 Route Statistics:')
            console.log(`   - Waypoints: ${stats.waypoints}`)
            console.log(`   - Segments: ${stats.segments}`)
            console.log(`   - Total nodes: ${stats.totalNodes.toLocaleString()}`)
            console.log(`   - Total distance: ${stats.totalDistanceKm}km`)
            console.log(`   - Avg segment: ${(stats.avgSegmentDistance / 1000).toFixed(2)}km`)
            console.log(`   - Min segment: ${(stats.minSegmentDistance / 1000).toFixed(2)}km`)
            console.log(`   - Max segment: ${(stats.maxSegmentDistance / 1000).toFixed(2)}km`)
            console.log('')

            // Calculate success rate
            const successRate = ((stats.segments / waypoints.length) * 100).toFixed(1)
            console.log(`✅ Success rate: ${successRate}% (${stats.segments}/${waypoints.length} segments)`)
            console.log('')

            // Save to GeoJSON
            const outputFile = path.join(OUTPUT_DIR, `${test.type}-${test.radius}m.geojson`)
            const geojson = routeToGeoJSON(route)
            fs.writeFileSync(outputFile, JSON.stringify(geojson, null, 2))
            console.log(`💾 Saved to: ${outputFile}`)
            console.log('')

            // Performance summary
            console.log('⚡ Performance:')
            console.log(`   - Route generation: ${(routeTime / 1000).toFixed(2)}s`)
            console.log(`   - Time per segment: ${(routeTime / stats.segments).toFixed(0)}ms`)
            console.log('')
        }

        console.log('================================================================')
        console.log('                  All Tests Complete!                       ')
        console.log('================================================================')
        console.log('')
        console.log('📁 Output files saved to:', OUTPUT_DIR)
        console.log('')
        console.log('💡 Next steps:')
        console.log('   1. Visualize routes at https://geojson.io')
        console.log('   2. Integrate with Next.js API')
        console.log('   3. Add UI for shape selection')
        console.log('   4. Compare performance with old algorithm')

    } catch (error) {
        console.error('')
        console.error('❌ Error during testing:', error)
        process.exit(1)
    }
}

testShapeRouting()
