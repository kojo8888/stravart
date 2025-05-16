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
            {geojsonData && <GeoJSON data={geojsonData} />}
        </MapContainer>
    )
}
