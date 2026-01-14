/**
 * Test script for the graph-based routing API endpoint
 * Run with: node scripts/test-graph-api.js
 *
 * Make sure the dev server is running: npm run dev
 */

const API_URL = 'http://localhost:3000/api/graph-route'

// Test cases
const testCases = [
    {
        name: 'Munich Heart (5km)',
        payload: {
            location: { lat: 48.1351, lng: 11.5820 }, // Munich center
            shape: 'heart',
            targetDistanceKm: 5.0,
        },
    },
    {
        name: 'Munich Circle (3km)',
        payload: {
            location: { lat: 48.1351, lng: 11.5820 },
            shape: 'circle',
            targetDistanceKm: 3.0,
        },
    },
    {
        name: 'Munich Star (10km)',
        payload: {
            location: { lat: 48.1351, lng: 11.5820 },
            shape: 'star',
            targetDistanceKm: 10.0,
        },
    },
]

async function testHealthCheck() {
    console.log('🏥 Testing health check endpoint...')
    try {
        const response = await fetch(API_URL)
        const data = await response.json()

        console.log('✅ Health check response:')
        console.log(JSON.stringify(data, null, 2))
        console.log('')

        return response.ok
    } catch (error) {
        console.error('❌ Health check failed:', error.message)
        return false
    }
}

async function testRouteGeneration(testCase) {
    console.log(`\n🧪 Testing: ${testCase.name}`)
    console.log(`   Location: (${testCase.payload.location.lat}, ${testCase.payload.location.lng})`)
    console.log(`   Shape: ${testCase.payload.shape}`)
    console.log(`   Target: ${testCase.payload.targetDistanceKm}km`)

    const startTime = Date.now()

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testCase.payload),
        })

        const data = await response.json()
        const elapsed = Date.now() - startTime

        if (!response.ok) {
            console.error(`❌ Request failed (${response.status}):`, data.error || data.message)
            return false
        }

        // Check if it's a valid GeoJSON
        if (data.type !== 'FeatureCollection' || !data.features) {
            console.error('❌ Invalid response format (not a FeatureCollection)')
            return false
        }

        const props = data.properties || {}

        console.log(`✅ Route generated successfully (${elapsed}ms)`)
        console.log(`   - Features: ${data.features.length}`)
        console.log(`   - Actual distance: ${props.actualDistanceKm || 'N/A'}km`)
        console.log(`   - Target distance: ${props.targetDistanceKm || 'N/A'}km`)
        console.log(`   - Waypoints: ${props.waypoints || 'N/A'}`)
        console.log(`   - Segments: ${props.segments || 'N/A'}`)
        console.log(`   - Total nodes: ${props.totalNodes || 'N/A'}`)
        console.log(`   - Routing time: ${props.routingTimeMs || 'N/A'}ms`)

        if (props.actualDistanceKm) {
            const accuracy = Math.abs(props.actualDistanceKm - testCase.payload.targetDistanceKm)
            const percentOff = (accuracy / testCase.payload.targetDistanceKm * 100).toFixed(1)
            console.log(`   - Distance accuracy: ±${accuracy.toFixed(2)}km (${percentOff}%)`)
        }

        return true
    } catch (error) {
        const elapsed = Date.now() - startTime
        console.error(`❌ Request failed after ${elapsed}ms:`, error.message)
        return false
    }
}

async function runTests() {
    console.log('================================================================')
    console.log('         Testing Graph-Based Routing API                   ')
    console.log('================================================================')
    console.log('')
    console.log('⚠️  Make sure the dev server is running: npm run dev')
    console.log('')

    // Test health check
    const healthOk = await testHealthCheck()
    if (!healthOk) {
        console.error('❌ Health check failed. Is the server running?')
        process.exit(1)
    }

    console.log('⏱️  Note: First request will take ~40s to build the graph')
    console.log('')

    // Run all test cases
    let passed = 0
    let failed = 0

    for (const testCase of testCases) {
        const success = await testRouteGeneration(testCase)
        if (success) {
            passed++
        } else {
            failed++
        }
    }

    console.log('')
    console.log('================================================================')
    console.log('                     Test Summary                           ')
    console.log('================================================================')
    console.log(`Total tests: ${testCases.length}`)
    console.log(`✅ Passed: ${passed}`)
    console.log(`❌ Failed: ${failed}`)
    console.log('')

    if (failed === 0) {
        console.log('🎉 All tests passed!')
    } else {
        console.log('⚠️  Some tests failed')
        process.exit(1)
    }
}

// Run tests
runTests().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
})
