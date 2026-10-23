# Clipzy: short-video mobile app

An original short-video app (vertical feed, record/upload, likes, comments, follows, search, profiles, reporting/blocking, account deletion).

- `mobile/`: Expo SDK 58 / React Native / TypeScript (Expo Router)
- `backend/`: Node 22 + Express + PostgreSQL, S3-compatible storage
- `PARAMETERS.md`: **every credential, account and asset you need to provide**

## Run it locally

```bash
# 1. API + database (needs Docker)
docker compose up --build            # API on http://localhost:4000

# 2. Mobile app
cd mobile
cp .env.example .env                 # set EXPO_PUBLIC_API_URL to http://<your-computer-LAN-IP>:4000
npm install
npx expo start                       # scan the QR code with Expo Go
```

Without Docker: install Postgres, copy `backend/.env.example` to `backend/.env` (set `STORAGE_DRIVER=local`), then `cd backend && npm install && npm start`.

## Tests

```bash
cd backend
TEST_DATABASE_URL=postgres://user@localhost:5432/clipzy_test npm test   # 9 end-to-end tests against real Postgres
cd ../mobile && npm run typecheck
```

## Ship it

Follow "Launch order" in `PARAMETERS.md`.

## Structure

```
backend/src/   config, db, schema.sql, auth, storage, routes/ (auth, uploads, videos, users, moderation, legal)
mobile/src/    app/ (screens, Expo Router), components/ (VideoCard, CommentsSheet, ProfileView...), lib/ (api client, auth)
```
