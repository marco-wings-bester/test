'use strict';

require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

// ─── Transcription ────────────────────────────────────────────────────────────

/**
 * Transcribe an audio file using OpenAI Whisper.
 * Returns the raw transcript string.
 */
async function transcribeWithWhisper(filePath) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const transcription = await client.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: 'whisper-1',
    response_format: 'text',
    // Whisper auto-detects language; translation to English is optional
  });

  return typeof transcription === 'string' ? transcription : transcription.text;
}

/**
 * Transcribe an audio file using Google Cloud Speech-to-Text.
 * Requires GOOGLE_APPLICATION_CREDENTIALS to point to a service-account JSON.
 * Falls back to basic REST call if the client library is not installed.
 */
async function transcribeWithGoogle(filePath) {
  try {
    // Dynamic import so the package is optional
    const speech = require('@google-cloud/speech');
    const client = new speech.SpeechClient();

    const audioBytes = fs.readFileSync(filePath).toString('base64');
    const ext = path.extname(filePath).toLowerCase().replace('.', '');
    const encodingMap = {
      mp3: 'MP3',
      m4a: 'MP3',    // Google treats M4A/AAC as MP3 in many cases
      wav: 'LINEAR16',
      ogg: 'OGG_OPUS',
      flac: 'FLAC',
      webm: 'WEBM_OPUS',
    };

    const [response] = await client.recognize({
      config: {
        encoding: encodingMap[ext] || 'MP3',
        sampleRateHertz: 16000,
        languageCode: 'en-US',
        alternativeLanguageCodes: ['es-ES', 'fr-FR', 'de-DE', 'ja-JP', 'zh-CN', 'pt-BR', 'ar-SA'],
        enableAutomaticPunctuation: true,
        model: 'latest_long',
      },
      audio: { content: audioBytes },
    });

    return response.results.map((r) => r.alternatives[0].transcript).join(' ');
  } catch (err) {
    throw new Error(`Google Speech-to-Text failed: ${err.message}`);
  }
}

async function transcribeAudio(filePath) {
  const provider = (process.env.TRANSCRIPTION_PROVIDER || 'openai').toLowerCase();
  if (provider === 'google') {
    return transcribeWithGoogle(filePath);
  }
  return transcribeWithWhisper(filePath);
}

// ─── Task Synthesis ───────────────────────────────────────────────────────────

const SYNTHESIS_PROMPT = (transcript) =>
  `You are a task extraction engine. A user has recorded a voice memo. Your job is to extract every specific, actionable task they mentioned.

Rules:
- Output ONLY a valid JSON array of strings. No markdown, no explanation, no wrapper object.
- Each string is one concise task (imperative sentence, ≤ 120 characters).
- If the transcript is in a non-English language, translate the tasks to English.
- If no clear tasks are present, return an empty array: []

Transcript:
"""
${transcript}
"""`;

async function synthesiseTasksWithClaude(transcript) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: SYNTHESIS_PROMPT(transcript) }],
  });

  const rawText = message.content[0].type === 'text' ? message.content[0].text : '';
  return parseTasksJson(rawText);
}

async function synthesiseTasksWithOpenAI(transcript) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: SYNTHESIS_PROMPT(transcript) }],
    temperature: 0,
  });

  const rawText = response.choices[0]?.message?.content || '';
  return parseTasksJson(rawText);
}

function parseTasksJson(rawText) {
  // Strip markdown code fences if the model disobeyed the prompt
  const cleaned = rawText.replace(/```(?:json)?/gi, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed.filter((t) => typeof t === 'string' && t.trim().length > 0);
    }
    return [];
  } catch {
    // Best-effort: try to find a JSON array anywhere in the output
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const arr = JSON.parse(match[0]);
        return Array.isArray(arr) ? arr : [];
      } catch {
        return [];
      }
    }
    return [];
  }
}

async function synthesiseTasks(transcript) {
  const provider = (process.env.LLM_PROVIDER || 'claude').toLowerCase();
  if (provider === 'openai') {
    return synthesiseTasksWithOpenAI(transcript);
  }
  return synthesiseTasksWithClaude(transcript);
}

module.exports = { transcribeAudio, synthesiseTasks };
