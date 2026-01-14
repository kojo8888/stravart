/**
 * Graph builder - Converts GeoJSON street data into a graph structure
 */

import Graph from 'graphology'
import fs from 'fs'
import { pipeline } from 'stream/promises'
import { chain } from 'stream-chain'
import { parser } from 'stream-json'
import { streamArray } from 'stream-json/streamers/StreamArray'
import { pick } from 'stream-json/filters/Pick'
import RBush from 'rbush'
import type {
    StreetGraph,
    StreetNode,
    StreetEdge,
    StreetFeature,
    GraphBuildOptions,
} from './types'
import { haversineDistance, coordToNodeId, nodeIdToCoord, calculateBoundingBox } from './utils'

/**
 * Build a street network graph from GeoJSON file (streaming approach)
 * Only creates nodes at intersections to avoid Map size limits
 */
export async function buildGraphFromGeoJSON(
    geojsonPath: string,
    options: GraphBuildOptions = {}
): Promise<StreetGraph> {
    const { mergeThreshold = 5, onProgress } = options

    console.log('🔧 Building graph from GeoJSON (2-pass approach)...')
    console.log(`📁 File: ${geojsonPath}`)
    console.log('')

    // Pass 1: Find all intersection points (coordinates that appear in multiple ways or as endpoints)
    console.log('📊 Pass 1/2: Finding intersections...')
    const coordCounts = new Map<string, number>()
    let pass1Count = 0
    const pass1Start = Date.now()

    const stream1 = chain([
        fs.createReadStream(geojsonPath),
        parser(),
        pick({ filter: 'features' }),
        streamArray(),
    ])

    for await (const { value } of stream1 as any) {
        const feature = value as StreetFeature
        if (feature.geometry?.type !== 'LineString' || !feature.geometry.coordinates) continue

        const coords = feature.geometry.coordinates
        if (coords.length < 2) continue

        // Count first and last coordinates (endpoints are always intersections)
        const firstId = coordToNodeId(coords[0][1], coords[0][0])
        const lastId = coordToNodeId(coords[coords.length - 1][1], coords[coords.length - 1][0])

        coordCounts.set(firstId, (coordCounts.get(firstId) || 0) + 1)
        if (firstId !== lastId) {
            coordCounts.set(lastId, (coordCounts.get(lastId) || 0) + 1)
        }

        pass1Count++
        if (pass1Count % 100000 === 0) {
            console.log(`   Processed ${pass1Count.toLocaleString()} features...`)
        }
    }

    const pass1Elapsed = (Date.now() - pass1Start) / 1000
    const rawIntersections = new Set(
        Array.from(coordCounts.entries())
            .filter(([_, count]) => count > 1)
            .map(([id]) => id)
    )

    console.log(`✅ Pass 1 complete in ${pass1Elapsed.toFixed(2)}s`)
    console.log(`   Found ${rawIntersections.size.toLocaleString()} raw intersection nodes`)
    console.log(`   From ${pass1Count.toLocaleString()} street segments`)
    console.log('')

    // Pass 1.5: Cluster nearby intersections to improve connectivity (using RBush for speed)
    console.log('🔗 Pass 1.5/2: Clustering nearby intersections...')
    console.log(`   Merge threshold: ${mergeThreshold}m`)
    const clusterStart = Date.now()

    // Convert intersection IDs to coordinates and cluster them using spatial index
    const nodeMapping = new Map<string, string>() // Maps original ID to cluster representative ID
    const clusterRepresentatives = new Map<string, { lat: number; lng: number; count: number }>()

    // RBush spatial index for fast nearest-cluster lookup
    type ClusterItem = { minX: number; minY: number; maxX: number; maxY: number; nodeId: string }
    const clusterIndex = new RBush<ClusterItem>()

    let clusterCount = 0
    let mergedCount = 0

    for (const nodeId of rawIntersections) {
        const coord = nodeIdToCoord(nodeId)

        // Approximate degree distance for bounding box (very rough: 1 deg ≈ 111km)
        // For more accuracy, we could use proper lat/lng to meters conversion
        const degreeOffset = mergeThreshold / 111000

        // Search for nearby clusters using RBush
        const nearbyItems = clusterIndex.search({
            minX: coord.lng - degreeOffset,
            minY: coord.lat - degreeOffset,
            maxX: coord.lng + degreeOffset,
            maxY: coord.lat + degreeOffset,
        })

        // Find closest cluster within merge threshold
        let foundCluster = false
        let closestClusterId: string | null = null
        let closestDistance = mergeThreshold

        for (const item of nearbyItems) {
            const clusterCoord = clusterRepresentatives.get(item.nodeId)!
            const distance = haversineDistance(coord, clusterCoord)
            if (distance <= closestDistance) {
                closestDistance = distance
                closestClusterId = item.nodeId
                foundCluster = true
            }
        }

        if (foundCluster && closestClusterId) {
            // Join this node to closest cluster
            nodeMapping.set(nodeId, closestClusterId)
            const clusterCoord = clusterRepresentatives.get(closestClusterId)!

            // Remove old cluster item from RBush (we'll re-add with updated coords)
            const oldItems = clusterIndex.search({
                minX: clusterCoord.lng,
                minY: clusterCoord.lat,
                maxX: clusterCoord.lng,
                maxY: clusterCoord.lat,
            })
            for (const item of oldItems) {
                if (item.nodeId === closestClusterId) {
                    clusterIndex.remove(item)
                    break
                }
            }

            // Update cluster representative (weighted average)
            const newCount = clusterCoord.count + 1
            clusterCoord.lat = (clusterCoord.lat * clusterCoord.count + coord.lat) / newCount
            clusterCoord.lng = (clusterCoord.lng * clusterCoord.count + coord.lng) / newCount
            clusterCoord.count = newCount

            // Re-add cluster with updated coordinates
            clusterIndex.insert({
                minX: clusterCoord.lng,
                minY: clusterCoord.lat,
                maxX: clusterCoord.lng,
                maxY: clusterCoord.lat,
                nodeId: closestClusterId,
            })

            mergedCount++
        } else {
            // Create new cluster if no nearby cluster found
            nodeMapping.set(nodeId, nodeId) // Maps to itself
            clusterRepresentatives.set(nodeId, { lat: coord.lat, lng: coord.lng, count: 1 })

            // Add to spatial index
            clusterIndex.insert({
                minX: coord.lng,
                minY: coord.lat,
                maxX: coord.lng,
                maxY: coord.lat,
                nodeId: nodeId,
            })

            clusterCount++
        }
    }

    const intersections = new Set(clusterRepresentatives.keys())
    const clusterElapsed = (Date.now() - clusterStart) / 1000

    console.log(`✅ Clustering complete in ${clusterElapsed.toFixed(2)}s`)
    console.log(`   Merged ${mergedCount.toLocaleString()} nearby nodes`)
    console.log(`   Final intersection count: ${intersections.size.toLocaleString()}`)
    console.log('')

    // Pass 2: Build graph using clustered intersection nodes
    console.log('📊 Pass 2/2: Building graph with intersections...')
    const graph = new Graph<StreetNode, StreetEdge>({ multi: false, type: 'undirected' })
    let featureCount = 0
    let edgeCount = 0
    let skippedFeatures = 0
    const startTime = Date.now()

    const stream2 = chain([
        fs.createReadStream(geojsonPath),
        parser(),
        pick({ filter: 'features' }),
        streamArray(),
    ])

    for await (const { value } of stream2 as any) {
        const feature = value as StreetFeature

        if (feature.geometry?.type !== 'LineString') {
            skippedFeatures++
            continue
        }

        const coordinates = feature.geometry.coordinates
        if (!coordinates || coordinates.length < 2) {
            skippedFeatures++
            continue
        }

        // Extract properties
        const wayId = feature.properties?.['@id']?.toString() || feature.id?.toString()
        const highway = feature.properties?.highway
        const name = feature.properties?.name
        const surface = feature.properties?.surface

        // Find intersection points in this LineString
        const intersectionIndices: number[] = []
        for (let i = 0; i < coordinates.length; i++) {
            const [lng, lat] = coordinates[i]
            const rawNodeId = coordToNodeId(lat, lng)

            // Check if this coordinate maps to a clustered intersection
            const clusterNodeId = nodeMapping.get(rawNodeId)

            // Only keep points that are clustered intersections
            if (clusterNodeId && intersections.has(clusterNodeId)) {
                intersectionIndices.push(i)
            }
        }

        // Skip if we don't have at least 2 intersections (can't create edges)
        if (intersectionIndices.length < 2) {
            skippedFeatures++
            continue
        }

        // Create nodes and edges between intersections
        for (let i = 0; i < intersectionIndices.length; i++) {
            const idx = intersectionIndices[i]
            const [lng, lat] = coordinates[idx]
            const rawNodeId = coordToNodeId(lat, lng)

            // Map to cluster representative (or use raw ID if endpoint not in clustering)
            const nodeId = nodeMapping.get(rawNodeId) || rawNodeId
            const clusterCoord = clusterRepresentatives.get(nodeId)

            // Use cluster representative coordinates if available, otherwise use raw coordinates
            const nodeLat = clusterCoord?.lat ?? lat
            const nodeLng = clusterCoord?.lng ?? lng

            // Add node
            if (!graph.hasNode(nodeId)) {
                graph.addNode(nodeId, {
                    id: nodeId,
                    lat: nodeLat,
                    lng: nodeLng,
                    ways: wayId ? [wayId] : undefined,
                })
            } else {
                const node = graph.getNodeAttributes(nodeId)
                if (wayId && node.ways && !node.ways.includes(wayId)) {
                    node.ways.push(wayId)
                }
            }

            // Add edge to previous intersection
            if (i > 0) {
                const prevIdx = intersectionIndices[i - 1]
                const [prevLng, prevLat] = coordinates[prevIdx]
                const prevRawNodeId = coordToNodeId(prevLat, prevLng)
                const prevNodeId = nodeMapping.get(prevRawNodeId) || prevRawNodeId

                // Calculate cumulative distance along the LineString
                let distance = 0
                for (let j = prevIdx; j < idx; j++) {
                    const [lng1, lat1] = coordinates[j]
                    const [lng2, lat2] = coordinates[j + 1]
                    distance += haversineDistance({ lat: lat1, lng: lng1 }, { lat: lat2, lng: lng2 })
                }

                // Add edge (skip self-loops)
                if (prevNodeId !== nodeId && !graph.hasEdge(prevNodeId, nodeId)) {
                    graph.addEdge(prevNodeId, nodeId, {
                        distance,
                        wayId,
                        highway,
                        name,
                        surface,
                    })
                    edgeCount++
                }
            }
        }

        featureCount++

        if (onProgress && featureCount % 10000 === 0) {
            onProgress({
                processed: featureCount,
                total: 2574049,
                phase: 'Building graph',
            })
        }

        if (featureCount % 100000 === 0) {
            const elapsed = (Date.now() - startTime) / 1000
            const rate = featureCount / elapsed
            console.log(
                `   Processed ${featureCount.toLocaleString()} features (${rate.toFixed(0)} features/sec, ${graph.order.toLocaleString()} nodes)`
            )
        }
    }

    const elapsed = (Date.now() - startTime) / 1000

    console.log('')
    console.log('✅ Graph building complete!')
    console.log(`📊 Statistics:`)
    console.log(`   - Features processed: ${featureCount.toLocaleString()}`)
    console.log(`   - Features skipped: ${skippedFeatures.toLocaleString()}`)
    console.log(`   - Nodes created: ${graph.order.toLocaleString()}`)
    console.log(`   - Edges created: ${graph.size.toLocaleString()}`)
    console.log(`   - Time: ${elapsed.toFixed(2)}s`)
    console.log(`   - Rate: ${(featureCount / elapsed).toFixed(0)} features/sec`)

    // Calculate bounding box
    const allCoords = graph.mapNodes((node, attrs) => ({
        lat: attrs.lat,
        lng: attrs.lng,
    }))
    const bbox = calculateBoundingBox(allCoords)
    console.log(`   - Bounding box:`)
    console.log(`     Lat: ${bbox.minLat.toFixed(4)} to ${bbox.maxLat.toFixed(4)}`)
    console.log(`     Lng: ${bbox.minLng.toFixed(4)} to ${bbox.maxLng.toFixed(4)}`)

    return graph
}

/**
 * Get graph statistics
 */
export function getGraphStats(graph: StreetGraph) {
    const nodes = graph.order
    const edges = graph.size

    // Sample some nodes to get statistics
    const sampleSize = Math.min(1000, nodes)
    const sampleNodes = graph.nodes().slice(0, sampleSize)

    let totalDegree = 0
    let maxDegree = 0
    let minDegree = Infinity

    for (const nodeId of sampleNodes) {
        const degree = graph.degree(nodeId)
        totalDegree += degree
        maxDegree = Math.max(maxDegree, degree)
        minDegree = Math.min(minDegree, degree)
    }

    const avgDegree = totalDegree / sampleSize

    return {
        nodes,
        edges,
        avgDegree: avgDegree.toFixed(2),
        maxDegree,
        minDegree,
    }
}
