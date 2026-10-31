# Users & staff API contract (frontend expectations)

Used by `/users` when `VITE_USE_MOCKS=false`. Types: `frontend/src/types/user.ts`.
**Every endpoint requires the admin role** — return **403** for staff and customers (R7: only the admin adds staff).
These are internal team members (`admin` / `staff`). Customers are created by sign-up and live under `/api/customers`.

## Team member object

```json
{ "id": 2, "name": "Riya Staff", "email": "staff@subscriptiq.com", "role": "staff",
  "active": true, "last_login": "2026-10-30T06:12:00Z", "created_at": "2026-02-11T09:00:00Z" }
```

## Endpoints

| Method & path | Notes |
|---|---|
| `GET /api/users` | Paginated. Params: `page`, `page_size`, `search` (name/email), `sort_by`, `sort_dir`, `role` (`admin`/`staff`), `active` (`true`/`false`). Only admin + staff rows. |
| `GET /api/users/counts` | `{ "all": 3, "admin": 1, "staff": 2, "disabled": 0 }` |
| `POST /api/users` | See below. |
| `PUT /api/users/{id}` | `{ "name": "...", "role": "staff" }` — email is the login and isn't changed here. |
| `PATCH /api/users/{id}` | `{ "active": false }` — disable / enable. Disabling revokes their sessions. |
| `POST /api/users/{id}/password-reset` | Emails a reset link (same flow as forgot password). → `{ "message": "Password reset link sent to …" }` |

### POST `/api/users`

```json
// invite by email (recommended)
{ "name": "Riya Sharma", "email": "riya@subscriptiq.com", "role": "staff", "send_invite": true }

// or a temporary password
{ "name": "Riya Sharma", "email": "riya@subscriptiq.com", "role": "staff", "send_invite": false, "password": "Welcome@2026" }

// 201
{ "user": { "...team member..." }, "message": "Invite sent to riya@subscriptiq.com" }
```

- **409** if any account (staff *or* customer) already uses the email (R2).
- **422** if `send_invite` is false and the password breaks the rules (R3: more than 8 characters, upper, lower, special).
- Invite = a set-password link (`/reset-password?token=…`), valid 30 minutes, single use.

## Safety rules the backend must enforce

- An admin **can't change their own role** or **disable themselves** → 422.
- There must always be **at least one active admin** — demoting or disabling the last one → 422.
- `POST /api/auth/login` for a disabled account → **403** `{ "detail": "This account has been disabled. Contact your admin." }`
