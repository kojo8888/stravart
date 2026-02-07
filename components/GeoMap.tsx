'use client'

import { MapContainer, TileLayer, Marker, Popup, GeoJSON } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { GeoJsonObject } from 'geojson'

delete (L.Icon.Default.prototype as L.Icon.Default & { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({
    iconRetinaUrl: '/marker-icon-2x.png',
    iconUrl: '/marker-icon.png',
    shadowUrl: '/marker-shadow.png',
})

interface GeoMapProps {
    center: { lat: number; lng: number }
    geojsonData?: GeoJsonObject | null
}

export default function GeoMap({ center, geojsonData }: GeoMapProps) {
    // Create a unique key for the GeoJSON component to force re-render when data changes
    const geoJsonKey = geojsonData ? JSON.stringify(geojsonData).slice(0, 100) : 'no-data'
    
    return (
        <MapContainer
            center={[center.lat, center.lng]}
            zoom={13}
            style={{ height: '100%', width: '100%' }}
        >
            <TileLayer
                attribution="&copy; OpenStreetMap contributors"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Marker position={[center.lat, center.lng]}>
                <Popup>Your Location</Popup>
            </Marker>
            {geojsonData && (
                <GeoJSON
                    key={geoJsonKey}
                    data={geojsonData}
                    style={(feature) => {
                        // Style for LineStrings (routes from graph-based API)
                        if (feature?.geometry?.type === 'LineString') {
                            return {
                                color: '#2563eb', // Blue for routes
                                weight: 4,
                                opacity: 0.9,
                                lineJoin: 'round',
                                lineCap: 'round'
                            }
                        }
                        // Style for Points (old optimization-based API)
                        return {
                            color: '#ff0000',
                            weight: 3,
                            opacity: 0.8
                        }
                    }}
                    pointToLayer={(feature, latlng) => {
                        // Check if this is a waypoint marker for debugging
                        if (feature?.properties?.type === 'waypoint') {
                            const index = feature.properties.index
                            const isFirst = index === 0
                            // Create red circle - larger for first waypoint
                            const marker = L.circleMarker(latlng, {
                                radius: isFirst ? 12 : 8,
                                fillColor: isFirst ? '#16a34a' : '#dc2626', // Green for start, red for others
                                color: '#ffffff',
                                weight: 2,
                                opacity: 1,
                                fillOpacity: 0.9
                            })
                            // Bind popup showing waypoint index (click to see)
                            marker.bindPopup(`Waypoint ${index + 1}`)
                            // Tooltip on hover
                            marker.bindTooltip(`#${index + 1}`, {
                                direction: 'top',
                                offset: [0, -8]
                            })
                            return marker
                        }
                        // Default point style (for optimization-based API)
                        return L.circleMarker(latlng, {
                            radius: 4,
                            fillColor: '#ff0000',
                            color: '#ff0000',
                            weight: 2,
                            opacity: 1,
                            fillOpacity: 0.8
                        })
                    }}
                />
            )}
        </MapContainer>
    )
}
