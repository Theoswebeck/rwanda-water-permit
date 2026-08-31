# RWB Water Permit Data API — Guide for Government Agencies

Base URL: `https://waterpermit.rwb.rw/api/v1`

All endpoints are **read-only GET** requests authenticated with your institution's API
key. Keys are issued by the Rwanda Water Resources Board after an approved access
request, are valid for a fixed period, and work only for the endpoint groups granted.

---

## Authentication

Send your key in the `X-API-Key` header (or as a bearer token):

```
X-API-Key: rwb_live_3f9c2a7e51b84d06a1c2e3f4a5b6c7d8e9f0a1b2c3d4e5f6
```

- Keys look like `rwb_<live|uat>_<48 hex>`. Keep the full key secret — treat it like a
  password. If it leaks, ask RWB to reissue it (the old key is revoked immediately).
- The key is shown **once** when issued. RWB cannot retrieve it again, only reissue.

## Response envelope

Success: `{ "data": …, "meta": … }`
Error: `{ "error": { "code": "…", "message": "…" } }`

| HTTP | code | meaning |
|---|---|---|
| 400 | `INVALID_PARAMS` | Missing/invalid query parameters |
| 401 | `INVALID_KEY` | Key missing or not recognised |
| 403 | `GRANT_EXPIRED` | Key past its validity period — ask RWB to renew |
| 403 | `GRANT_REVOKED` | Key revoked by RWB |
| 403 | `SCOPE_NOT_GRANTED` | Key not granted this endpoint group |
| 404 | `NOT_FOUND` | Permit number unknown |
| 429 | `RATE_LIMITED` | Over your per-minute limit (`Retry-After` header is set) |

Default rate limit: **60 requests/minute** per key.

---

## Endpoint groups

### 1. Permit verification — `GET /api/v1/permits/verify`

```bash
curl -H "X-API-Key: $KEY" \
  "https://waterpermit.rwb.rw/api/v1/permits/verify?permit_number=RWB-2024-00123"
```

```json
{
  "data": {
    "permit_number": "RWB-2024-00123",
    "valid": true,
    "status": "active",
    "status_label": "Active",
    "permit_type": "abstraction",
    "holder_name": "ACME Water Ltd",
    "activity": "Industrial use",
    "water_source": "Borehole",
    "issued_date": "2024-03-15",
    "expiry_date": "2027-03-14",
    "location": "Gasabo, Ndera",
    "province": "Kigali City", "district": "Gasabo", "sector": "Ndera",
    "source": "permits",
    "verified_at": "2026-08-31T10:20:30Z"
  }
}
```

An unknown permit number is a valid answer, not an error:
`{ "data": { "permit_number": "…", "valid": false, "status": "not_found", … } }`
Deactivated permits (suspended/revoked) return `valid: false` with status only — no
details, mirroring the public verification page.

### 2. Permit records — `GET /api/v1/permits/{permit_number}`

Full public record for one permit (same fields as verify, plus water allowance and
coordinates). Permit numbers containing slashes must be URL-encoded.

```bash
curl -H "X-API-Key: $KEY" \
  "https://waterpermit.rwb.rw/api/v1/permits/RWB%2F2024%2F00123"
```

`404 NOT_FOUND` when the number is unknown.

### 2b. Registry search — `GET /api/v1/permits`

| Parameter | Notes |
|---|---|
| `q` | free text across permit number, district, sector, catchments |
| `province`, `district`, `sector`, `water_source`, `purpose` | exact-match filters |
| `status` | e.g. `active`, `expired` |
| `limit` | 1–200 (default 50) |
| `offset` | pagination |

```bash
curl -H "X-API-Key: $KEY" \
  "https://waterpermit.rwb.rw/api/v1/permits?district=Gasabo&status=active&limit=100"
```

```json
{
  "data": [
    { "permit_number": "…", "status": "active", "water_source": "borehole",
      "purpose": "irrigation", "issued_date": "…", "expiry_date": "…",
      "province": "Kigali City", "district": "Gasabo", "sector": "…",
      "catchment1": "…", "catchment2": "…" }
  ],
  "meta": { "total": 512, "limit": 100, "offset": 0, "returned": 100 }
}
```

The search covers the **public permit registry** — the same records published on the
public registry page. No holder or contact fields exist on this endpoint.

### 3. Aggregate statistics — `GET /api/v1/statistics/summary`

The Water Use Dashboard, machine-readable: headline status totals and permit counts by
activity, district, and catchment. Cached for 5 minutes — the numbers are identical to
the public dashboard.

```bash
curl -H "X-API-Key: $KEY" \
  "https://waterpermit.rwb.rw/api/v1/statistics/summary"
```

```json
{
  "data": {
    "generatedAt": "2026-08-31T10:15:00Z",
    "totals": { "total": 4812, "operational": 3901, "expired": 640, "cancelled": 71, "expiringSoon": 200 },
    "byActivity":  [ { "key": "industrial", "label": "Industrial", "count": 1204, "percentage": 25.0 } ],
    "byDistrict":  [ { "key": "Gasabo", "label": "Gasabo", "count": 512, "percentage": 10.6 } ],
    "byCatchment": [ { "key": "NYB", "label": "Nyabarongo", "count": 1830, "percentage": 38.0 } ],
    "catchmentAttribution": { "fromCoordinates": 4410, "estimatedFromLocation": 302, "unattributed": 100 }
  }
}
```

Tip: `?by=activity` (or `district` / `catchment`) returns just that bucket array:

```json
{ "data": { "generatedAt": "…", "by": "activity", "buckets": [ … ] } }
```

---

## Terms of use

- Permit data may be used only for the institutional purpose stated in the access
  request, in line with Rwanda's Law №058/2021 on the protection of personal data and
  privacy.
- Keys are institution-wide credentials: store them in server-side configuration, never
  in client-side code or public repositories.
- RWB can revoke a key at any time; abuse of rate limits or attempts to enumerate the
  registry beyond the granted scope result in revocation.

Questions: contact the Rwanda Water Resources Board (info@rwb.rw).
