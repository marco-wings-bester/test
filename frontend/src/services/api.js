import * as FileSystem from 'expo-file-system';

// Replace with your backend URL (or set via env variable in app.config.js)
const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

const DEFAULT_TIMEOUT_MS = 30_000;

// ─── Low-level fetch wrapper ──────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Request timed out.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export async function fetchTasks(deviceId, date) {
  return apiFetch(`/api/tasks/${encodeURIComponent(deviceId)}/${date}`);
}

export async function createTasks(deviceId, taskDate, tasks) {
  return apiFetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId, taskDate, tasks }),
  });
}

export async function updateTask(taskId, updates) {
  return apiFetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
}

export async function deleteTask(taskId) {
  return apiFetch(`/api/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
}

// ─── Audio ────────────────────────────────────────────────────────────────────

/**
 * Upload an audio file from a local URI using multipart/form-data.
 */
export async function uploadAudio(fileUri, deviceId, taskDate, mimeType = 'audio/m4a') {
  // Expo FileSystem.uploadAsync is more reliable for large files on mobile
  const result = await FileSystem.uploadAsync(
    `${BASE_URL}/api/audio/upload`,
    fileUri,
    {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'audio',
      mimeType,
      parameters: { deviceId, taskDate },
    }
  );

  if (result.status < 200 || result.status >= 300) {
    let errMsg = `Upload failed with status ${result.status}`;
    try {
      const body = JSON.parse(result.body);
      if (body.error) errMsg = body.error;
    } catch { /* ignore */ }
    throw new Error(errMsg);
  }

  return JSON.parse(result.body);
}

/**
 * Send queued offline items (base64 encoded) to the batch sync endpoint.
 */
export async function syncOfflineItem(item) {
  // Read file as base64
  const audioBase64 = await FileSystem.readAsStringAsync(item.fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const data = await apiFetch('/api/audio/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [
        {
          deviceId: item.deviceId,
          taskDate: item.taskDate,
          audioBase64,
          mimeType: item.mimeType,
        },
      ],
    }),
  });

  // The sync endpoint returns { results: [...] }
  const result = data.results?.[0];
  if (result && !result.success) {
    throw new Error(result.error || 'Sync failed');
  }

  return result;
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export async function fetchAnalytics(deviceId, days = 30) {
  return apiFetch(`/api/analytics/${encodeURIComponent(deviceId)}?days=${days}`);
}
