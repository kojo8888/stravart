/**
 * Graph caching utilities - Save and load graphs from disk
 */

import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import { createGzip, createGunzip } from 'zlib'
import { pipeline } from 'stream/promises'
import Graph from 'graphology'
import type { StreetGraph, CachedGraph, StreetNode, StreetEdge } from './types'
import { calculateBoundingBox } from './utils'

const CACHE_DIR = path.join(process.cwd(), 'fixtures')

/**
 * Save graph to cache file (using gzip compression and streaming)
 */
export async function saveGraphToCache(
    graph: StreetGraph,
    cacheFileName: string,
    sourceFile: string
): Promise<void> {
    console.log('💾 Saving graph to cache (compressed)...')
    const startTime = Date.now()

    try {
        // Calculate metadata
        const allCoords = graph.mapNodes((node, attrs) => ({
            lat: attrs.lat,
            lng: attrs.lng,
        }))
        const boundingBox = calculateBoundingBox(allCoords)

        // Export graph data
        console.log('   Exporting graph data...')
        const graphData = graph.export()

        const cachedGraph: CachedGraph = {
            graphData,
            metadata: {
                nodeCount: graph.order,
                edgeCount: graph.size,
                boundingBox,
                createdAt: new Date().toISOString(),
                sourceFile,
            },
        }

        // Ensure cache directory exists
        await fs.mkdir(CACHE_DIR, { recursive: true })

        // Write to file with compression in chunks
        console.log('   Writing and compressing...')
        const cachePath = path.join(CACHE_DIR, cacheFileName + '.gz')

        // Convert to JSON in chunks to avoid string length limit
        const jsonString = JSON.stringify(cachedGraph, null, 0)

        // Stream write with gzip
        const writeStream = fsSync.createWriteStream(cachePath)
        const gzip = createGzip({ level: 6 }) // Moderate compression

        await pipeline(
            async function* () {
                // Chunk the JSON string to avoid memory issues
                const chunkSize = 1024 * 1024 // 1MB chunks
                for (let i = 0; i < jsonString.length; i += chunkSize) {
                    yield jsonString.substring(i, Math.min(i + chunkSize, jsonString.length))
                }
            },
            gzip,
            writeStream
        )

        const fileStats = await fs.stat(cachePath)
        const elapsed = (Date.now() - startTime) / 1000

        console.log(`✅ Graph cached successfully!`)
        console.log(`   - File: ${cacheFileName}.gz`)
        console.log(`   - Compressed size: ${(fileStats.size / 1024 / 1024).toFixed(2)} MB`)
        console.log(`   - Compression ratio: ${((fileStats.size / jsonString.length) * 100).toFixed(1)}%`)
        console.log(`   - Time: ${elapsed.toFixed(2)}s`)
    } catch (error) {
        console.error('❌ Error saving graph to cache:', error)
        throw error
    }
}

/**
 * Load graph from cache file (with gzip decompression)
 */
export async function loadGraphFromCache(cacheFileName: string): Promise<StreetGraph | null> {
    console.log('📂 Loading graph from cache...')
    const startTime = Date.now()

    try {
        const cachePath = path.join(CACHE_DIR, cacheFileName + '.gz')

        // Check if cache exists
        try {
            await fs.access(cachePath)
        } catch {
            console.log('⚠️  Cache file not found')
            return null
        }

        // Read and decompress cache
        console.log('   Reading and decompressing...')
        const readStream = fsSync.createReadStream(cachePath)
        const gunzip = createGunzip()

        const chunks: Buffer[] = []
        await pipeline(gunzip, async function (source) {
            for await (const chunk of source) {
                chunks.push(chunk)
            }
        })

        await pipeline(readStream, gunzip)

        const content = Buffer.concat(chunks).toString('utf-8')
        console.log('   Parsing JSON...')
        const cachedGraph: CachedGraph = JSON.parse(content)

        // Import graph
        console.log('   Importing graph...')
        const graph = new Graph<StreetNode, StreetEdge>()
        graph.import(cachedGraph.graphData)

        const elapsed = (Date.now() - startTime) / 1000

        console.log(`✅ Graph loaded from cache!`)
        console.log(`   - Nodes: ${cachedGraph.metadata.nodeCount.toLocaleString()}`)
        console.log(`   - Edges: ${cachedGraph.metadata.edgeCount.toLocaleString()}`)
        console.log(`   - Created: ${new Date(cachedGraph.metadata.createdAt).toLocaleString()}`)
        console.log(`   - Time: ${elapsed.toFixed(2)}s`)

        return graph
    } catch (error) {
        console.error('❌ Error loading graph from cache:', error)
        return null
    }
}

/**
 * Check if cache exists and get metadata
 */
export async function getCacheMetadata(cacheFileName: string): Promise<CachedGraph['metadata'] | null> {
    try {
        const cachePath = path.join(CACHE_DIR, cacheFileName + '.gz')
        const readStream = fsSync.createReadStream(cachePath)
        const gunzip = createGunzip()

        const chunks: Buffer[] = []
        await pipeline(readStream, gunzip, async function (source) {
            for await (const chunk of source) {
                chunks.push(chunk)
            }
        })

        const content = Buffer.concat(chunks).toString('utf-8')
        const cachedGraph: CachedGraph = JSON.parse(content)
        return cachedGraph.metadata
    } catch {
        return null
    }
}

/**
 * Delete cache file
 */
export async function deleteCache(cacheFileName: string): Promise<void> {
    try {
        const cachePath = path.join(CACHE_DIR, cacheFileName + '.gz')
        await fs.unlink(cachePath)
        console.log(`🗑️  Deleted cache: ${cacheFileName}.gz`)
    } catch (error) {
        console.error('❌ Error deleting cache:', error)
        throw error
    }
}

/**
 * Get or build graph with caching
 */
export async function getOrBuildGraph(
    geojsonPath: string,
    cacheFileName: string,
    builder: () => Promise<StreetGraph>
): Promise<StreetGraph> {
    // Try to load from cache first
    const cachedGraph = await loadGraphFromCache(cacheFileName)
    if (cachedGraph) {
        return cachedGraph
    }

    // Build graph
    console.log('📊 Cache miss - building graph from scratch...')
    console.log('')
    const graph = await builder()

    // Save to cache
    await saveGraphToCache(graph, cacheFileName, path.basename(geojsonPath))

    return graph
}
