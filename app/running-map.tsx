"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface Position {
  latitude: number;
  longitude: number;
  timestamp: number;
}

interface RunningMapProps {
  positions: Position[];
  currentPosition?: Position;
  fullScreen?: boolean;
}

export default function RunningMap({ positions, currentPosition, fullScreen = false }: RunningMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // Initialize map
  useEffect(() => {
    if (typeof window === "undefined") return;

    const initializeMap = (latitude: number, longitude: number) => {
      if (!mapRef.current) {
        mapRef.current = L.map("map", {
          attributionControl: false,
          zoomControl: fullScreen,
        }).setView([latitude, longitude], 15);

        // Add tile layer (OpenStreetMap)
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
        }).addTo(mapRef.current);

        // Create polyline for the route
        polylineRef.current = L.polyline([], {
          color: "#4f46e5",
          weight: 4,
          opacity: 0.7,
        }).addTo(mapRef.current);

        // Create marker for current position
        const runnerIcon = L.divIcon({
          className: "runner-icon",
          html: `<div class="w-4 h-4 bg-primary rounded-full border-2 border-white shadow-lg"></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });

        markerRef.current = L.marker([latitude, longitude], { icon: runnerIcon }).addTo(mapRef.current);
      }
    };

    const initializeWithGeolocation = () => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (position.coords.latitude === undefined && position.coords.longitude === undefined) {
            initializeMap(0, 0); // Fallback coordinates
            return;
          }
          initializeMap(position.coords.latitude, position.coords.longitude);
        },
        (error) => {
          console.error("Error getting location:", error);
          initializeMap(0, 0); // Fallback coordinates
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0,
        }
      );
    };

    initializeWithGeolocation();

    // Clean up function
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        polylineRef.current = null;
        markerRef.current = null;
      }
    };
  }, [fullScreen]);

  // Update route and position when positions change
  useEffect(() => {
    if (!mapRef.current || !polylineRef.current || !markerRef.current) return;

    if (positions.length > 0) {
      const latLngs = positions.map((pos) => L.latLng(pos.latitude, pos.longitude));
      console.log("positions", positions);
      console.log("latLngs", latLngs);
      polylineRef.current.setLatLngs([latLngs]);

      if (currentPosition) {
        const currentLatLng = L.latLng(currentPosition.latitude, currentPosition.longitude);
        markerRef.current.setLatLng(currentLatLng);

        if (!fullScreen) {
          mapRef.current.panTo(currentLatLng);
        } else if (positions.length > 1) {
          mapRef.current.fitBounds(polylineRef.current.getBounds(), {
            padding: [50, 50],
          });
        }
      }

      if (positions.length === 1) {
        const zoom = fullScreen ? 15 : 17;
        mapRef.current.setView([positions[0].latitude, positions[0].longitude], zoom);
      }
    }
  }, [positions, currentPosition, fullScreen]);

  return <div id="map" className={fullScreen ? "w-full h-full" : "w-full h-full rounded-lg"} aria-label="Running route map" />;
}
