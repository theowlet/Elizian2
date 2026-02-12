import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default marker icons in react-leaflet (webpack/vite)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

const DEFAULT_CENTER = [20.5937, 78.9629]; // India
const DEFAULT_ZOOM = 4;

function FitBounds({ venues }) {
  const map = useMap();
  const withCoords = venues.filter((v) => v.latitude != null && v.longitude != null);
  if (withCoords.length === 0) return null;
  if (withCoords.length === 1) {
    map.setView([Number(withCoords[0].latitude), Number(withCoords[0].longitude)], 14);
    return null;
  }
  const bounds = L.latLngBounds(
    withCoords.map((v) => [Number(v.latitude), Number(v.longitude)])
  );
  map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  return null;
}

const VenueMapPage = () => {
  const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:5001";
  const navigate = useNavigate();
  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [mapReady, setMapReady] = useState(false);

  const fetchVenues = useCallback(
    async (lat, lon) => {
      setLoading(true);
      setError(null);
      try {
        let url = `${API_BASE}/api/v1/partners`;
        const params = new URLSearchParams();
        if (lat != null && lon != null) {
          params.set("lat", lat);
          params.set("lon", lon);
        }
        if (params.toString()) url += `?${params.toString()}`;
        const res = await fetch(url);
        const data = await res.json();
        if (!res.ok) {
          setError(data?.message ?? data?.error ?? "Failed to load venues");
          setVenues([]);
          return;
        }
        const list = Array.isArray(data.data) ? data.data : [];
        setVenues(list);
      } catch (err) {
        setError(err.message || "Failed to load venues");
        setVenues([]);
      } finally {
        setLoading(false);
      }
    },
    [API_BASE]
  );

  useEffect(() => {
    fetchVenues();
  }, [fetchVenues]);

  useEffect(() => {
    let cancelled = false;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!cancelled) {
          setUserLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude });
          fetchVenues(pos.coords.latitude, pos.coords.longitude);
        }
      },
      () => {},
      { enableHighAccuracy: false, timeout: 5000 }
    );
    return () => {
      cancelled = true;
    };
  }, [fetchVenues]);

  const venuesWithCoords = venues.filter((v) => v.latitude != null && v.longitude != null);

  return (
    <div className="venue-map-page" style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <header className="venue-map-header" style={{ padding: "12px 16px", background: "#1a1a2e", color: "#eee", display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="btn-back"
          style={{ background: "transparent", border: "none", color: "#eee", cursor: "pointer", fontSize: "1.25rem" }}
          aria-label="Go back"
        >
          ←
        </button>
        <h1 style={{ margin: 0, fontSize: "1.25rem" }}>Venues on map</h1>
        {userLocation && (
          <span style={{ fontSize: "0.85rem", opacity: 0.9 }}>Sorted by distance</span>
        )}
      </header>

      {loading && (
        <div style={{ padding: "20px", textAlign: "center", background: "#16213e", color: "#eee" }}>
          Loading venues…
        </div>
      )}
      {error && (
        <div style={{ padding: "12px 16px", background: "#4a0e0e", color: "#fbb" }}>
          {error}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={DEFAULT_ZOOM}
          style={{ height: "100%", width: "100%" }}
          whenReady={() => setMapReady(true)}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {venuesWithCoords.map((venue) => (
            <Marker
              key={venue.id}
              position={[Number(venue.latitude), Number(venue.longitude)]}
            >
              <Popup>
                <div style={{ minWidth: "160px" }}>
                  <strong>{venue.name}</strong>
                  {venue.city && <div style={{ fontSize: "0.9rem", color: "#555" }}>{venue.city}</div>}
                  <button
                    type="button"
                    onClick={() => navigate(`/venue/${venue.id}`)}
                    style={{ marginTop: "8px", padding: "6px 12px", cursor: "pointer", background: "#1a1a2e", color: "#eee", border: "none", borderRadius: "6px" }}
                  >
                    View venue
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
          {mapReady && venuesWithCoords.length > 0 && <FitBounds venues={venuesWithCoords} />}
        </MapContainer>
      </div>

      {!loading && venuesWithCoords.length === 0 && venues.length > 0 && (
        <div style={{ padding: "12px 16px", background: "#2d2d44", color: "#ccc", fontSize: "0.9rem" }}>
          No venues have location set. View them from the home feed.
        </div>
      )}
    </div>
  );
};

export default VenueMapPage;
