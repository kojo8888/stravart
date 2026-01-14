import path from 'path'
import { buildGraphFromGeoJSON } from '../lib/graph/builder.js'
import { connectedComponents } from 'graphology-components'

console.log('Testing connectedComponents output format...')
console.log('')

const GEOJSON_PATH = path.join(process.cwd(), 'fixtures/oberbayern-streets.geojson')

async function testFormat() {
    const graph = await buildGraphFromGeoJSON(GEOJSON_PATH, {
        mergeThreshold: 20,
    })
    console.log('')

    console.log('🔍 Running connectedComponents...')
    const components = connectedComponents(graph)

    console.log(`Type of components: ${typeof components}`)
    console.log(`Is Array: ${Array.isArray(components)}`)
    console.log(`Constructor: ${components.constructor.name}`)
    console.log('')

    // Check the structure
    if (Array.isArray(components)) {
        console.log(`Array length: ${components.length}`)
        console.log('First 5 elements:')
        for (let i = 0; i < Math.min(5, components.length); i++) {
            console.log(`  [${i}] = ${JSON.stringify(components[i]).substring(0, 100)}`)
        }
    } else if (typeof components === 'object') {
        const keys = Object.keys(components)
        console.log(`Object with ${keys.length} keys`)
        console.log('First 5 entries:')
        for (let i = 0; i < Math.min(5, keys.length); i++) {
            const key = keys[i]
            const value = components[key]
            console.log(`  "${key}" => ${typeof value === 'object' ? JSON.stringify(value).substring(0, 80) : value}`)
        }
        console.log('')
        console.log('Last 5 entries:')
        for (let i = Math.max(0, keys.length - 5); i < keys.length; i++) {
            const key = keys[i]
            const value = components[key]
            console.log(`  "${key}" => ${typeof value === 'object' ? JSON.stringify(value).substring(0, 80) : value}`)
        }
    }
    console.log('')

    // Try to understand the actual format
    console.log('🔍 Analyzing component structure...')
    const sampleNodes = graph.nodes().slice(0, 10)
    for (const nodeId of sampleNodes) {
        const componentId = components[nodeId]
        const degree = graph.degree(nodeId)
        console.log(`Node "${nodeId}" (degree=${degree}) => component ${componentId} (type: ${typeof componentId})`)
    }
}

testFormat()
