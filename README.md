# Daily Task Manager

A production-ready, voice-first daily task management application.

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile Frontend | React Native (Expo ~51) |
| Backend | Supabase Edge Functions (Deno / TypeScript) |
| Database | Supabase PostgreSQL |
| File Storage | Supabase Storage |
| Transcription | OpenAI Whisper-1 (default) or Google Cloud Speech-to-Text |
| Task Synthesis | Claude `claude-sonnet-4-6` (default) or GPT-4o |

---

## Project Structure

```
task-manager-app/
├── database/
│   └── schema.sql                      # PostgreSQL DDL — run once in Supabase SQL Editor
├── supabase/
│   ├── config.toml
│   └── functions/
│       ├── tasks/index.ts              # CRUD: GET/POST/PUT/DELETE
│       ├── audio-process/index.ts      # Transcribe → synthesise → save
│       └── analytics/index.ts          # Per-day completion stats
└── frontend/
    ├── App.js
    └── src/
        ├── screens/
        │   ├── TodayScreen.js          # Main task view + voice recording
        │   └── AnalyticsScreen.js      # Bar charts + summary stats
        ├── components/
        │   ├── DateNavigator.js        # Horizontal scrollable date strip
        │   ├── TaskItem.js             # Checkbox, inline edit, delete
        │   └── RecordButton.js         # Animated mic button
        ├── services/
        │   ├── supabase.js             # Supabase client init
        │   └── api.js                  # All calls (Storage + Edge Functions)
        └── utils/
            ├── deviceId.js             # Persistent UUID via AsyncStorage
            ├── offlineQueue.js         # AsyncStorage queue + drain logic
            └── dateUtils.js
```

---

## Setup (5 steps)

### 1. Supabase project

1. Go to [supabase.com](https://supabase.com), open your project.
2. **SQL Editor → New query** → paste and run `database/schema.sql`.
3. **Storage → New bucket** → name it `audio-recordings`, set to **Private**.

### 2. Set Edge Function secrets

```bash
npm install -g supabase   # install the Supabase CLI if needed

supabase login
supabase link --project-ref YOUR_PROJECT_REF   # from Dashboard → Settings → General

# Required secrets
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

# Optional: swap providers
supabase secrets set TRANSCRIPTION_PROVIDER=openai   # or: google
supabase secrets set LLM_PROVIDER=claude             # or: openai

# Only if using Google Speech-to-Text:
# base64-encode your service-account JSON first
supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON=$(base64 < service-account.json)
```

### 3. Deploy Edge Functions

```bash
supabase functions deploy tasks
supabase functions deploy audio-process
supabase functions deploy analytics
```

### 4. Frontend environment

Create `frontend/.env`:

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Both values are in **Dashboard → Project Settings → API**.

### 5. Run the app

```bash
cd frontend
npm install
npx expo start          # scan QR with Expo Go
# npx expo start --tunnel   ← shareable QR via ngrok
```

---

## Hosting the web version on GitHub Pages

```bash
cd frontend
npx expo export --platform web        # outputs to dist/
```

Then push `dist/` to a `gh-pages` branch (or configure GitHub Actions — see below).

### GitHub Actions deploy (optional)

Create `.github/workflows/deploy-web.yml` in the repo:

```yaml
name: Deploy web app
on:
  push:
    branches: [main]
jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
        working-directory: frontend
      - run: npx expo export --platform web
        working-directory: frontend
        env:
          EXPO_PUBLIC_SUPABASE_URL: ${{ secrets.EXPO_PUBLIC_SUPABASE_URL }}
          EXPO_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.EXPO_PUBLIC_SUPABASE_ANON_KEY }}
      - uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: frontend/dist
```

Add `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` as **Repository secrets** in GitHub → Settings → Secrets.

---

## API (Edge Functions)

| Method | Function URL | Description |
|--------|-------------|-------------|
| `GET` | `/functions/v1/tasks/{deviceId}/{date}` | List tasks |
| `POST` | `/functions/v1/tasks` | Create tasks |
| `PUT` | `/functions/v1/tasks/{taskId}` | Update task |
| `DELETE` | `/functions/v1/tasks/{taskId}` | Delete task |
| `POST` | `/functions/v1/audio-process` | Process uploaded audio |
| `GET` | `/functions/v1/analytics/{deviceId}?days=30` | Analytics |

### Audio flow

1. **Client** records audio → reads as `Uint8Array`
2. **Client** uploads directly to Supabase Storage (`audio-recordings` bucket)
3. **Client** calls `audio-process` with `{ storagePath, deviceId, taskDate, mimeType }`
4. **Edge Function** downloads from Storage → Whisper → Claude → inserts tasks → deletes audio
5. **Client** receives `{ transcript, tasks[] }`

### Offline flow

1. Recording saved to Expo `FileSystem` + path added to `AsyncStorage` queue
2. On reconnect (`NetInfo`): `drainQueue` calls `syncOfflineItem` for each item
3. `syncOfflineItem` runs the same Storage upload + `audio-process` pipeline

---

## Key design decisions

| Decision | Implementation |
|---|---|
| **No auth** | Persistent device UUID in `AsyncStorage`; service-role key used only inside Edge Functions |
| **No Express server** | Supabase Edge Functions replace all backend routes |
| **Audio storage** | Supabase Storage (no size limit, auto-deleted after processing) |
| **Multilingual** | Whisper auto-detects language; LLM prompt translates to English |
| **RLS** | Enabled on the table; all write/read access routed through service-role Edge Functions |
