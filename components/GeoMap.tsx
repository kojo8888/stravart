'use client'

import { MapContainer, TileLayer, Marker, Popup, GeoJSON } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { GeoJsonObject } from 'geojson'

delete (L.Icon.Default.prototype as any)._getIconUrl
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
                    style={{
                        color: '#ff0000',
                        weight: 3,
                        opacity: 0.8
                    }}
                    pointToLayer={(feature, latlng) => {
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
