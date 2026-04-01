/**
 * API service layer — backed by Supabase Edge Functions + Storage.
 *
 * All functions throw on error so callers can use try/catch uniformly.
 */

import * as FileSystem from 'expo-file-system';
import { supabase, STORAGE_BUCKET } from './supabase';

// ─── Tasks ────────────────────────────────────────────────────────────────────

export async function fetchTasks(deviceId, date) {
  const { data, error } = await supabase.functions.invoke(
    `tasks/${encodeURIComponent(deviceId)}/${date}`,
    { method: 'GET' }
  );
  if (error) throw error;
  if (!data.success) throw new Error(data.error);
  return data;
}

export async function createTasks(deviceId, taskDate, tasks) {
  const { data, error } = await supabase.functions.invoke('tasks', {
    method: 'POST',
    body: { deviceId, taskDate, tasks },
  });
  if (error) throw error;
  if (!data.success) throw new Error(data.error);
  return data;
}

export async function updateTask(taskId, updates) {
  const { data, error } = await supabase.functions.invoke(
    `tasks/${encodeURIComponent(taskId)}`,
    { method: 'PUT', body: updates }
  );
  if (error) throw error;
  if (!data.success) throw new Error(data.error);
  return data;
}

export async function deleteTask(taskId) {
  const { data, error } = await supabase.functions.invoke(
    `tasks/${encodeURIComponent(taskId)}`,
    { method: 'DELETE' }
  );
  if (error) throw error;
  if (!data.success) throw new Error(data.error);
  return data;
}

// ─── Audio ────────────────────────────────────────────────────────────────────

/**
 * Upload an audio file to Supabase Storage, then invoke the audio-process
 * Edge Function to transcribe and synthesise tasks.
 *
 * @param {string} fileUri   - Local file URI from expo-av
 * @param {string} deviceId
 * @param {string} taskDate  - YYYY-MM-DD
 * @param {string} mimeType  - e.g. 'audio/m4a'
 * @returns {{ transcript: string, tasks: object[] }}
 */
export async function uploadAudio(fileUri, deviceId, taskDate, mimeType = 'audio/m4a') {
  // 1. Read file as base64 and convert to Uint8Array
  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  // 2. Upload to Supabase Storage
  const ext = mimeType.split('/')[1]?.replace('x-m4a', 'm4a') ?? 'm4a';
  const storagePath = `${deviceId}/${taskDate}/${Date.now()}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, bytes, { contentType: mimeType, upsert: false });

  if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

  // 3. Invoke audio-process Edge Function with the storage path
  const { data, error } = await supabase.functions.invoke('audio-process', {
    body: { storagePath, deviceId, taskDate, mimeType },
  });

  if (error) throw error;
  if (!data.success) throw new Error(data.error);

  return data;
}

/**
 * Process a single queued offline item:
 *   1. Upload local file to Storage
 *   2. Invoke audio-process
 *   3. Return result
 *
 * Throws on any failure so the queue manager can keep the item for retry.
 */
export async function syncOfflineItem(item) {
  return uploadAudio(item.fileUri, item.deviceId, item.taskDate, item.mimeType);
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export async function fetchAnalytics(deviceId, days = 30) {
  const { data, error } = await supabase.functions.invoke(
    `analytics/${encodeURIComponent(deviceId)}?days=${days}`,
    { method: 'GET' }
  );
  if (error) throw error;
  if (!data.success) throw new Error(data.error);
  return data;
}
