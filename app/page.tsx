"use client";

import React, { useState, useRef, useEffect } from "react";
import Head from "next/head";
import axios from "axios";
import styles from "../styles/Home.module.css";
import { MapContainer, TileLayer, Marker, GeoJSON, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from 'leaflet';

// Import shadcn UI components (adjust paths based on your project)
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

// Import the GeoJsonObject type
import { GeoJsonObject } from "geojson";

// This ensures Leaflet uses your images from the public folder.
delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: '/marker-icon-2x.png',
  iconUrl: '/marker-icon.png',
  shadowUrl: '/marker-shadow.png',
});

// Define a Coordinates interface for location data
interface Coordinates {
  lat: number;
  lng: number;
}

// Predefined cities with their coordinates (expand as needed)
const cities: { [key: string]: Coordinates } = {
  Munich: { lat: 48.1351, lng: 11.5820 },
  Berlin: { lat: 52.5200, lng: 13.4050 },
  Hamburg: { lat: 53.5511, lng: 9.9937 },
};

// A simple drawing canvas component that captures mouse-drawn points
const DrawingCanvas: React.FC<{ onDrawEnd: (points: { x: number; y: number }[]) => void }> = ({
  onDrawEnd,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [points, setPoints] = useState<{ x: number; y: number }[]>([]);

  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    setPoints([{ x, y }]);
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    setPoints((prev) => [...prev, { x, y }]);
    const context = canvasRef.current!.getContext("2d");
    if (context) {
      context.lineTo(x, y);
      context.stroke();
    }
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
    onDrawEnd(points);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const context = canvas.getContext("2d");
      if (context) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.beginPath();
        if (points.length > 0) {
          context.moveTo(points[0].x, points[0].y);
          points.forEach((pt) => context.lineTo(pt.x, pt.y));
          context.stroke();
        }
      }
    }
  }, [points]);

  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={400}
      style={{ border: "1px solid black" }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    />
  );
};

export default function Home() {
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [selectedCity, setSelectedCity] = useState<string>("");
  // Instead of any, we now type result as GeoJsonObject | null
  const [result, setResult] = useState<GeoJsonObject | null>(null);
  const [drawingData, setDrawingData] = useState<{ x: number; y: number }[]>([]);

  // Step 1: Get user's geolocation
  const getUserLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      });
    } else {
      alert("Geolocation is not supported by your browser.");
    }
  };

  // Step 1 alternative: select a city
  const handleCitySelect = (city: string) => {
    setSelectedCity(city);
    if (cities[city]) {
      setUserLocation(cities[city]);
    }
  };

  // Capture the drawn shape points
  const handleDrawingEnd = (points: { x: number; y: number }[]) => {
    setDrawingData(points);
  };

  // Step 3: Submit data for shape fitting via your backend API
  const handleSubmit = async () => {
    const payload = {
      location: userLocation,
      drawing: drawingData,
    };
    try {
      // Call the API route using a relative URL.
      const response = await axios.post<GeoJsonObject>("/api/fit-heart", payload);
      setResult(response.data);
    } catch (error) {
      console.error("Error submitting data:", error);
    }
  };
  

  // Download the fitted result as JSON
  const handleDownload = () => {
    if (result) {
      const dataStr =
        "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(result, null, 2));
      const downloadAnchorNode = document.createElement("a");
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", "fitted_shape.json");
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
    }
  };

  // Use user location if available; otherwise default to Munich.
  const mapCenter = userLocation || { lat: 48.1351, lng: 11.5820 };

  return (
    <div className={styles.container}>
      <Head>
        <title>Bike Routing & Shape Fitting</title>
        <meta
          name="description"
          content="Interactive Bike Routing & Shape Fitting tool for cyclists. Plan your route, draw custom shapes, and optimize your ride."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        {/* Favicon */}
        <link rel="icon" href="/favicon.ico" />
        {/* Google Fonts */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
        {/* Optional: Link to an external CSS library for additional styling */}
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css"
          integrity="sha512-Fo3rlrZj/kTc0L7Jw5f7S6TcJ1o1sK9sl7oMJ5cw5R4Z9TtFEqM7I2RyJdvZV/6kC9Z5xGniH2gCO0hrX+jBg=="
          crossOrigin="anonymous"
          referrerPolicy="no-referrer"
        />
      </Head>
      <main className={styles.main}>
        <h1>Bike Routing & Shape Fitting</h1>
        <div className={styles.topRow}>
          {/* Box 1: Input Parameters */}
          <div className={styles.box}>
            <h2>Location</h2>
            <Button onClick={getUserLocation}>Get My Location</Button>
            <p>Or select a city:</p>
            <Select onValueChange={handleCitySelect} value={selectedCity}>
              <SelectTrigger>{selectedCity ? selectedCity : "Select a city"}</SelectTrigger>
              <SelectContent>
                {Object.keys(cities).map((city) => (
                  <SelectItem key={city} value={city}>
                    {city}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {userLocation && (
              <p>
                {userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}
              </p>
            )}
          </div>

          {/* Box 2: Drawing Canvas */}
          <div className={styles.box}>
            <h2>Draw Your Shape</h2>
            <DrawingCanvas onDrawEnd={handleDrawingEnd} />
            {drawingData.length > 0 && <p>{drawingData.length} points drawn.</p>}
          </div>

          {/* Box 3: Download Box */}
          <div className={styles.box}>
            <h2>Download Result</h2>
            <Button onClick={handleSubmit}>Submit Data</Button>
            {result && (
              <Button onClick={handleDownload} variant="secondary">
                Download JSON
              </Button>
            )}
          </div>
        </div>

        {/* Big Map Box */}
        <div className={styles.mapBox}>
          <MapContainer
            center={[mapCenter.lat, mapCenter.lng] as [number, number]}
            zoom={10}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              attribution='&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Marker position={[mapCenter.lat, mapCenter.lng]}>
              <Popup>Your Location</Popup>
            </Marker>
            {result && <GeoJSON data={result} />}
          </MapContainer>
        </div>
      </main>
    </div>
  );
}
