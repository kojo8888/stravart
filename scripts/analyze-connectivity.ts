import path from 'path'
import { buildGraphFromGeoJSON } from '../lib/graph/builder.js'
import { connectedComponents } from 'graphology-components'

console.log('================================================================')
console.log('         Analyzing Graph Connectivity                     ')
console.log('================================================================')
console.log('')

const GEOJSON_PATH = path.join(process.cwd(), 'fixtures/oberbayern-streets.geojson')

async function analyzeConnectivity() {
    try {
        // Build graph
        console.log('🔧 Building graph...')
        const graphStart = Date.now()
        const graph = await buildGraphFromGeoJSON(GEOJSON_PATH, {
            mergeThreshold: 20,
        })
        const graphTime = (Date.now() - graphStart) / 1000
        console.log(`✅ Graph built in ${graphTime.toFixed(2)}s`)
        console.log('')

        // Analyze connected components
        console.log('🔍 Analyzing connected components...')
        const componentStart = Date.now()
        const components = connectedComponents(graph)
        const componentTime = (Date.now() - componentStart) / 1000

        console.log(`✅ Analysis complete in ${componentTime.toFixed(2)}s`)
        console.log('')

        // components is an array of arrays: [[node1, node2, ...], [node3, node4, ...], ...]
        // Sort components by size
        const sortedComponents = components
            .map((nodes, index) => ({ componentId: index, size: nodes.length }))
            .sort((a, b) => b.size - a.size)

        console.log('📊 Connected Component Statistics:')
        console.log(`   - Total components: ${components.length.toLocaleString()}`)
        console.log(`   - Total nodes: ${graph.order.toLocaleString()}`)
        console.log('')

        console.log('🔝 Top 10 largest components:')
        for (let i = 0; i < Math.min(10, sortedComponents.length); i++) {
            const { componentId, size } = sortedComponents[i]
            const percentage = ((size / graph.order) * 100).toFixed(2)
            console.log(`   ${i + 1}. Component ${componentId}: ${size.toLocaleString()} nodes (${percentage}%)`)
        }
        console.log('')

        // Analyze small components
        const smallComponents = sortedComponents.filter(({ size }) => size < 10)
        const mediumComponents = sortedComponents.filter(({ size }) => size >= 10 && size < 100)
        const largeComponents = sortedComponents.filter(({ size }) => size >= 100)

        console.log('📈 Component size distribution:')
        console.log(`   - Large (≥100 nodes): ${largeComponents.length.toLocaleString()} components`)
        console.log(`   - Medium (10-99 nodes): ${mediumComponents.length.toLocaleString()} components`)
        console.log(`   - Small (<10 nodes): ${smallComponents.length.toLocaleString()} components`)
        console.log('')

        const largestComponent = sortedComponents[0]
        const coveragePercent = ((largestComponent.size / graph.order) * 100).toFixed(2)

        console.log('💡 Insights:')
        console.log(`   - Largest component covers ${coveragePercent}% of the graph`)

        if (parseFloat(coveragePercent) > 90) {
            console.log('   ✅ Graph is well-connected (>90% in main component)')
        } else if (parseFloat(coveragePercent) > 70) {
            console.log('   ⚠️  Graph has moderate fragmentation (70-90% in main component)')
        } else {
            console.log('   ❌ Graph is highly fragmented (<70% in main component)')
        }
        console.log('')

        console.log('🔧 Recommendations:')
        if (parseFloat(coveragePercent) < 90) {
            console.log('   1. Use waypoints only from the largest component')
            console.log('   2. Add component filtering to SpatialIndex.findNearest()')
            console.log('   3. Consider including more highway types or relaxing filters')
        } else {
            console.log('   - Graph connectivity looks good!')
            console.log('   - Route failures may be due to other factors')
        }

    } catch (error) {
        console.error('')
        console.error('❌ Error during analysis:', error)
        process.exit(1)
    }
}

analyzeConnectivity()
