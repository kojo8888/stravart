import path from 'path'
import { buildGraphFromGeoJSON } from '../lib/graph/builder.js'
import { connectedComponents } from 'graphology-components'

console.log('================================================================')
console.log('         Debugging Graph Connectivity Issues                ')
console.log('================================================================')
console.log('')

const GEOJSON_PATH = path.join(process.cwd(), 'fixtures/oberbayern-streets.geojson')

async function debugGraph() {
    try {
        // Build graph
        console.log('🔧 Building graph...')
        const graph = await buildGraphFromGeoJSON(GEOJSON_PATH, {
            mergeThreshold: 20,
        })
        console.log('')

        // Check basic graph properties
        console.log('📊 Basic Graph Properties:')
        console.log(`   - Nodes: ${graph.order.toLocaleString()}`)
        console.log(`   - Edges: ${graph.size.toLocaleString()}`)
        console.log(`   - Type: ${graph.type}`)
        console.log(`   - Multi: ${graph.multi}`)
        console.log('')

        // Sample some nodes and their connections
        console.log('🔍 Sampling node connections:')
        const nodesSample = graph.nodes().slice(0, 10)
        for (const nodeId of nodesSample) {
            const degree = graph.degree(nodeId)
            const neighbors = graph.neighbors(nodeId)
            console.log(`   Node ${nodeId}: degree=${degree}, neighbors=${neighbors.slice(0, 3).join(', ')}${neighbors.length > 3 ? '...' : ''}`)
        }
        console.log('')

        // Analyze components
        console.log('🔍 Analyzing connected components...')
        const components = connectedComponents(graph)

        // Debug: Check what components looks like
        const sampleEntries = Object.entries(components).slice(0, 5)
        console.log('   Sample component mappings:')
        for (const [nodeId, compId] of sampleEntries) {
            console.log(`     Node ${nodeId} → Component ${compId} (type: ${typeof compId})`)
        }
        console.log('')

        const componentSizes = new Map<any, Set<string>>()
        for (const [nodeId, componentId] of Object.entries(components)) {
            if (!componentSizes.has(componentId)) {
                componentSizes.set(componentId, new Set())
            }
            componentSizes.get(componentId)!.add(nodeId)
        }

        // Sort by size
        const sortedComponents = Array.from(componentSizes.entries())
            .map(([id, nodes]) => ({ id, size: nodes.size, nodes: Array.from(nodes).slice(0, 5) }))
            .sort((a, b) => b.size - a.size)

        console.log(`✅ Found ${sortedComponents.length.toLocaleString()} components`)
        console.log('')
        console.log('🔝 Top 10 largest components:')
        for (let i = 0; i < Math.min(10, sortedComponents.length); i++) {
            const comp = sortedComponents[i]
            const percentage = ((comp.size / graph.order) * 100).toFixed(2)
            console.log(`   ${i + 1}. Size: ${comp.size.toLocaleString()} nodes (${percentage}%)`)
            if (i < 3) {
                console.log(`      Sample nodes: ${comp.nodes.join(', ')}`)
            }
        }
        console.log('')
        console.log(`💡 Coverage: Largest component contains ${((sortedComponents[0].size / graph.order) * 100).toFixed(1)}% of all nodes`)

    } catch (error) {
        console.error('')
        console.error('❌ Error:', error)
        process.exit(1)
    }
}

debugGraph()
