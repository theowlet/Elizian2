# S3 CORS for direct avatar uploads (presigned PUT)

**Note:** The app supports **proxy upload** via `POST /api/v1/user/membership-cards/:cardId/avatar/upload` (multipart). The frontend uses this by default, so **S3 CORS is not required** for avatar uploads to work. Configure CORS only if you want to use the presigned PUT flow from the browser.

For the frontend to upload images **directly to S3** using the presigned PUT URL, the bucket must allow:

- **Method:** `PUT`
- **Origin:** Your frontend origin(s), e.g. `https://yourapp.com`, `http://localhost:5173`, `http://localhost:3000`, `http://localhost:8080`
- **Header:** `Content-Type` (required for presigned PUT with a specific content type)

## 1. AWS Console

1. Open **S3** → your bucket (e.g. the one in `AWS_BUCKET_NAME`) → **Permissions**.
2. Under **Cross-origin resource sharing (CORS)**, edit and use a config like:

```json
[
  {
    "AllowedHeaders": ["*", "Content-Type"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedOrigins": [
      "http://localhost:5173",
      "http://localhost:3000",
      "https://your-production-domain.com"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

- Add every origin your frontend is served from (dev and prod).
- `PUT` is required for presigned uploads; `GET`/`HEAD` for loading images.

## 2. AWS CLI

Save as `cors.json` then:

```bash
aws s3api put-bucket-cors --bucket YOUR_BUCKET_NAME --cors-configuration file://cors.json
```

## 3. Optional: restrict to avatars prefix

If you use a bucket policy that limits writes to `avatars/*`, keep CORS as above; the presigned URL already restricts the key to `avatars/{userId}/{cardId}/...`.

## After CORS is set

- Frontend calls `POST /api/v1/user/membership-cards/:cardId/avatar/upload-url` → gets `uploadUrl`, `finalUrl`.
- Frontend does `fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })`.
- No CORS errors only if the bucket CORS includes that origin and `PUT` + `Content-Type`.
