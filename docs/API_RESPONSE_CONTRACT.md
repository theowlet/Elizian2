# API response contract

Backend APIs use a consistent response shape so frontends can handle success and errors uniformly.

## Success responses

- **Shape:** `{ success: true, message: string, data?: T }`
- **Status:** `2xx`
- **Usage:** Payload is in `data`. For list endpoints, `data` is usually the array (e.g. list of bookings, offers, events). Some endpoints return `data` as an object (e.g. `{ conversation, messages }`).

## Error responses

- **Shape:** `{ success: false, message: string, error: string [, details? ] }`
- **Status:** `4xx` or `5xx`
- **Usage:** Prefer `message` or `error` (both are set to the same value). Use `data?.message ?? data?.error ?? 'Request failed'` for display.

## Field consistency

- **Offers (venue detail / list):** Include `image_url` (full URL via S3), `perk_type`, `perk_description` where applicable.
- **List endpoints:** Return arrays in `data` unless documented otherwise (e.g. messaging returns `{ conversation, messages }`).
