# Clipzy: everything you need to provide

This is the single list of values, accounts and assets the app needs before it can go live. Nothing here is committed to the code: secrets live in environment variables on your host, and public identifiers live in `mobile/app.json` and `mobile/eas.json`.

Search this file for **REQUIRED** to see the minimum. Everything marked *optional* can wait until after your first release.

---

## 1. Accounts to create

| Account | Cost (check current pricing) | Needed for | Required? |
|---|---|---|---|
| **Apple Developer Program** | yearly fee | Publishing to the App Store, TestFlight | REQUIRED for iOS |
| **Google Play Console** | one-time fee | Publishing to Google Play | REQUIRED for Android |
| **Expo (EAS) account** at expo.dev | free tier available | Cloud builds (`eas build`) and store submission without owning a Mac | REQUIRED |
| **Backend host**: Render, Railway, Fly.io, AWS, etc. | varies | Runs the API (`backend/`, ships with a Dockerfile) | REQUIRED |
| **PostgreSQL database**: Neon, Supabase, Render, Railway, AWS RDS, etc. | varies | Stores users, videos, comments | REQUIRED |
| **Object storage**: Cloudflare R2, AWS S3, Backblaze B2, etc. | varies | Stores the uploaded videos and images | REQUIRED |
| **A domain name** | yearly | `api.yourdomain.com` and `cdn.yourdomain.com`; store listings need real URLs | REQUIRED |
| **Google Cloud project** | free | "Continue with Google" sign-in | optional |
| A CDN in front of the bucket (Cloudflare, CloudFront) | varies | Fast video delivery worldwide | strongly recommended |

---

## 2. Backend environment variables (`backend/.env.example` is the template)

Set these on your hosting platform. Locally, copy `backend/.env.example` to `backend/.env`.

### Database

| Variable | Required? | What to put | How to get it |
|---|---|---|---|
| `DATABASE_URL` | **REQUIRED** | `postgres://USER:PASSWORD@HOST:5432/DBNAME` | Create a Postgres database at your provider and copy its connection string. Tables are created automatically on first start (or run `npm run migrate`). |
| `DATABASE_SSL` | **REQUIRED** for most managed DBs | `true` | Set `true` if your provider requires TLS (Neon, Supabase, Render, RDS do). `false` for local Postgres. |

### Auth (your own login system: email + password)

| Variable | Required? | What to put | How to get it |
|---|---|---|---|
| `JWT_SECRET` | **REQUIRED** | Random string, 32+ characters | `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. Never reuse across environments. Changing it logs everyone out. |
| `ACCESS_TOKEN_TTL` | optional | default `30m` | How long a login token lasts before the app silently refreshes it. |
| `REFRESH_TOKEN_DAYS` | optional | default `30` | How long a user stays logged in without opening the app. |
| `ADMIN_API_KEY` | **REQUIRED in production** | Random string, 32+ chars | Generate like `JWT_SECRET`. Sent as the `x-admin-key` header to `/admin/reports`. See "Moderation" below. |

### OAuth: Google sign-in (optional)

| Variable | Required? | What to put | How to get it |
|---|---|---|---|
| `GOOGLE_CLIENT_IDS` | optional | Comma-separated OAuth client IDs, e.g. `1234-web.apps.googleusercontent.com` | See section 4. Leave empty to disable Google sign-in (the endpoint then returns 501). |

### Storage (videos, thumbnails, avatars)

| Variable | Required? | What to put | How to get it |
|---|---|---|---|
| `STORAGE_DRIVER` | **REQUIRED** | `s3` in production (`local` is for development only and loses files on redeploy) | |
| `S3_BUCKET` | **REQUIRED** (s3) | Bucket name | Create a bucket at R2/S3/B2. |
| `S3_REGION` | **REQUIRED** (s3) | `auto` for R2; `us-east-1` etc. for AWS | |
| `S3_ENDPOINT` | R2/B2/MinIO only | R2: `https://<account-id>.r2.cloudflarestorage.com` | Leave empty for AWS S3. |
| `S3_ACCESS_KEY_ID` | **REQUIRED** (s3) | Access key | Create an API token with read/write on that bucket only. |
| `S3_SECRET_ACCESS_KEY` | **REQUIRED** (s3) | Secret key | Shown once when you create the token. |
| `S3_FORCE_PATH_STYLE` | MinIO/some providers | `true` / `false` | |
| `MEDIA_BASE_URL` | **REQUIRED** (s3) | Public URL that serves the bucket, no trailing slash, e.g. `https://cdn.yourdomain.com` | Attach a custom domain to the R2 bucket (or CloudFront for S3). Objects must be publicly readable through this URL. |
| `MAX_UPLOAD_MB` | optional | default `100` | Largest video file accepted. |
| `MAX_VIDEO_SECONDS` | optional | default `180` | Longest video. Keep equal to the mobile `EXPO_PUBLIC_MAX_VIDEO_SECONDS`. |

### Server

| Variable | Required? | What to put |
|---|---|---|
| `PUBLIC_BASE_URL` | **REQUIRED** | Public HTTPS URL of the API, e.g. `https://api.yourdomain.com` |
| `NODE_ENV` | **REQUIRED** | `production` |
| `PORT` | optional | Most hosts set it for you (default `4000`) |
| `CORS_ORIGINS` | optional | `*` is fine for a mobile-only app; list your web origins if you add a website |

### Legal pages (the API serves `/privacy`, `/terms`, `/support`, `/delete-account`)

| Variable | Required? | What to put |
|---|---|---|
| `APP_NAME` | **REQUIRED** | Your app's name as shown to users |
| `COMPANY_NAME` | **REQUIRED** | Your legal entity or your name |
| `SUPPORT_EMAIL` | **REQUIRED** | A mailbox you actually monitor |

The legal text is a **template**. Have a lawyer review it for your country and for how you really handle data before launch.

---

## 3. Mobile app configuration

### `mobile/.env` (copy from `mobile/.env.example`; also set in `mobile/eas.json` for cloud builds)

| Variable | Required? | What to put |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | **REQUIRED** | Your API's public URL, e.g. `https://api.yourdomain.com`. In development on a real phone use your computer's LAN IP, e.g. `http://192.168.1.10:4000`. |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | optional | The **Web** OAuth client ID from section 4. When set (and the Google module is installed) Android shows "Continue with Google". |
| `EXPO_PUBLIC_MAX_VIDEO_SECONDS` | optional | Default `180` |

> `EXPO_PUBLIC_*` values are bundled into the app and visible to anyone. Never put secrets in them.

### `mobile/app.json`: change these before building

| Field | Required? | What to put |
|---|---|---|
| `expo.name` | **REQUIRED** | The name under the app icon. Do **not** use "TikTok" or any name/logo/sound confusingly similar to another company's. It will be rejected. |
| `expo.slug` | **REQUIRED** | URL-safe short name |
| `expo.scheme` | **REQUIRED** | Deep-link scheme, e.g. `clipzy` |
| `expo.ios.bundleIdentifier` | **REQUIRED** | Reverse-domain ID you own, e.g. `com.yourcompany.clipzy`. Must match the App ID in Apple Developer. Cannot change after release. |
| `expo.android.package` | **REQUIRED** | Same style, e.g. `com.yourcompany.clipzy`. Cannot change after release. |
| `expo.version` | **REQUIRED** | User-facing version, e.g. `1.0.0` |
| `expo.extra.eas.projectId` | **REQUIRED** | Created for you by `eas init` (run once inside `mobile/`) |
| `expo.icon`, adaptive icon images, splash | **REQUIRED** | Replace the placeholder images in `mobile/assets/`. Icon: 1024x1024 PNG, no transparency, no rounded corners. |

### `mobile/eas.json`: store submission

| Field | Required? | What to put | How to get it |
|---|---|---|---|
| `submit.production.ios.appleId` | for iOS | Your Apple ID email | |
| `submit.production.ios.ascAppId` | for iOS | Numeric App Store Connect app ID | App Store Connect > your app > App Information > Apple ID |
| `submit.production.ios.appleTeamId` | for iOS | 10-character Team ID | developer.apple.com > Membership |
| `submit.production.android.serviceAccountKeyPath` | for Android | Path to a Google Play service-account JSON | Play Console > Setup > API access. **Never commit this file** (already in `.gitignore`). |
| iOS signing certificates / Android keystore | automatic | | Let EAS generate and store them the first time you run `eas build` (recommended). Back up the Android keystore it creates. |

---

## 4. Google sign-in (optional): step by step

Skip this entirely if email + password is enough for launch.

1. Go to console.cloud.google.com, create a project, then **APIs & Services > OAuth consent screen**. Fill in app name, support email, and your privacy-policy URL (`https://api.yourdomain.com/privacy`). Publish the consent screen to production.
2. **Credentials > Create credentials > OAuth client ID**, create:
   - **Web application**: copy its Client ID. This goes in `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` **and** `GOOGLE_CLIENT_IDS` (backend).
   - **Android**: package name = your `android.package`, SHA-1 = the fingerprint of the key that signs your build (run `eas credentials` to see it; add the Play App Signing SHA-1 too after your first upload).
   - **iOS** (only if you decide to offer it on iOS): bundle ID = your `ios.bundleIdentifier`. Add its ID to `GOOGLE_CLIENT_IDS` as well.
3. In `mobile/`, install the native module and add its config plugin:
   `npm install @react-native-google-signin/google-signin`, then add `"@react-native-google-signin/google-signin"` to `expo.plugins` in `app.json` (follow the library's current Expo setup page for any extra plugin options).
4. Google sign-in uses native code, so it does **not** work in Expo Go. Build a development or production build with EAS.

**Honest status:** the backend side (`POST /auth/google`, token verification) is implemented. The mobile side is written but **has not been run on a device**, because that needs your Google credentials and a native build. Test it on a real Android device before relying on it.

**Apple rule (App Store Guideline 4.8):** if your iOS app offers a third-party login such as Google, it must also offer Sign in with Apple (or an equivalent privacy-preserving option). That is why the Google button is **Android-only by default**. If you want Google on iOS, add Sign in with Apple first.

---

## 5. Store listing: information and assets you must prepare

| Item | Apple App Store | Google Play |
|---|---|---|
| App name, subtitle/short description, full description, keywords | required | required |
| App icon 1024x1024 | required | 512x512 required |
| Screenshots of real app screens | required (6.9" and 6.5" iPhone sizes, check current requirements) | required (phone; at least 2) |
| Feature graphic 1024x500 | n/a | required |
| **Privacy Policy URL** | required: `https://api.yourdomain.com/privacy` | required: same |
| **Support URL / email** | required: `https://api.yourdomain.com/support` | required |
| **Account-deletion URL** | in-app deletion (done: Profile > Settings > Delete account) | required: `https://api.yourdomain.com/delete-account` |
| Age rating questionnaire | required. User-generated content means expect 12+/17+ depending on answers | required (IARC questionnaire) |
| Privacy "nutrition label" / Data safety form | App Privacy details in App Store Connect | Data safety form. Declare: email, username, photos/videos, user content, IP address; encrypted in transit; users can request deletion |
| **Demo account for reviewers** | required: create a real account on your production API and put its email + password in App Review notes | required if login is needed |
| Content rating / "contains user-generated content" answers | yes | yes |
| Export compliance | `ITSAppUsesNonExemptEncryption=false` is already set (the app only uses standard HTTPS) | n/a |
| Category | Photo & Video or Entertainment / Social | Social or Video Players & Editors |

### User-generated-content rules (the #1 reason apps like this get rejected)

Both stores require these, and all are already built in. Make sure you can *demonstrate* each to a reviewer:

- Report button on every video, comment and profile: yes (`...` menus)
- Block users: yes
- Terms that prohibit objectionable content: yes (`/terms`), have them reviewed
- A way for you to act on reports within about 24 hours: **you must do this operationally** via the admin endpoints below
- In-app account deletion: yes

### Moderation (admin endpoints)

Reports land in the database. Review them with the `x-admin-key` header:

```bash
# list open reports
curl -H "x-admin-key: $ADMIN_API_KEY" https://api.yourdomain.com/admin/reports
# act on one: hide_content | ban_user | dismiss
curl -X POST -H "x-admin-key: $ADMIN_API_KEY" -H "content-type: application/json" \
  -d '{"action":"hide_content"}' https://api.yourdomain.com/admin/reports/<report-id>/resolve
```

This is a minimal tool. A real launch needs somebody who checks it daily.

---

## 6. Secrets handling

| Secret | Where it lives | Never |
|---|---|---|
| `JWT_SECRET`, `ADMIN_API_KEY`, `DATABASE_URL`, `S3_*` | Host's environment-variable settings | in git, in the mobile app, in chat |
| Play service-account JSON, `.p8/.p12/.jks` files | Your machine / EAS secrets | in git (already in `.gitignore`) |
| `EXPO_PUBLIC_*` | App bundle (public) | secrets |

---

## 7. Launch order

1. Create the accounts in section 1.
2. Create the Postgres database and the storage bucket (with a public domain for `MEDIA_BASE_URL`).
3. Deploy `backend/` (Dockerfile included) with the env vars from section 2. Check `https://api.yourdomain.com/health` returns `{"ok":true}` and `/privacy` loads.
4. Edit `mobile/app.json` and `mobile/eas.json` (section 3), replace the icon/splash images, run `npm install -g eas-cli` or use `npx eas-cli`, then in `mobile/`: `eas login`, `eas init`.
5. `eas build --profile preview --platform android` and install it on a real phone. Test the whole flow against your production API: sign up, record, upload, watch, like, comment, follow, report, block, delete account.
6. Same for iOS (`--platform ios`) and test through TestFlight.
7. Fill in the store listings (section 5), then `eas build --profile production` and `eas submit --profile production --platform <ios|android>`.
8. Start with Play's internal/closed testing track. New personal Play accounts must run a closed test with testers for a minimum period before production access, so check Google's current requirement early.

---

## 8. Not included (you will want these as you grow)

- **Video processing.** Videos play exactly as uploaded (MP4/MOV, up to the size limit). There is no transcoding to multiple bitrates/HLS, so very large or high-resolution files may stutter on slow connections. Add a transcoding service (Mux, Cloudflare Stream, AWS MediaConvert) when traffic grows.
- **Recommendation algorithm.** "For You" is newest-first. Replace the query in `backend/src/routes/videos.js` when you have data to rank on.
- **Push notifications, direct messages, music/sounds library, duets, filters/effects, live streaming.**
- **Automated content moderation**, including detection of illegal material. You are legally responsible for acting on reports; consider a moderation service before significant traffic.
- **Sign in with Apple** (needed if you want Google on iOS, see section 4).
- **Analytics and crash reporting** (e.g. Sentry).
- **Email verification and password reset.** Accounts work with any email address, and there is no "forgot password" flow yet. Add an email provider (Resend, Postmark, SES) before launch if you expect real users to forget passwords.
