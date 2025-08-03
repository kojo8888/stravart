'use client'

import React, { useState } from 'react'
import Head from 'next/head'
import axios from 'axios'
import { Button } from '@/components/ui/button'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import DrawingBoard from '@/components/DrawingBoard'
import dynamic from 'next/dynamic'

const DynamicMap = dynamic(
    () => import('@/components/GeoMap').then((mod) => mod.default),
    { ssr: false }
)

interface Coordinates {
    lat: number
    lng: number
}

const cities: Record<string, Coordinates> = {
    Munich: { lat: 48.1351, lng: 11.582 },
    Berlin: { lat: 52.52, lng: 13.405 },
    Hamburg: { lat: 53.5511, lng: 9.9937 },
    Paris: { lat: 48.8566, lng: 2.3522 },
    London: { lat: 51.5074, lng: -0.1278 },
    'New York': { lat: 40.7128, lng: -74.0060 },
    Amsterdam: { lat: 52.3676, lng: 4.9041 },
    Vienna: { lat: 48.2082, lng: 16.3738 },
}

const Home: React.FC = () => {
    const [userLocation, setUserLocation] = useState<Coordinates | null>(null)
    const [selectedCity, setSelectedCity] = useState<string>('')
    const [selectedShape, setSelectedShape] = useState<string>('heart')
    const [targetDistance, setTargetDistance] = useState<string>('5.0')
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState<any | null>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [isSearching, setIsSearching] = useState(false)
    const [customSvg, setCustomSvg] = useState<string | null>(null)

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
                    setSelectedCity('') // Clear city selection when using geolocation
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
                setSelectedCity('') // Clear city selection when using search
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

    const handleCitySelect = (city: string) => {
        setSelectedCity(city)
        if (cities[city]) {
            console.log('[FRONTEND] City selected:', city)
            setUserLocation(cities[city])
            setSearchQuery('') // Clear search when using city selection
        }
    }

    const handleShapeSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSelectedShape(e.target.value)
    }

    const handleDistanceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setTargetDistance(e.target.value)
    }

    const handleFetch = async () => {
        if (!userLocation) {
            alert('Please select or provide a location first.')
            return
        }

        setLoading(true)
        try {
            const response = await axios.post('/api/fit-fetch', {
                location: userLocation,
                targetDistanceKm: parseFloat(targetDistance) || 5.0,
                shape: selectedShape,
                svg: customSvg,
            })
            console.log('[FRONTEND] Response from backend:', response.data)
            setResult(response.data)
        } catch (error) {
            console.error('[FRONTEND] Error fetching data:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleDownload = () => {
        if (!result) return

        const dataStr =
            'data:text/json;charset=utf-8,' +
            encodeURIComponent(JSON.stringify(result, null, 2))
        const downloadAnchorNode = document.createElement('a')
        downloadAnchorNode.setAttribute('href', dataStr)
        downloadAnchorNode.setAttribute('download', 'result.geojson')
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
                <div className="flex flex-col lg:flex-row gap-6">
                    <div className="flex-1 border rounded-xl p-4 shadow">
                        <h2 className="font-semibold mb-2">Location</h2>
                        
                        {/* Geolocation Button */}
                        <Button onClick={getUserLocation} className="mb-3">
                            📍 Get My Location
                        </Button>
                        
                        {/* Place Search */}
                        <div className="mb-3">
                            <p className="text-sm text-gray-600 mb-2">Search for any place:</p>
                            <div className="flex gap-2">
                                <Input
                                    placeholder="e.g. Central Park NYC, Eiffel Tower Paris..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyPress={handleSearchKeyPress}
                                    disabled={isSearching}
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

                        {/* City Selection */}
                        <div className="mb-3">
                            <p className="text-sm text-gray-600 mb-2">Or select a popular city:</p>
                            <Select
                                onValueChange={handleCitySelect}
                                value={selectedCity}
                            >
                                <SelectTrigger>
                                    {selectedCity || 'Select a city'}
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.keys(cities).map((city) => (
                                        <SelectItem key={city} value={city}>
                                            {city}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Current Location Display */}
                        {userLocation && (
                            <div className="mb-3 p-2 bg-green-50 border border-green-200 rounded">
                                <p className="text-sm text-green-700">
                                    📍 Current location: {userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}
                                </p>
                            </div>
                        )}
                        
                        {/* Route Distance Input */}
                        <div>
                            <p className="text-sm font-medium mb-2">Desired route distance (km):</p>
                            <Input
                                placeholder="e.g. 5.0"
                                value={targetDistance}
                                onChange={handleDistanceChange}
                                type="number"
                                step="0.1"
                                min="1.0"
                                max="20.0"
                            />
                        </div>
                    </div>
                    <div className="flex-1 border rounded-xl p-4 shadow">
                        <h2 className="font-semibold mb-2">
                            Select or Describe Shape
                        </h2>
                        <p className="text-sm text-gray-600 mb-2">
                            Testing shape: {selectedShape}
                        </p>
                        <Input
                            placeholder="e.g. heart, boat, cat..."
                            className="mt-2"
                            value={selectedShape}
                            onChange={handleShapeSelect}
                        />
                        <div className="border rounded-xl p-4 shadow mt-4">
                            <h2 className="font-semibold mb-2">
                                Or Draw Your Own Shape
                            </h2>
                            <DrawingBoard
                                onSvgGenerated={(svg) => {
                                    console.log('Generated SVG', svg)
                                    setCustomSvg(svg)
                                }}
                            />
                        </div>
                    </div>
                </div>
                <div className="flex gap-4">
                    <Button onClick={handleFetch} variant="outline">
                        Run
                    </Button>
                    <Button
                        onClick={handleDownload}
                        variant="outline"
                        disabled={!result}
                    >
                        Download
                    </Button>
                </div>
                {loading && (
                    <Progress
                        value={75}
                        className="w-full max-w-xl mx-auto mb-4"
                    />
                )}

                {result && result.properties && (
                    (() => {
                        const target = result.properties.targetDistanceKm
                        const actual = result.properties.totalDistanceKm
                        const error = Math.abs(actual - target) / target
                        const isWithinTolerance = error <= 0.2
                        const errorPercent = Math.round(error * 100)
                        
                        return (
                            <div className={`text-center mb-4 p-4 rounded-xl ${isWithinTolerance ? 'bg-green-50 border border-green-200' : 'bg-orange-50 border border-orange-200'}`}>
                                <h3 className="font-semibold text-lg mb-2">Route Statistics</h3>
                                <p className="text-gray-700">
                                    <strong>Target Distance:</strong> {target} km
                                </p>
                                <p className="text-gray-700">
                                    <strong>Actual Distance:</strong> {actual} km
                                </p>
                                <p className={`font-medium ${isWithinTolerance ? 'text-green-700' : 'text-orange-700'}`}>
                                    <strong>Accuracy:</strong> {errorPercent}% difference {isWithinTolerance ? '✓' : '⚠️'}
                                </p>
                                <p className="text-gray-700">
                                    <strong>Points:</strong> {result.properties.pointCount}
                                </p>
                            </div>
                        )
                    })()
                )}

                {userLocation && (
                    <div className="h-[500px] w-full border rounded-xl overflow-hidden shadow">
                        <DynamicMap
                            center={userLocation}
                            geojsonData={result}
                        />
                    </div>
                )}
            </main>
        </div>
    )
}

export default Home
