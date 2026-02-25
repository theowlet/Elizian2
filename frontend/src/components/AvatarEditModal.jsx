/**
 * Avatar edit modal: filters + export to S3.
 * WebGL used only here; destroyed on close. Card display uses static S3 thumbnail.
 * No base64 in DB; export is blob → upload S3 → save URL + avatar_metadata.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  renderAvatar,
  loadImage,
  canUseWebGL,
  PRESETS,
  canvasToBlob,
  detectFaceLandmarks,
  clearLandmarkCache,
} from "../avatar";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

export default function AvatarEditModal({ card, token, currentAvatarUrl, onClose, onSaved }) {
  const [imageSource, setImageSource] = useState(null);
  const [presetId, setPresetId] = useState("none");
  const [intensity, setIntensity] = useState(0.5);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [landmarks, setLandmarks] = useState(null);
  const fileInputRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const cacheKeyRef = useRef(`card-${card?.id}-${Date.now()}`);

  const updatePreview = useCallback(async () => {
    if (!imageSource) return;
    try {
      let img = imageSource;
      if (typeof img === "string") img = await loadImage(img);
      const canvas = await renderAvatar(img, presetId, intensity, { landmarks });
      if (!canvas) return;
      const ref = previewCanvasRef.current;
      if (ref) {
        ref.width = canvas.width;
        ref.height = canvas.height;
        const ctx = ref.getContext("2d");
        if (ctx) ctx.drawImage(canvas, 0, 0);
      }
    } catch (e) {
      setError(e?.message || "Preview failed");
    }
  }, [imageSource, presetId, intensity, landmarks]);

  useEffect(() => {
    updatePreview();
  }, [updatePreview]);

  // Only set current avatar as source if it actually loads (avoids "Failed to load image" when S3 CORS blocks)
  const initialLoadDone = useRef(false);
  useEffect(() => {
    if (!currentAvatarUrl || initialLoadDone.current) return;
    initialLoadDone.current = true;
    loadImage(currentAvatarUrl)
      .then(() => {
        setError("");
        setImageSource(currentAvatarUrl);
      })
      .catch(() => {
        setError("Current avatar couldn’t be loaded. Choose a new image below.");
        setImageSource(null);
      });
  }, [currentAvatarUrl]);

  const handleFileChange = async (e) => {
    const file = e.target?.files?.[0];
    e.target.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    setImageSource(url);
    setError("");
    try {
      const img = await loadImage(url);
      const key = cacheKeyRef.current;
      const lm = await detectFaceLandmarks(img, { cacheKey: key });
      setLandmarks(lm);
    } catch (_) {
      setLandmarks(null);
    }
  };

  const handleExport = async () => {
    if (!card?.id || !token || !previewCanvasRef.current) return;
    const canvas = previewCanvasRef.current;
    if (canvas.width === 0 || canvas.height === 0) {
      setError("No image to export");
      return;
    }
    setExporting(true);
    setError("");
    try {
      const blob = await canvasToBlob(canvas, "image/jpeg", 0.9);
      const formData = new FormData();
      formData.append("avatar", blob, "avatar.jpg");
      const res = await fetch(
        `${API_BASE}/api/v1/user/membership-cards/${card.id}/avatar/upload`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !data.data?.avatar_url) {
        setError(data?.message || "Upload failed");
        return;
      }
      const avatarUrl = data.data.avatar_url;
      const metadata = { filter: { preset: presetId, intensity } };
      const putRes = await fetch(
        `${API_BASE}/api/v1/user/membership-cards/${card.id}/avatar`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            avatar_type: "upload",
            avatar_original_url: card.avatar_original_url || avatarUrl,
            avatar_display_url: avatarUrl,
            avatar_metadata: metadata,
          }),
        }
      );
      const putData = await putRes.json().catch(() => ({}));
      if (!putRes.ok || !putData.success) {
        setError(putData?.message || "Failed to save avatar");
        return;
      }
      onSaved?.({
        ...card,
        avatar_display_url: avatarUrl,
        avatar_original_url: card.avatar_original_url || avatarUrl,
        avatar_metadata: metadata,
      });
      onClose?.();
    } catch (e) {
      setError(e?.message || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const handleClose = () => {
    if (imageSource && imageSource.startsWith("blob:")) {
      URL.revokeObjectURL(imageSource);
    }
    clearLandmarkCache(cacheKeyRef.current);
    setImageSource(null);
    onClose?.();
  };

  const webglAvailable = canUseWebGL();
  const presetList = Object.values(PRESETS);

  return (
    <div
      className="avatar-edit-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="avatar-edit-title"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 16,
      }}
    >
      <div
        className="avatar-edit-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          background: "#1a1a2e",
          borderRadius: 16,
          maxWidth: 400,
          width: "100%",
          maxHeight: "90vh",
          overflow: "auto",
          padding: 20,
        }}
      >
        <h2 id="avatar-edit-title" style={{ margin: "0 0 16px", fontSize: "1.25rem", paddingRight: 28 }}>
          Edit card avatar
        </h2>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="Choose image"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />

        {!imageSource ? (
          <p style={{ color: "#94a3b8", marginBottom: 16 }}>
            Use current avatar or choose a new image.
          </p>
        ) : null}

        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => {
              if (currentAvatarUrl) {
                setError("");
                setImageSource(currentAvatarUrl);
              }
            }}
            disabled={!currentAvatarUrl}
            style={{
              padding: "8px 14px",
              background: currentAvatarUrl ? "#334155" : "#1e293b",
              border: "none",
              borderRadius: 8,
              color: "#e2e8f0",
              cursor: currentAvatarUrl ? "pointer" : "not-allowed",
              fontSize: "0.9rem",
            }}
          >
            Use current
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: "8px 14px",
              background: "#3b82f6",
              border: "none",
              borderRadius: 8,
              color: "#fff",
              cursor: "pointer",
              fontSize: "0.9rem",
            }}
          >
            Choose image
          </button>
        </div>

        {imageSource && (
          <>
            <div
              style={{
                width: "100%",
                aspectRatio: "1",
                maxHeight: 320,
                background: "#0f172a",
                borderRadius: 12,
                overflow: "hidden",
                marginBottom: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <canvas
                ref={previewCanvasRef}
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                width={0}
                height={0}
              />
            </div>

            <label style={{ display: "block", marginBottom: 6, color: "#94a3b8", fontSize: "0.85rem" }}>
              Filter
            </label>
            <select
              value={presetId}
              onChange={(e) => setPresetId(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                marginBottom: 12,
                background: "#0f172a",
                border: "1px solid #334155",
                borderRadius: 8,
                color: "#e2e8f0",
                fontSize: "0.9rem",
              }}
            >
              {presetList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} {p.engine === "webgl" && !webglAvailable ? "(Canvas)" : ""}
                </option>
              ))}
            </select>

            <label style={{ display: "block", marginBottom: 6, color: "#94a3b8", fontSize: "0.85rem" }}>
              Intensity: {Math.round(intensity * 100)}%
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={intensity}
              onChange={(e) => setIntensity(Number(e.target.value))}
              style={{ width: "100%", marginBottom: 16 }}
            />

            {error && (
              <p style={{ color: "#f87171", fontSize: "0.85rem", marginBottom: 12 }}>{error}</p>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={handleClose}
                style={{
                  padding: "10px 18px",
                  background: "transparent",
                  border: "1px solid #475569",
                  borderRadius: 8,
                  color: "#94a3b8",
                  cursor: "pointer",
                  fontSize: "0.9rem",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting}
                style={{
                  padding: "10px 18px",
                  background: exporting ? "#475569" : "#3b82f6",
                  border: "none",
                  borderRadius: 8,
                  color: "#fff",
                  cursor: exporting ? "wait" : "pointer",
                  fontSize: "0.9rem",
                }}
              >
                {exporting ? "Exporting…" : "Export to card"}
              </button>
            </div>
          </>
        )}

        <button
          type="button"
          onClick={handleClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            background: "none",
            border: "none",
            color: "#94a3b8",
            cursor: "pointer",
            fontSize: "1.25rem",
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
