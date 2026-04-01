/**
 * Offline Queue
 * ─────────────
 * When the device has no internet connection, recorded audio is queued here.
 * Each queue item stores:
 *   { id, deviceId, taskDate, fileUri, mimeType, enqueuedAt }
 *
 * On reconnect, the queue is drained by converting each file to base64 and
 * sending it to POST /api/audio/sync.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { v4 as uuidv4 } from 'uuid';

const QUEUE_KEY = '@task_manager:offline_queue';

// ─── Persistence helpers ──────────────────────────────────────────────────────

async function loadQueue() {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveQueue(queue) {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Add a recorded audio file to the offline queue.
 */
export async function enqueue({ deviceId, taskDate, fileUri, mimeType }) {
  const queue = await loadQueue();
  queue.push({
    id: uuidv4(),
    deviceId,
    taskDate,
    fileUri,
    mimeType: mimeType || 'audio/m4a',
    enqueuedAt: new Date().toISOString(),
  });
  await saveQueue(queue);
}

/**
 * Return a snapshot of the current queue (read-only).
 */
export async function peekQueue() {
  return loadQueue();
}

/**
 * Return the number of items currently queued.
 */
export async function queueLength() {
  const q = await loadQueue();
  return q.length;
}

/**
 * Drain the queue by calling the provided upload function for each item.
 *
 * @param {Function} uploadFn  async (item) => { success, tasks, transcript }
 *                              Must throw on hard failure; return value is ignored
 *                              for retry logic (item is removed on success).
 * @returns {Object}  { processed, failed, results }
 */
export async function drainQueue(uploadFn) {
  let queue = await loadQueue();
  if (queue.length === 0) return { processed: 0, failed: 0, results: [] };

  const results = [];
  const remaining = [];

  for (const item of queue) {
    // Verify the file still exists before attempting upload
    const fileInfo = await FileSystem.getInfoAsync(item.fileUri);
    if (!fileInfo.exists) {
      // File lost – discard silently
      results.push({ id: item.id, success: false, error: 'File no longer exists.' });
      continue;
    }

    try {
      const result = await uploadFn(item);
      results.push({ id: item.id, success: true, ...result });
      // Successfully uploaded – delete the local file to free space
      try { await FileSystem.deleteAsync(item.fileUri, { idempotent: true }); } catch { /* noop */ }
    } catch (err) {
      // Keep in queue for next retry
      remaining.push(item);
      results.push({ id: item.id, success: false, error: err.message });
    }
  }

  await saveQueue(remaining);

  return {
    processed: queue.length - remaining.length,
    failed: remaining.length,
    results,
  };
}

/**
 * Remove all items from the queue and delete their associated files.
 */
export async function clearQueue() {
  const queue = await loadQueue();
  for (const item of queue) {
    try { await FileSystem.deleteAsync(item.fileUri, { idempotent: true }); } catch { /* noop */ }
  }
  await saveQueue([]);
}
