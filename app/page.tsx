"use client";

import React, { useState } from "react";
import Head from "next/head";
import axios from "axios";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { GeoJsonObject } from "geojson";
import { FeatureCollection } from "geojson";

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

  const handleFetchNodes = async () => {
    if (!userLocation) {
      alert("Please select or provide a location first.");
      return;
    }
  
    try {
      const response = await axios.post<number[][]>("/api/fit-fetch", {
        location: userLocation,
      });
      console.log("Fetched nodes:", response.data);
      alert(`Fetched ${response.data.length} nodes. Check console for details.`);
    } catch (error) {
      console.error("Error fetching nodes:", error);
    }
  };  

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
          <Button onClick={handleFetchNodes} variant="outline">
             Test Fetch Nodes
          </Button>
        </div>
      </main>
    </div>
  );
};

export default Home;
