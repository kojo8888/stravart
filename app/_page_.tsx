"use client";

import React, { useState } from "react";
import Head from "next/head";
import axios from "axios";
import { MapContainer, TileLayer, Marker, GeoJSON, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { FeatureCollection } from "geojson";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { GeoJsonObject } from "geojson";

L.Icon.Default.mergeOptions({
  iconRetinaUrl: "/marker-icon-2x.png",
  iconUrl: "/marker-icon.png",
  shadowUrl: "/marker-shadow.png",
});

interface Coordinates {
  lat: number;
  lng: number;
}

const cities: Record<string, Coordinates> = {
  Munich: { lat: 48.1351, lng: 11.582 },
  Berlin: { lat: 52.52, lng: 13.405 },
  Hamburg: { lat: 53.5511, lng: 9.9937 },
};

const Home: React.FC = () => {
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [selectedCity, setSelectedCity] = useState<string>("");
  const [selectedShape, setSelectedShape] = useState<string>("");
  const [result, setResult] = useState<GeoJsonObject | null>(null);

  const getUserLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((position) => {
        const loc = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        console.log("[FRONTEND] User location acquired:", loc);
        setUserLocation(loc);
      });
    } else {
      alert("Geolocation is not supported by your browser.");
      console.warn("[FRONTEND] Geolocation not supported.");
    }
  };

  const handleCitySelect = (city: string) => {
    setSelectedCity(city);
    if (cities[city]) {
      console.log("[FRONTEND] City selected:", city);
      setUserLocation(cities[city]);
    }
  };

  const handleShapeSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedShape(e.target.value);
  };

  const handleSubmit = async () => {
    if (!userLocation || !selectedShape) {
      console.warn("[FRONTEND] Location or shape missing.");
      return;
    }

    const payload = {
      location: userLocation,
      shape: selectedShape,
    };

    console.log("[FRONTEND] Submitting payload to backend:", payload);

    try {
      const response = await axios.post<FeatureCollection>("/api/fit-shape", payload);
      console.log("[FRONTEND] Received GeoJSON result from backend:", response.data);
      setResult(response.data);
    } catch (error) {
      console.error("[FRONTEND] Error submitting data to backend:", error);
    }
  };

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

  const mapCenter = userLocation || cities["Munich"];

  return (
    <div className="min-h-screen p-4 bg-white text-gray-900">
      <Head>
        <title>Bike Routing & Shape Fitting</title>
        <meta name="description" content="Interactive Bike Routing & Shape Fitting tool." />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="flex flex-col gap-6">
        <h1 className="text-3xl font-bold text-center mb-4">Bike Routing & Shape Fitting</h1>

        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 border rounded-xl p-4 shadow">
            <h2 className="font-semibold mb-2">Location</h2>
            <Button onClick={getUserLocation}>Get My Location</Button>
            <p className="mt-2">Or select a city:</p>
            <Select onValueChange={handleCitySelect} value={selectedCity}>
              <SelectTrigger className="mt-2">
                {selectedCity || "Select a city"}
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
                {userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}
              </p>
            )}
          </div>

          <div className="flex-1 border rounded-xl p-4 shadow">
            <h2 className="font-semibold mb-2">Select or Describe Shape</h2>
            <p className="mt-2">Or tell ChatGPT what form you are looking for:</p>
            <Input
              placeholder="e.g. a heart, boat, cat..."
              className="mt-2"
              value={selectedShape}
              onChange={handleShapeSelect}
            />
          </div>
        </div>

        <div className="flex gap-4">
          <Button onClick={handleSubmit}>Submit</Button>
          {result && (
            <Button onClick={handleDownload} variant="secondary">
              Download JSON
            </Button>
          )}
        </div>

        <div className="h-[500px] w-full border rounded-xl overflow-hidden shadow">
          <MapContainer
            center={[mapCenter.lat, mapCenter.lng]}
            zoom={12}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
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
};

export default Home;
