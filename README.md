# 🚴 Strava Art — Shape Fitting on Street Networks

**Create bike routes that draw fun shapes (heart, boat, cat, etc.) across city streets!**

This project lets users choose a city and either pick a shape (heart, circle, square) or describe any shape in natural language ("boat", "tree", "smiley face"). The system fits the shape into the real-world street network using OpenStreetMap data and mathematical optimization.

## 🗺 Features

✅ Dynamic city selection (Munich, Berlin, Hamburg, or user’s location).  
✅ Predefined shape options: heart, circle, square.  
✅ **AI-powered free shape generation** via ChatGPT — just type what you want!  
✅ Real street network data fetched from Overpass Turbo API.  
✅ Shape fitting using mathematical optimization (minimizing distance to nearby street nodes).  
✅ Result displayed on interactive Leaflet map.  
✅ Download fitted shapes as GeoJSON.

## 🏗 Architecture

### Frontend (`page.tsx`)
- Built with Next.js 14.
- UI components: city selector, shape input (text), submit button, Leaflet map.
- Posts data to `/api/fit-shape`.

### Backend (`api/fit-shape/route.ts`)
1. Receives city/location + shape name.
2. Fetches local street network (1.5 km radius) using Overpass Turbo.
3. If shape is **predefined** → generate coordinates.
4. If shape is **custom** → query GPT-4o to get outline coordinates.
5. Fits the shape into the street network using an optimization algorithm (minimizing distance between shape points and street nodes).
6. Returns GeoJSON with the fitted points.

## 🤖 OpenAI Integration

For custom shapes, the backend calls the ChatGPT API (`gpt-4o`) with a prompt like:

> "Given the shape name 'boat', return 100 outline coordinates (x,y) as a JSON array."

**Environment variable required**:

```bash
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxx
