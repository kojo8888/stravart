import Graph from 'graphology'

console.log('Testing basic graph operations...\n')

// Create simple graph
const graph = new Graph()

graph.addNode('A', { lat: 48.1, lng: 11.5 })
graph.addNode('B', { lat: 48.2, lng: 11.6 })
graph.addNode('C', { lat: 48.15, lng: 11.55 })

graph.addEdge('A', 'B', { distance: 100 })
graph.addEdge('B', 'C', { distance: 50 })
graph.addEdge('A', 'C', { distance: 75 })

console.log('Nodes:', graph.order)
console.log('Edges:', graph.size)
console.log('Neighbors of A:', graph.neighbors('A'))

// Test serialization
const exported = graph.export()
console.log('\nGraph can be serialized:', !!exported)
console.log('Serialized node count:', exported.nodes.length)
console.log('Serialized edge count:', exported.edges.length)

console.log('\n✅ Basic graph operations working!')
