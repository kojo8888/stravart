'use client'

import React, { useState, useEffect } from 'react'
import Head from 'next/head'
import axios from 'axios'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import DrawingBoard from '@/components/DrawingBoard'
import { getAvailableShapes } from '@/lib/shapes'
import { checkPremiumAccess, getRemainingDays } from '@/lib/payment'
import CheckoutButton from '@/components/CheckoutButton'
import dynamic from 'next/dynamic'
import { GeoJsonObject } from 'geojson'

const DynamicMap = dynamic(
    () => import('@/components/GeoMap').then((mod) => mod.default),
    { ssr: false }
)

interface Coordinates {
    lat: number
    lng: number
}

interface ResultData extends GeoJsonObject {
    properties?: {
        totalDistanceKm: number
    }
}


const Home: React.FC = () => {
    const [userLocation, setUserLocation] = useState<Coordinates | null>(null)
    const [shapeType, setShapeType] = useState<'predefined' | 'custom'>('predefined')
    const [selectedShape, setSelectedShape] = useState<string>('heart')
    const [targetDistance, setTargetDistance] = useState<string>('5.0')
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState<ResultData | null>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [isSearching, setIsSearching] = useState(false)
    const [customSvg, setCustomSvg] = useState<string | null>(null)
    const [hasPremium, setHasPremium] = useState(false)
    const [remainingDays, setRemainingDays] = useState<number | null>(null)
    const [routeCount, setRouteCount] = useState(0)

    useEffect(() => {
        // Check premium access status
        const premium = checkPremiumAccess()
        setHasPremium(premium)
        setRemainingDays(getRemainingDays())

        // Get current route count from localStorage
        const savedCount = localStorage.getItem('route_count')
        if (savedCount) {
            setRouteCount(parseInt(savedCount))
        }
    }, [])

    const getUserLocation = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const loc = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                    }
                    console.log('[FRONTEND] User location acquired:', loc)
                    setUserLocation(loc)
                },
                (error) => {
                    console.error('Geolocation error:', error)
                    alert('Could not get your location. Please search for a place instead.')
                }
            )
        } else {
            alert('Geolocation is not supported by your browser.')
            console.warn('[FRONTEND] Geolocation not supported.')
        }
    }

    const handleSearchPlace = async () => {
        if (!searchQuery.trim()) return

        setIsSearching(true)
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
                    searchQuery
                )}&limit=1&addressdetails=1`
            )
            const data = await response.json()
            if (data.length > 0) {
                const loc = {
                    lat: parseFloat(data[0].lat),
                    lng: parseFloat(data[0].lon),
                }
                setUserLocation(loc)
                console.log('[NOMINATIM] Found location:', loc, data[0].display_name)
            } else {
                alert('Place not found. Try a more specific name (e.g., "Central Park, New York" or "Eiffel Tower, Paris").')
            }
        } catch (err) {
            console.error('Nominatim search error:', err)
            alert('Search failed. Please check your internet connection.')
        } finally {
            setIsSearching(false)
        }
    }

    const handleSearchKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSearchPlace()
        }
    }


    const handleShapeTypeChange = (type: 'predefined' | 'custom') => {
        setShapeType(type)
        if (type === 'predefined') {
            setCustomSvg(null) // Clear custom drawing when switching to predefined
        }
    }

    const handleDistanceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setTargetDistance(e.target.value)
    }

    const handleFetch = async () => {
        if (!userLocation) {
            alert('Please select or provide a location first.')
            return
        }

        if (shapeType === 'custom' && !customSvg) {
            alert('Please draw a custom shape or switch to heart shape.')
            return
        }

        // Check access limits
        const MAX_FREE_ROUTES = 1000
        if (!hasPremium && routeCount >= MAX_FREE_ROUTES) {
            alert(`You've reached the limit of ${MAX_FREE_ROUTES} free routes. Please upgrade to premium for unlimited access.`)
            return
        }

        setLoading(true)
        try {
            const response = await axios.post('/api/fit-fetch', {
                location: userLocation,
                targetDistanceKm: parseFloat(targetDistance) || 5.0,
                shape: shapeType === 'predefined' ? selectedShape : 'custom',
                svg: customSvg,
            })
            console.log('[FRONTEND] Response from backend:', response.data)
            setResult(response.data)

            // Increment route count for free users
            if (!hasPremium) {
                const newCount = routeCount + 1
                setRouteCount(newCount)
                localStorage.setItem('route_count', newCount.toString())
            }
        } catch (error) {
            console.error('[FRONTEND] Error fetching data:', error)
        } finally {
            setLoading(false)
        }
    }

    const convertToGpx = (geojsonData: ResultData): string => {
        if (!geojsonData.features) return ''
        
        const routeName = `Strava Art Route - ${selectedShape}`
        const timestamp = new Date().toISOString()
        
        let gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Strava Art" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${routeName}</name>
    <desc>Generated route shaped like ${selectedShape}</desc>
    <time>${timestamp}</time>
  </metadata>
  <trk>
    <name>${routeName}</name>
    <trkseg>
`
        
        // Add track points from GeoJSON features
        geojsonData.features?.forEach((feature) => {
            if (feature.geometry && feature.geometry.type === 'Point' && feature.geometry.coordinates) {
                const [lon, lat] = feature.geometry.coordinates
                gpxContent += `      <trkpt lat="${lat}" lon="${lon}"></trkpt>\n`
            }
        })
        
        gpxContent += `    </trkseg>
  </trk>
</gpx>`
        
        return gpxContent
    }

    const handleDownload = () => {
        if (!result) return

        const gpxContent = convertToGpx(result)
        const dataStr =
            'data:application/gpx+xml;charset=utf-8,' +
            encodeURIComponent(gpxContent)
        const downloadAnchorNode = document.createElement('a')
        downloadAnchorNode.setAttribute('href', dataStr)
        downloadAnchorNode.setAttribute('download', 'strava-art-route.gpx')
        document.body.appendChild(downloadAnchorNode)
        downloadAnchorNode.click()
        downloadAnchorNode.remove()
    }

    return (
        <div className="min-h-screen p-4 bg-white text-gray-900">
            <Head>
                <title>Strava Art</title>
                <meta
                    name="description"
                    content="Create Strava Art by fitting shapes to street nodes."
                />
                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1.0"
                />
                <link rel="icon" href="/favicon.ico" />
            </Head>
            <main className="flex flex-col gap-6">
                <h1 className="text-3xl font-bold text-center mb-4">
                    Strava Art
                </h1>
                <p className="text-center mb-4">
                    Create your own Strava Art by selecting a location and
                    shape.
                </p>

                {/* Premium Status Banner */}
                {hasPremium ? (
                    <div className="max-w-2xl mx-auto mb-6 p-4 bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-xl">
                        <div className="text-center">
                            <p className="text-green-700 font-medium">
                                ✨ Premium Active - Unlimited Routes
                            </p>
                            {remainingDays && (
                                <p className="text-sm text-green-600">
                                    {remainingDays} days remaining
                                </p>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="max-w-2xl mx-auto mb-6 p-4 bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200 rounded-xl">
                        <div className="text-center space-y-3">
                            <p className="text-orange-700 font-medium">
                                Free Plan - {1000 - routeCount} routes remaining
                            </p>
                            <CheckoutButton className="w-full max-w-xs mx-auto" />
                        </div>
                    </div>
                )}
                <div className="max-w-2xl mx-auto space-y-6">
                    {/* Step 1: Location */}
                    <div className="border rounded-xl p-6 shadow-sm bg-white">
                        <div className="flex items-center gap-2 mb-4">
                            <span className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold">1</span>
                            <h2 className="text-xl font-semibold">Choose Location</h2>
                        </div>
                        
                        {/* Geolocation Button */}
                        <Button onClick={getUserLocation} variant="outline" className="mb-4 w-full">
                            📍 Use My Current Location
                        </Button>
                        
                        {/* Place Search */}
                        <div className="space-y-2">
                            <p className="text-gray-600">Or search for any place:</p>
                            <div className="flex gap-2">
                                <Input
                                    placeholder="e.g. Central Park NYC, Eiffel Tower Paris..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={handleSearchKeyPress}
                                    disabled={isSearching}
                                    className="flex-1"
                                />
                                <Button 
                                    onClick={handleSearchPlace} 
                                    disabled={isSearching || !searchQuery.trim()}
                                    variant="outline"
                                >
                                    {isSearching ? '🔍' : 'Search'}
                                </Button>
                            </div>
                        </div>

                        {/* Current Location Display */}
                        {userLocation && (
                            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                                <p className="text-green-700 font-medium">
                                    ✓ Location set: {userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Step 2: Length */}
                    <div className="border rounded-xl p-6 shadow-sm bg-white">
                        <div className="flex items-center gap-2 mb-4">
                            <span className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold">2</span>
                            <h2 className="text-xl font-semibold">Set Route Distance</h2>
                        </div>
                        <p className="text-gray-600 mb-3">How long should your route be?</p>
                        <Input
                            placeholder="e.g. 5.0"
                            value={targetDistance}
                            onChange={handleDistanceChange}
                            type="number"
                            step="0.1"
                            min="1.0"
                            max="20.0"
                            className="text-lg"
                        />
                        <p className="text-sm text-gray-500 mt-2">Distance in kilometers (1.0 - 20.0)</p>
                    </div>

                    {/* Step 3: Shape */}
                    <div className="border rounded-xl p-6 shadow-sm bg-white">
                        <div className="flex items-center gap-2 mb-4">
                            <span className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold">3</span>
                            <h2 className="text-xl font-semibold">Choose Shape</h2>
                        </div>
                        
                        {/* Shape Type Selection */}
                        <div className="space-y-4">
                            <div className="flex gap-4">
                                <Button
                                    onClick={() => handleShapeTypeChange('predefined')}
                                    variant={shapeType === 'predefined' ? 'default' : 'outline'}
                                    className="flex-1"
                                >
                                    🎯 Choose Shape
                                </Button>
                                <Button
                                    onClick={() => handleShapeTypeChange('custom')}
                                    variant={shapeType === 'custom' ? 'default' : 'outline'}
                                    className="flex-1"
                                >
                                    ✏️ Draw Custom
                                </Button>
                            </div>
                            
                            {/* Predefined Shapes */}
                            {shapeType === 'predefined' && (
                                <div className="space-y-3">
                                    <p className="text-gray-600">Select a shape:</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {getAvailableShapes().map((shape) => (
                                            <Button
                                                key={shape.name}
                                                onClick={() => setSelectedShape(shape.name)}
                                                variant={selectedShape === shape.name ? 'default' : 'outline'}
                                                className="h-auto p-3 flex flex-col gap-1"
                                            >
                                                <span className="text-lg">{shape.displayName}</span>
                                                <span className="text-xs text-gray-600 text-center">
                                                    {shape.description}
                                                </span>
                                            </Button>
                                        ))}
                                    </div>
                                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                        <p className="text-blue-800 text-sm text-center">
                                            {getAvailableShapes().find(s => s.name === selectedShape)?.displayName} selected
                                        </p>
                                    </div>
                                </div>
                            )}
                            
                            {/* Custom Drawing */}
                            {shapeType === 'custom' && (
                                <div className="space-y-3">
                                    <p className="text-gray-600">Draw your custom shape:</p>
                                    <DrawingBoard
                                        onSvgGenerated={(svg) => {
                                            console.log('Generated SVG', svg)
                                            setCustomSvg(svg)
                                        }}
                                    />
                                    {customSvg && (
                                        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                                            <p className="text-green-700 text-sm">
                                                ✓ Custom shape ready! Your drawing will be used for the route.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-4 justify-center">
                        <Button 
                            onClick={handleFetch} 
                            size="lg"
                            className="px-8"
                            disabled={!userLocation || (shapeType === 'custom' && !customSvg) || (!hasPremium && routeCount >= 1000)}
                        >
                            {!hasPremium && routeCount >= 1000 ? '🔒 Upgrade Required' : '🚀 Generate Route'}
                        </Button>
                        <Button
                            onClick={handleDownload}
                            variant="outline"
                            size="lg"
                            disabled={!result}
                            className="px-8"
                        >
                            📥 Download GPX
                        </Button>
                    </div>
                </div>
                {loading && (
                    <div className="mt-8">
                        <Progress
                            value={75}
                            className="w-full max-w-xl mx-auto mb-4"
                        />
                        <p className="text-center text-gray-600">Generating your route...</p>
                    </div>
                )}

                {userLocation && result && (
                    <div className="mt-8 space-y-6">
                        {/* Map */}
                        <div className="max-w-4xl mx-auto">
                            <div className="h-[500px] w-full border rounded-xl overflow-hidden shadow-lg">
                                <DynamicMap
                                    center={userLocation}
                                    geojsonData={result}
                                />
                            </div>
                        </div>

                        {/* Route Distance */}
                        {result.properties && (
                            <div className="text-center">
                                <div className="inline-block p-4 bg-white border rounded-xl">
                                    <p className="text-black font-semibold text-lg">
                                        🎯 Route Distance: <strong>{result.properties.totalDistanceKm} km</strong>
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    )
}

export default Home
