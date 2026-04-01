# Daily Task Manager

A production-ready, voice-first daily task management application.

## Tech Stack
| Layer | Technology |
|---|---|
| Mobile Frontend | React Native (Expo ~51) |
| Backend API | Node.js 20 + Express 4 |
| Database | Snowflake |
| Transcription | OpenAI Whisper-1 (default) or Google Cloud Speech-to-Text |
| Task Synthesis | Claude (`claude-sonnet-4-6`, default) or GPT-4o |

---

## Project Structure

```
task-manager-app/
├── database/
│   └── schema.sql          # Snowflake DDL – run once
├── backend/
│   ├── .env.example        # Copy to .env and fill in values
│   ├── server.js
│   ├── config/snowflake.js
│   ├── routes/
│   │   ├── tasks.js        # CRUD for user_daily_tasks
│   │   ├── audio.js        # Upload + offline sync + AI pipeline
│   │   └── analytics.js    # Per-day aggregates
│   ├── middleware/errorHandler.js
│   └── utils/llm.js        # Whisper + Claude/GPT wrappers
└── frontend/
    ├── App.js
    └── src/
        ├── screens/
        │   ├── TodayScreen.js      # Main task view + voice recording
        │   └── AnalyticsScreen.js  # Bar charts + summary stats
        ├── components/
        │   ├── DateNavigator.js    # Horizontal scrollable date strip
        │   ├── TaskItem.js         # Checkbox, inline edit, delete
        │   └── RecordButton.js     # Animated mic button
        ├── services/api.js         # All HTTP calls to backend
        └── utils/
            ├── deviceId.js         # Persistent UUID for the device
            ├── offlineQueue.js     # AsyncStorage queue + drain logic
            └── dateUtils.js        # Date arithmetic helpers
```

---

## Quick Start

### 1. Database

```sql
-- Run database/schema.sql in your Snowflake worksheet
```

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env
# Fill in SNOWFLAKE_*, OPENAI_API_KEY, ANTHROPIC_API_KEY
npm run dev        # dev server on port 3000
```

### 3. Frontend

```bash
cd frontend
npm install
# Create frontend/.env with:  EXPO_PUBLIC_API_URL=http://<your-machine-ip>:3000
npx expo start
```

Scan the QR code with the **Expo Go** app on iOS or Android.

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/api/tasks/:deviceId/:date` | List tasks for a date |
| `POST` | `/api/tasks` | Create tasks manually |
| `PUT` | `/api/tasks/:taskId` | Update description / toggle completion |
| `DELETE` | `/api/tasks/:taskId` | Delete a task |
| `POST` | `/api/audio/upload` | Upload audio → transcribe → synthesise → save |
| `POST` | `/api/audio/sync` | Batch sync offline queue (base64 audio) |
| `GET` | `/api/analytics/:deviceId?days=30` | Per-day completion stats |

### POST /api/audio/upload

Multipart form data:

| Field | Type | Required |
|-------|------|----------|
| `audio` | File | ✅ |
| `deviceId` | String | ✅ |
| `taskDate` | String (YYYY-MM-DD) | ✅ |

Response:
```json
{
  "success": true,
  "transcript": "Call the dentist and finish the quarterly report",
  "tasks": [
    { "task_id": "...", "task_description": "Call the dentist", "is_completed": false },
    { "task_id": "...", "task_description": "Finish the quarterly report", "is_completed": false }
  ]
}
```

---

## Key Features

### Offline Mode
When the device loses connectivity the app detects the offline state (via
`@react-native-community/netinfo`), stores the recorded `.m4a` file to the Expo file
system, and writes a queue entry to AsyncStorage. On reconnect, `drainQueue` converts
each file to base64 and calls `POST /api/audio/sync` automatically.

### Multilingual Support
Whisper-1 auto-detects the spoken language. The LLM synthesis prompt instructs the
model to translate any non-English tasks into English before extraction.

### Device Identity
No login is required. A UUID is generated on first launch, persisted in AsyncStorage,
and sent with every API request as `deviceId`.

---

## Environment Variables (Backend)

| Variable | Description |
|----------|-------------|
| `PORT` | Express listen port (default `3000`) |
| `SNOWFLAKE_ACCOUNT` | e.g. `xy12345.us-east-1` |
| `SNOWFLAKE_USERNAME` | Snowflake login |
| `SNOWFLAKE_PASSWORD` | Snowflake password |
| `SNOWFLAKE_DATABASE` | `TASK_MANAGER_DB` |
| `SNOWFLAKE_SCHEMA` | `PUBLIC` |
| `SNOWFLAKE_WAREHOUSE` | `COMPUTE_WH` |
| `SNOWFLAKE_ROLE` | e.g. `SYSADMIN` |
| `TRANSCRIPTION_PROVIDER` | `openai` (default) or `google` |
| `OPENAI_API_KEY` | OpenAI API key |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to GCP service-account JSON |
| `LLM_PROVIDER` | `claude` (default) or `openai` |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `MAX_AUDIO_SIZE_MB` | Max upload size (default `25`) |