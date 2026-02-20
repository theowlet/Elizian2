import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";
import "leaflet/dist/leaflet.css";
import "../styles/venueMap.css";

// Logo marker – Z logo on black circle with gold/white ring
const MAP_MARKER_LOGO_URL = "/images/map-marker-logo.png";

function createLogoIcon() {
  const size = 32;
  const html = `
    <span class="venue-logo-marker" aria-hidden="true">
      <img src="${MAP_MARKER_LOGO_URL}" alt="" width="${size}" height="${size}" class="venue-logo-img" />
    </span>
  `;
  return L.divIcon({
    className: "venue-logo-marker-wrap",
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const DEFAULT_CENTER = [20.5937, 78.9629]; // India
const DEFAULT_ZOOM = 4;

// Opens SweetAlert with full venue details on marker click (so the alert shows properly)
function openVenueSweetAlert(venue, API_BASE, navigate) {
  Swal.fire({
    title: venue.name || "Venue",
    allowOutsideClick: true,
    showCancelButton: true,
    confirmButtonText: "View full venue",
    cancelButtonText: "Close",
    showClass: { popup: "swal2-show" },
    didOpen: () => {
      Swal.showLoading();
      fetch(`${API_BASE}/api/v1/partners/${venue.id}/venue-detail`)
        .then((r) => r.json())
        .then((data) => {
          const v = data?.success && data?.data ? data.data : venue;
          const category = v.category_name || v.category_slug || "";
          const address = v.formatted_address || v.address || "";
          const phone = v.phone_number || "";
          const description = v.description || "";
          const offers = (v.offers || []).slice(0, 5);
          const html = `
            <div class="venue-swal-content" style="text-align:left; max-height: 50vh; overflow-y: auto;">
              ${category ? `<div style="font-size:0.85rem; color:#64748b; margin-bottom:8px;">${escapeHtml(category)}</div>` : ""}
              ${description ? `<p style="margin:0 0 8px; font-size:0.9rem; line-height:1.4; color:#334155;">${escapeHtml(description)}</p>` : ""}
              ${address ? `<p style="margin:0 0 4px; font-size:0.85rem; color:#475569;">📍 ${escapeHtml(address)}</p>` : ""}
              ${phone ? `<p style="margin:0 0 8px; font-size:0.85rem;"><a href="tel:${escapeHtml(phone)}">${escapeHtml(phone)}</a></p>` : ""}
              ${offers.length > 0 ? `<div style="margin-bottom:8px; font-size:0.85rem; color:#475569;"><strong>Offers:</strong> ${offers.map((o) => escapeHtml(o.title || o.perk_type || "")).filter(Boolean).join(" · ") || "—"}</div>` : ""}
            </div>
          `;
          Swal.fire({
            title: v.name || venue.name,
            html,
            allowOutsideClick: true,
            showCancelButton: true,
            confirmButtonText: "View full venue",
            cancelButtonText: "Close",
            showClass: { popup: "swal2-show" },
            width: "min(420px, 92vw)",
          }).then((result) => {
            if (result.isConfirmed) navigate(`/venue/${venue.id}`);
          });
        })
        .catch(() => {
          Swal.fire({
            title: venue.name,
            html: "<p style='color:#64748b'>Could not load details.</p>",
            showCancelButton: true,
            confirmButtonText: "View full venue",
            cancelButtonText: "Close",
          }).then((result) => {
            if (result.isConfirmed) navigate(`/venue/${venue.id}`);
          });
        });
    },
  });
}

function escapeHtml(text) {
  if (text == null) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

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
  const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
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
            {venuesWithCoords.length} venue{venuesWithCoords.length !== 1 ? "s" : ""} on map
            {venues.length > venuesWithCoords.length && (
              <span style={{ opacity: 0.85 }}> ({venues.length - venuesWithCoords.length} without location)</span>
            )}
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
              icon={createLogoIcon()}
              eventHandlers={{
                click: () => openVenueSweetAlert(venue, API_BASE, navigate),
              }}
            />
          ))}
          {mapReady && venuesWithCoords.length > 0 && <FitBounds venues={venuesWithCoords} getCoords={getVenueCoords} />}
        </MapContainer>
      </div>

      {!loading && venuesWithCoords.length === 0 && venues.length > 0 && (
        <div style={{ padding: "12px 16px", background: "#2d2d44", color: "#ccc", fontSize: "0.9rem" }}>
          No venues have location set. View them from the home feed.
        </div>
      )}
      {!loading && venuesWithCoords.length > 0 && venues.length > venuesWithCoords.length && (
        <div style={{ padding: "8px 16px", background: "#2d2d44", color: "#9ca3af", fontSize: "0.8rem" }}>
          Only venues with a set location appear on the map. To show more venues, add latitude/longitude in Partner Console or Admin.
        </div>
      )}
    </div>
  );
};

export default VenueMapPage;
