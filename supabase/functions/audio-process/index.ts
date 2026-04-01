/**
 * Edge Function: /functions/v1/audio-process
 *
 * Called AFTER the client has uploaded an audio file to Supabase Storage.
 *
 * Request body (JSON):
 *   { storagePath: string, deviceId: string, taskDate: string (YYYY-MM-DD) }
 *
 * Pipeline:
 *   1. Download audio from Storage
 *   2. Transcribe with OpenAI Whisper (or Google STT)
 *   3. Extract tasks with Claude / GPT-4o
 *   4. Insert rows into user_daily_tasks
 *   5. Delete the audio from Storage (cleanup)
 *   6. Return { transcript, tasks[] }
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ─── Transcription ────────────────────────────────────────────────────────────

async function transcribeWithWhisper(audioBuffer: Uint8Array, mimeType: string): Promise<string> {
  const ext = mimeType.split('/')[1]?.replace('x-m4a', 'm4a') ?? 'm4a';
  const formData = new FormData();
  formData.append('file', new Blob([audioBuffer], { type: mimeType }), `audio.${ext}`);
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'text');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}` },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Whisper error ${res.status}: ${errText}`);
  }
  return res.text();
}

async function transcribeWithGoogle(audioBuffer: Uint8Array, mimeType: string): Promise<string> {
  const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!serviceAccountJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON secret is not set.');

  // Obtain a Google access token using the service account JWT flow
  const sa = JSON.parse(atob(serviceAccountJson));
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));

  // Sign with RSA-SHA256 using the Web Crypto API
  const keyData = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    Uint8Array.from(atob(keyData), (c) => c.charCodeAt(0)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const sigBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${header}.${payload}.${sig}`,
  });
  const { access_token } = await tokenRes.json();

  const encodingMap: Record<string, string> = {
    'audio/mp3': 'MP3', 'audio/mpeg': 'MP3', 'audio/m4a': 'MP3', 'audio/x-m4a': 'MP3',
    'audio/wav': 'LINEAR16', 'audio/ogg': 'OGG_OPUS',
    'audio/flac': 'FLAC', 'audio/webm': 'WEBM_OPUS', 'video/webm': 'WEBM_OPUS',
  };

  const sttRes = await fetch(
    'https://speech.googleapis.com/v1/speech:recognize',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        config: {
          encoding: encodingMap[mimeType] ?? 'MP3',
          sampleRateHertz: 16000,
          languageCode: 'en-US',
          alternativeLanguageCodes: ['es-ES', 'fr-FR', 'de-DE', 'ja-JP', 'zh-CN', 'pt-BR', 'ar-SA'],
          enableAutomaticPunctuation: true,
          model: 'latest_long',
        },
        audio: { content: btoa(String.fromCharCode(...audioBuffer)) },
      }),
    },
  );

  const sttData = await sttRes.json();
  return (sttData.results ?? [])
    .map((r: { alternatives: { transcript: string }[] }) => r.alternatives[0]?.transcript ?? '')
    .join(' ')
    .trim();
}

async function transcribeAudio(audioBuffer: Uint8Array, mimeType: string): Promise<string> {
  const provider = (Deno.env.get('TRANSCRIPTION_PROVIDER') ?? 'openai').toLowerCase();
  return provider === 'google'
    ? transcribeWithGoogle(audioBuffer, mimeType)
    : transcribeWithWhisper(audioBuffer, mimeType);
}

// ─── Task synthesis ───────────────────────────────────────────────────────────

const SYNTHESIS_PROMPT = (transcript: string) =>
  `You are a task extraction engine. A user has recorded a voice memo. Extract every specific, actionable task they mentioned.

Rules:
- Output ONLY a valid JSON array of strings. No markdown, no explanation, no wrapper object.
- Each string is one concise task (imperative sentence, ≤ 120 characters).
- Translate non-English tasks into English.
- If no clear tasks are present, return: []

Transcript:
"""
${transcript}
"""`;

function parseTasksJson(raw: string): string[] {
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed.filter((t) => typeof t === 'string' && t.trim());
  } catch { /* try harder */ }
  const match = cleaned.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const arr = JSON.parse(match[0]);
      return Array.isArray(arr) ? arr.filter((t) => typeof t === 'string' && t.trim()) : [];
    } catch { /* give up */ }
  }
  return [];
}

async function synthesiseWithClaude(transcript: string): Promise<string[]> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: SYNTHESIS_PROMPT(transcript) }],
    }),
  });

  if (!res.ok) throw new Error(`Claude error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return parseTasksJson(data.content?.[0]?.text ?? '');
}

async function synthesiseWithOpenAI(transcript: string): Promise<string[]> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      temperature: 0,
      messages: [{ role: 'user', content: SYNTHESIS_PROMPT(transcript) }],
    }),
  });

  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return parseTasksJson(data.choices?.[0]?.message?.content ?? '');
}

async function synthesiseTasks(transcript: string): Promise<string[]> {
  const provider = (Deno.env.get('LLM_PROVIDER') ?? 'claude').toLowerCase();
  return provider === 'openai'
    ? synthesiseWithOpenAI(transcript)
    : synthesiseWithClaude(transcript);
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed.' }, 405);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const { storagePath, deviceId, taskDate, mimeType = 'audio/m4a' } = await req.json();

    if (!storagePath || !deviceId || !taskDate) {
      return json({ success: false, error: 'storagePath, deviceId, and taskDate are required.' }, 400);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(taskDate)) {
      return json({ success: false, error: 'taskDate must be YYYY-MM-DD.' }, 400);
    }

    // 1. Download audio from Storage
    const { data: fileData, error: dlErr } = await supabase.storage
      .from('audio-recordings')
      .download(storagePath);

    if (dlErr || !fileData) {
      throw new Error(`Storage download failed: ${dlErr?.message ?? 'unknown'}`);
    }

    const audioBuffer = new Uint8Array(await fileData.arrayBuffer());

    // 2. Transcribe
    const transcript = await transcribeAudio(audioBuffer, mimeType);

    if (!transcript.trim()) {
      // Cleanup and return early
      await supabase.storage.from('audio-recordings').remove([storagePath]);
      return json({ success: true, transcript: '', tasks: [] });
    }

    // 3. Extract tasks
    const taskDescriptions = await synthesiseTasks(transcript);

    // 4. Insert into DB
    let createdTasks: unknown[] = [];
    if (taskDescriptions.length > 0) {
      const rows = taskDescriptions
        .filter((t) => t.trim())
        .map((t) => ({
          device_id: deviceId,
          task_date: taskDate,
          task_description: t.trim(),
        }));

      const { data, error: insertErr } = await supabase
        .from('user_daily_tasks')
        .insert(rows)
        .select();

      if (insertErr) throw insertErr;
      createdTasks = data ?? [];
    }

    // 5. Cleanup: remove audio from Storage
    await supabase.storage.from('audio-recordings').remove([storagePath]);

    return json({ success: true, transcript, tasks: createdTasks }, 201);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    console.error('[audio-process]', message);
    return json({ success: false, error: message }, 500);
  }
});
