# Hybrid Avatar Rendering

- **Phase 1:** Canvas-based filters (color, glow, posterize, caricature, badge).
- **Phase 2:** WebGL-accelerated filters (cartoon, aura; big_eyes/face_shrink ready for landmarks).
- **Constraints:** All images in S3; no base64 in DB. WebGL only in edit modal; card display uses static S3 thumbnail. Graceful fallback to Canvas if WebGL unavailable.

## Structure

- `constants.js` – Presets and engine routing (`presetRequiresWebGL`, `getEngineForPreset`).
- `renderAvatar.js` – `renderAvatar(image, preset, intensity)` routes to WebGL or Canvas.
- `canvasEngine.js` – Canvas filters; `canvasToBlob()` for export.
- `webglEngine.js` – WebGL renderer; max texture 512px; destroy on modal close; `isWebGLAvailable()` for fallback.
- `faceDetection.js` – Face landmark cache; run once per upload; MediaPipe integration point.
- `index.js` – Public API.

## Export flow

1. User applies preset + intensity in **Avatar Edit Modal**.
2. Preview uses `renderAvatar()` (Canvas or WebGL).
3. On **Export**: `canvasToBlob(previewCanvas)` → `POST /api/v1/user/membership-cards/:cardId/avatar/upload` (multipart) → backend uploads to S3, returns `avatar_url`.
4. Frontend then `PUT .../avatar` with `avatar_display_url`, `avatar_metadata: { filter: { preset, intensity } }`.
5. Card display continues to use `card.avatar_display_url` (S3 URL only).

## Existing upload logic

- Backend `POST .../avatar/upload` and `PUT .../avatar` are unchanged.
- Profile opens **AvatarEditModal** on edit; modal handles choose image → filters → export. No direct file-input upload from card anymore; all avatar updates go through the modal and S3.
