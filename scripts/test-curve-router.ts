/**
 * Test script for curve-following router
 *
 * This tests the new routing algorithm that follows shape curves
 * instead of taking shortcuts.
 *
 * Run with: NODE_OPTIONS="--max-old-space-size=4096" npx tsx scripts/test-curve-router.ts
 */

import { buildGraphFromGeoJSON } from '../lib/graph/builder'
import { SpatialIndex } from '../lib/graph/spatial-index'
import {
    routeShapeWithCurveFollowing,
    segmentsToGeoJSON,
    findNodesInCorridor
} from '../lib/graph/curve-router'
import { generateWaypointsForShape } from '../lib/graph/shape-to-waypoints'
import fs from 'fs'
import path from 'path'

// Munich center
const MUNICH_CENTER = { lat: 48.1351, lng: 11.5820 }

// Test parameters
const SHAPE_RADIUS_METERS = 1500  // 1.5km radius heart
const WAYPOINT_COUNT = 40         // Number of waypoints around the shape
const CORRIDOR_WIDTH = 300        // 300m corridor around shape
const DIRECTION_PENALTY = 0.6     // Penalty for deviating from shape direction

async function main() {
    console.log('🎨 Strava Art - Curve Following Router Test')
    console.log('==========================================')
    console.log('')
    console.log(`📍 Center: Munich (${MUNICH_CENTER.lat}, ${MUNICH_CENTER.lng})`)
    console.log(`❤️  Shape: Heart`)
    console.log(`📏 Radius: ${SHAPE_RADIUS_METERS}m`)
    console.log(`🎯 Waypoints: ${WAYPOINT_COUNT}`)
    console.log(`🛤️  Corridor width: ${CORRIDOR_WIDTH}m`)
    console.log(`⚖️  Direction penalty: ${DIRECTION_PENALTY}`)
    console.log('')

    // Check for Munich streets GeoJSON
    const geojsonPath = path.join(process.cwd(), 'fixtures', 'munich-streets.geojson')
    if (!fs.existsSync(geojsonPath)) {
        console.error(`❌ Munich streets file not found: ${geojsonPath}`)
        console.error('   Please ensure fixtures/munich-streets.geojson exists')
        process.exit(1)
    }

    // Build graph
    console.log('📦 Building graph from Munich streets...')
    const startBuild = Date.now()
    const graph = await buildGraphFromGeoJSON(geojsonPath)
    const buildTime = (Date.now() - startBuild) / 1000
    console.log(`✅ Graph built in ${buildTime.toFixed(2)}s`)
    console.log(`   Nodes: ${graph.order.toLocaleString()}`)
    console.log(`   Edges: ${graph.size.toLocaleString()}`)
    console.log('')

    // Build spatial index
    console.log('🔍 Building spatial index...')
    const startIndex = Date.now()
    const spatialIndex = new SpatialIndex(graph, { filterToLargestComponent: true })
    const indexTime = (Date.now() - startIndex) / 1000
    console.log(`✅ Spatial index built in ${indexTime.toFixed(2)}s`)
    console.log('')

    // Generate heart shape points (for corridor and direction calculation)
    console.log('❤️  Generating heart shape...')
    const shapePoints = generateWaypointsForShape(
        'heart',
        MUNICH_CENTER,
        SHAPE_RADIUS_METERS,
        200  // Dense points for accurate corridor/direction
    ).map(wp => ({ lat: wp.lat, lng: wp.lng }))
    console.log(`   Generated ${shapePoints.length} shape points`)

    // Generate waypoints (sparser, for actual routing)
    const waypoints = generateWaypointsForShape(
        'heart',
        MUNICH_CENTER,
        SHAPE_RADIUS_METERS,
        100,  // Initial point count
        WAYPOINT_COUNT
    ).map(wp => ({ lat: wp.lat, lng: wp.lng }))
    console.log(`   Generated ${waypoints.length} waypoints for routing`)
    console.log('')

    // Find nodes in corridor (for diagnostics)
    console.log('📦 Analyzing corridor...')
    const corridorNodes = findNodesInCorridor(graph, shapePoints, CORRIDOR_WIDTH)
    console.log(`   ${corridorNodes.size.toLocaleString()} nodes in ${CORRIDOR_WIDTH}m corridor`)
    const corridorPercent = ((corridorNodes.size / graph.order) * 100).toFixed(1)
    console.log(`   (${corridorPercent}% of total graph)`)
    console.log('')

    // Route using curve-following algorithm
    console.log('🛣️  Routing with curve-following algorithm...')
    const startRoute = Date.now()

    const segments = routeShapeWithCurveFollowing(
        graph,
        waypoints,
        shapePoints,
        (coord) => spatialIndex.findNearest(coord),
        {
            corridorWidth: CORRIDOR_WIDTH,
            directionPenalty: DIRECTION_PENALTY,
            closeLoop: true,
            onProgress: (current, total) => {
                if (current % 10 === 0 || current === total) {
                    console.log(`   Progress: ${current}/${total} segments`)
                }
            }
        }
    )

    const routeTime = (Date.now() - startRoute) / 1000

    if (!segments || segments.length === 0) {
        console.error('❌ Routing failed - no segments generated')
        process.exit(1)
    }

    console.log('')
    console.log(`✅ Routing complete in ${routeTime.toFixed(2)}s`)

    // Calculate statistics
    const totalDistance = segments.reduce((sum, s) => sum + s.distance, 0)
    const totalNodes = segments.reduce((sum, s) => sum + s.coordinates.length, 0)

    console.log('')
    console.log('📊 Route Statistics:')
    console.log(`   Total distance: ${(totalDistance / 1000).toFixed(2)} km`)
    console.log(`   Segments: ${segments.length}`)
    console.log(`   Total nodes: ${totalNodes}`)
    console.log(`   Avg segment length: ${(totalDistance / segments.length / 1000).toFixed(2)} km`)
    console.log('')

    // Convert to GeoJSON
    const geojson = segmentsToGeoJSON(segments)

    // Add shape outline for visualization
    const shapeOutlineFeature = {
        type: 'Feature' as const,
        properties: {
            type: 'shape-outline',
            description: 'Original heart shape'
        },
        geometry: {
            type: 'LineString' as const,
            coordinates: [...shapePoints, shapePoints[0]].map(p => [p.lng, p.lat])
        }
    }

    // Add waypoints for visualization
    const waypointFeatures = waypoints.map((wp, i) => ({
        type: 'Feature' as const,
        properties: {
            type: 'waypoint',
            index: i
        },
        geometry: {
            type: 'Point' as const,
            coordinates: [wp.lng, wp.lat]
        }
    }))

    // Combine all features
    const fullGeojson = {
        type: 'FeatureCollection' as const,
        properties: {
            ...geojson.properties,
            shapeType: 'heart',
            center: MUNICH_CENTER,
            radiusMeters: SHAPE_RADIUS_METERS,
            corridorWidth: CORRIDOR_WIDTH,
            directionPenalty: DIRECTION_PENALTY,
            waypointCount: waypoints.length,
            generatedAt: new Date().toISOString()
        },
        features: [
            shapeOutlineFeature,
            ...waypointFeatures,
            ...geojson.features
        ]
    }

    // Save output
    const outputDir = path.join(process.cwd(), 'test-outputs')
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
    }

    const outputPath = path.join(outputDir, 'curve-router-test.geojson')
    fs.writeFileSync(outputPath, JSON.stringify(fullGeojson, null, 2))

    console.log(`💾 Output saved to: ${outputPath}`)
    console.log('')
    console.log('📌 To visualize:')
    console.log('   1. Open https://geojson.io')
    console.log('   2. Drag and drop the GeoJSON file')
    console.log('   3. Or paste the file contents')
    console.log('')
    console.log('🎉 Test complete!')
}

main().catch(console.error)
