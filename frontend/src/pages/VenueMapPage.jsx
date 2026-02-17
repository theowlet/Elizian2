import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "../styles/venueMap.css";

// Small glitter marker for venue locations (no default pin)
function createGlitterIcon() {
  return L.divIcon({
    className: "venue-glitter-marker",
    html: `<span class="venue-glitter-dot" style="display:block;width:12px;height:12px;border-radius:50%;background:radial-gradient(circle at 30% 30%,#fff,#f5e6a3 25%,#e8c547 50%,#c9a227 75%,#a67c00);box-shadow:0 0 0 1px rgba(255,255,255,0.6),0 0 8px 2px rgba(230,180,50,0.6);" aria-hidden="true"></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

const DEFAULT_CENTER = [20.5937, 78.9629]; // India
const DEFAULT_ZOOM = 4;

function FitBounds({ venues, getCoords }) {
  const map = useMap();
  const withCoords = venues.filter((v) => getCoords(v) !== null);
  if (withCoords.length === 0) return null;
  if (withCoords.length === 1) {
    map.setView(getCoords(withCoords[0]), 14);
    return null;
  }
  const bounds = L.latLngBounds(withCoords.map((v) => getCoords(v)));
  map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  return null;
}

const VenueMapPage = () => {
  const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";
  const navigate = useNavigate();
  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [mapReady, setMapReady] = useState(false);

  const fetchVenues = useCallback(
    async (lat, lon, isRefetch = false) => {
      if (!isRefetch) setLoading(true);
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
          if (!isRefetch) setVenues([]);
          return;
        }
        const list = Array.isArray(data.data) ? data.data : Array.isArray(data.partners) ? data.partners : [];
        setVenues(list);
      } catch (err) {
        setError(err.message || "Failed to load venues");
        if (!isRefetch) setVenues([]);
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
          fetchVenues(pos.coords.latitude, pos.coords.longitude, true);
        }
      },
      () => {},
      { enableHighAccuracy: false, timeout: 5000 }
    );
    return () => {
      cancelled = true;
    };
  }, [fetchVenues]);

  const getVenueCoords = (v) => {
    const lat = v.latitude != null ? Number(v.latitude) : v.lat != null ? Number(v.lat) : null;
    const lon = v.longitude != null ? Number(v.longitude) : v.lng != null ? Number(v.lng) : null;
    if (lat == null || lon == null || Number.isNaN(lat) || Number.isNaN(lon) || (lat === 0 && lon === 0)) return null;
    return [lat, lon];
  };
  const venuesWithCoords = venues.filter((v) => getVenueCoords(v) !== null);

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
        {!loading && (
          <span style={{ fontSize: "0.85rem", opacity: 0.9 }}>
            {venuesWithCoords.length} venue{venuesWithCoords.length !== 1 ? "s" : ""}
            {userLocation ? " · Sorted by distance" : ""}
          </span>
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
              position={getVenueCoords(venue)}
              icon={createGlitterIcon()}
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
          {mapReady && venuesWithCoords.length > 0 && <FitBounds venues={venuesWithCoords} getCoords={getVenueCoords} />}
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
