# Auth API contract (frontend expectations)

The frontend auth pages call these endpoints when `VITE_USE_MOCKS=false`.
All bodies are **JSON** (not form data). Errors use FastAPI's `{ "detail": "message" }` shape — the `detail` text is shown to the user as-is.

## POST `/api/auth/login`

```json
// request
{ "email": "admin@subscriptiq.com", "password": "Admin@1234" }

// 200
{
  "access_token": "<jwt>",
  "token_type": "bearer",
  "user": { "id": 1, "name": "Admin", "email": "admin@subscriptiq.com", "role": "admin" }
}
```

- `role` is one of `"admin" | "staff" | "customer"`. Admin/staff go to `/`, customers go to `/portal`.
- **401** `{ "detail": "Incorrect email or password." }`

## POST `/api/auth/signup`

Creates a **customer** account (staff are added by the admin elsewhere — R7).

```json
// request
{ "name": "Asha Menon", "email": "asha@shop.com", "password": "Abcdefg@1", "phone": "+91…", "company": "Shop" }

// 201
{ "user": { "id": 4, "name": "Asha Menon", "email": "asha@shop.com", "role": "customer" } }
```

- `phone` and `company` are optional.
- **409** when the email already exists (R2) — frontend shows `detail` under the email field.
- **422** if the password breaks the rule (R3): more than 8 characters, at least one uppercase, one lowercase and one special character. The frontend checks this too, but the backend must enforce it.

## POST `/api/auth/forgot-password`

```json
// request
{ "email": "asha@shop.com" }

// 200 — same response whether or not the email exists
{ "message": "If this email is registered, a password reset link has been sent to it." }
```

- Email link format: `{FRONTEND_URL}/reset-password?token=<token>`
- Frontend copy says the link expires in **30 minutes** and works **once**.

## POST `/api/auth/reset-password`

```json
// request
{ "token": "<token from link>", "new_password": "Newpass#123" }

// 200
{ "message": "Your password has been reset. You can now log in." }
```

- **400** when the token is invalid, expired or already used — frontend shows "Request a new link".
- **422** if the new password breaks the R3 rule.

## Authenticated requests

Every other request sends `Authorization: Bearer <access_token>`.
A **401** on any non-auth endpoint logs the user out and sends them to `/login`.
