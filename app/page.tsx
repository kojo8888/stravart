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
import dynamic from 'next/dynamic'

const DynamicMap = dynamic(
    () => import('@/components/GeoMap').then((mod) => mod.default),
    { ssr: false }
)

interface Coordinates {
    lat: number
    lng: number
}

//TODO: Add input search box for places
const cities: Record<string, Coordinates> = {
    Munich: { lat: 48.1351, lng: 11.582 },
    Berlin: { lat: 52.52, lng: 13.405 },
    Hamburg: { lat: 53.5511, lng: 9.9937 },
}

const Home: React.FC = () => {
    const [userLocation, setUserLocation] = useState<Coordinates | null>(null)
    const [selectedCity, setSelectedCity] = useState<string>('')
    const [selectedShape, setSelectedShape] = useState<string>('')
    const [selectedSize, setSelectedSize] = useState<string>('1500')
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState<any | null>(null)
    const [searchQuery, setSearchQuery] = useState('')

    const getUserLocation = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((position) => {
                const loc = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                }
                console.log('[FRONTEND] User location acquired:', loc)
                setUserLocation(loc)
            })
        } else {
            alert('Geolocation is not supported by your browser.')
            console.warn('[FRONTEND] Geolocation not supported.')
        }
    }

    const handleSearchPlace = async () => {
        if (!searchQuery) return

        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
                    searchQuery
                )}`
            )
            const data = await response.json()
            if (data.length > 0) {
                const loc = {
                    lat: parseFloat(data[0].lat),
                    lng: parseFloat(data[0].lon),
                }
                setUserLocation(loc)
                console.log('[NOMINATIM] Found location:', loc)
            } else {
                alert('Place not found. Try a more specific name.')
            }
        } catch (err) {
            console.error('Nominatim search error:', err)
        }
    }

    const handleCitySelect = (city: string) => {
        setSelectedCity(city)
        if (cities[city]) {
            console.log('[FRONTEND] City selected:', city)
            setUserLocation(cities[city])
        }
    }

    const handleShapeSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSelectedShape(e.target.value)
    }

    const handleSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSelectedSize(e.target.value)
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
                radius: parseInt(selectedSize) || 1500,
                shape: selectedShape,
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
                        <Button onClick={getUserLocation}>
                            Get My Location
                        </Button>
                        <Input
                            placeholder="Search for a place"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="mt-2"
                        />
                        <Button onClick={handleSearchPlace} className="mt-2">
                            Search
                        </Button>

                        <p className="mt-2">Or select a city:</p>
                        <Select
                            onValueChange={handleCitySelect}
                            value={selectedCity}
                        >
                            <SelectTrigger className="mt-2">
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
                        {userLocation && (
                            <p className="mt-2 text-sm text-gray-600">
                                {userLocation.lat.toFixed(4)},{' '}
                                {userLocation.lng.toFixed(4)}
                            </p>
                        )}
                        <p className="mt-2">Define the size in meters:</p>
                        <Input
                            placeholder="Umkreis in Metern"
                            className="mt-2"
                            value={selectedSize}
                            onChange={handleSizeChange}
                        />
                    </div>
                    <div className="flex-1 border rounded-xl p-4 shadow">
                        <h2 className="font-semibold mb-2">
                            Select or Describe Shape
                        </h2>
                        <p className="mt-2">
                            Type a shape name or description:
                        </p>
                        <Input
                            placeholder="e.g. heart, boat, cat..."
                            className="mt-2"
                            value={selectedShape}
                            onChange={handleShapeSelect}
                        />
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
