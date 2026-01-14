import path from 'path'
import { buildGraphFromGeoJSON } from '../lib/graph/builder.js'
import { connectedComponents } from 'graphology-components'

console.log('================================================================')
console.log('         Analyzing Graph Connected Components              ')
console.log('================================================================')
console.log('')

const GEOJSON_PATH = path.join(process.cwd(), 'fixtures/oberbayern-streets.geojson')

async function analyzeComponents() {
    try {
        // Build graph
        console.log('🔧 Building graph...')
        const graph = await buildGraphFromGeoJSON(GEOJSON_PATH, {
            mergeThreshold: 20,
        })
        console.log('')

        // Analyze connected components
        console.log('🔍 Analyzing connected components...')
        const componentStart = Date.now()
        const components = connectedComponents(graph)

        // components is an array of arrays: [[node1, node2, ...], [node3, node4, ...], ...]
        const componentTime = (Date.now() - componentStart) / 1000
        console.log(`✅ Component analysis complete in ${componentTime.toFixed(2)}s`)
        console.log(`   Total components: ${components.length.toLocaleString()}`)
        console.log('')

        // Sort components by size (each component is an array of node IDs)
        const sortedComponents = components
            .map((nodes, index) => ({
                id: index,
                size: nodes.length,
                sampleNodes: nodes.slice(0, 3)
            }))
            .sort((a, b) => b.size - a.size)

        // Display top 20 components
        console.log('🔝 Top 20 largest components:')
        for (let i = 0; i < Math.min(20, sortedComponents.length); i++) {
            const comp = sortedComponents[i]
            const percentage = ((comp.size / graph.order) * 100).toFixed(2)
            console.log(`   ${(i + 1).toString().padStart(2)}. Size: ${comp.size.toLocaleString().padStart(8)} nodes (${percentage.padStart(5)}%)`)
            if (i < 5) {
                console.log(`       Sample: ${comp.sampleNodes.join(', ')}`)
            }
        }
        console.log('')

        // Display bottom 10 components (smallest)
        console.log('🔻 Bottom 10 smallest components:')
        const bottomComponents = sortedComponents.slice(-10).reverse()
        for (let i = 0; i < bottomComponents.length; i++) {
            const comp = bottomComponents[i]
            console.log(`   ${(i + 1).toString().padStart(2)}. Size: ${comp.size.toLocaleString().padStart(8)} nodes`)
            console.log(`       Nodes: ${comp.sampleNodes.join(', ')}`)
        }
        console.log('')

        // Statistics
        const largestComponent = sortedComponents[0]
        const coverage = ((largestComponent.size / graph.order) * 100).toFixed(1)
        const avgComponentSize = graph.order / sortedComponents.length

        console.log('📊 Component Statistics:')
        console.log(`   - Total nodes: ${graph.order.toLocaleString()}`)
        console.log(`   - Total components: ${sortedComponents.length.toLocaleString()}`)
        console.log(`   - Largest component: ${largestComponent.size.toLocaleString()} nodes (${coverage}%)`)
        console.log(`   - Average component size: ${avgComponentSize.toFixed(1)} nodes`)
        console.log(`   - Median component size: ${sortedComponents[Math.floor(sortedComponents.length / 2)].size} nodes`)
        console.log('')

        // Distribution analysis
        const sizeRanges = [
            { label: '1 node (isolated)', min: 1, max: 1 },
            { label: '2-5 nodes', min: 2, max: 5 },
            { label: '6-10 nodes', min: 6, max: 10 },
            { label: '11-50 nodes', min: 11, max: 50 },
            { label: '51-100 nodes', min: 51, max: 100 },
            { label: '101-1000 nodes', min: 101, max: 1000 },
            { label: '1000+ nodes', min: 1001, max: Infinity },
        ]

        console.log('📈 Component Size Distribution:')
        for (const range of sizeRanges) {
            const count = sortedComponents.filter(c => c.size >= range.min && c.size <= range.max).length
            const nodesInRange = sortedComponents
                .filter(c => c.size >= range.min && c.size <= range.max)
                .reduce((sum, c) => sum + c.size, 0)
            const percentage = ((nodesInRange / graph.order) * 100).toFixed(1)
            console.log(`   ${range.label.padEnd(20)}: ${count.toString().padStart(6)} components, ${nodesInRange.toLocaleString().padStart(8)} nodes (${percentage.padStart(4)}%)`)
        }
        console.log('')

        // Coverage analysis
        console.log('💡 Coverage Analysis:')
        let cumulativeNodes = 0
        for (let i = 0; i < Math.min(10, sortedComponents.length); i++) {
            cumulativeNodes += sortedComponents[i].size
            const coverage = ((cumulativeNodes / graph.order) * 100).toFixed(1)
            console.log(`   Top ${i + 1} component${i > 0 ? 's' : ''}: ${cumulativeNodes.toLocaleString()} nodes (${coverage}% of graph)`)
        }

    } catch (error) {
        console.error('')
        console.error('❌ Error:', error)
        process.exit(1)
    }
}

analyzeComponents()
