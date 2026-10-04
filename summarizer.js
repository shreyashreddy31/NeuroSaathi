/**
 * NeuroSaathi — Summarizer Module
 * summarizer.js — Transcript → concise last-interaction summary
 *
 * Model chain (in order):
 *   1. Gemini 2.5 Pro    (best reasoning, handles long/messy transcripts)
 *   2. Gemini 2.5 Flash  (fast fallback if Pro fails or is rate-limited)
 *   3. Extractive         (no API — heuristic key-sentence extraction)
 *
 * Usage:
 *   const result = await Summarizer.summarize(transcript, personName, startedAt);
 *   // returns: { summary: string, timestamp: string, method: string }
 */

'use strict';

const SUMMARIZER_CONFIG = {
  // Model chain — try in order until one succeeds
  // These are "thinking" models that use internal reasoning tokens,
  // so maxOutputTokens must be set high to account for thought overhead.
  MODELS: [
    {
      name:     'gemini-3.6-flash',
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent',
    },
    {
      name:     'gemini-3.5-flash',
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent',
    },
  ],
  LS_KEY_API:        'ns_gemini_key',
  MAX_INPUT_CHARS:   40000,
  FALLBACK_SENTENCES: 3,
};

// ── System instruction ────────────────────────────────────────
// Sent as the system_instruction field — sets the model's role once,
// so the user message can be just the transcript.

const SYSTEM_INSTRUCTION = `You are a memory-aid for dementia patients. You receive raw speech-to-text of a conversation between the patient and a visitor. The transcript captures BOTH voices mixed together without labels — use context to figure out what the VISITOR shared vs what the patient said.

Your job: compress the visitor's key updates into 1-2 short sentences. Think of it as a sticky note reminder.

RULES:
1. MAX 2 sentences. Combine related facts. Be ruthlessly concise.
2. Focus on: visitor's news, things they brought/did, plans, health updates, family updates.
3. Skip: greetings, small talk, the patient's own replies, filler words, pleasantries.
4. Past tense, third person, use visitor's name.
5. The transcript WILL have speech errors, stutters, mishearings — infer the real meaning.
6. If nothing meaningful was said, output exactly: "No significant updates from this visit."
7. Output ONLY the summary. No labels, no bullets, no preamble.`;

// ── Few-shot examples ─────────────────────────────────────────
// These teach the model: compress hard, 1-2 sentences, sticky-note style.

const FEW_SHOT_EXAMPLES = [
  {
    role: 'user',
    parts: [{ text: `Visitor: Rahul
Transcript:
"""
hey dad how are you doing today good good I'm doing fine yeah so listen I wanted to tell you um I got the promotion at work yeah the the manager position I was telling you about last time yeah they they finally gave it to me also uh Priya had her school concert yesterday she she sang really well she sang that old song you used to sing you know the one um also mom wanted me to tell you that she'll come visit on Sunday she's bringing your favorite rajma and I also brought some mangoes from the garden yeah the alphonso ones you like
"""` }],
  },
  {
    role: 'model',
    parts: [{ text: `Rahul got promoted to manager and brought alphonso mangoes. His daughter Priya sang at a school concert, and his mother plans to visit Sunday with rajma.` }],
  },
  {
    role: 'user',
    parts: [{ text: `Visitor: Meera
Transcript:
"""
hi how are you doing today yeah good good I'm fine too okay take care see you bye bye
"""` }],
  },
  {
    role: 'model',
    parts: [{ text: `No significant updates from this visit.` }],
  },
  {
    role: 'user',
    parts: [{ text: `Visitor: Amit
Transcript:
"""
hello uncle yeah I'm I'm good so uh I just came back from Bangalore actually I was there for two weeks for the the tech conference thing and um guess what I I met your old friend Sharma ji there yeah he he asked about you he said he wants to call you this weekend also I I brought you these sweets from there the the Mysore pak you like and uh one more thing the doctor called about your appointment it's been moved to Thursday the the 15th instead of Monday okay so Thursday 15th at 10 AM at city hospital oh that's nice yes uncle it was really good weather there
"""` }],
  },
  {
    role: 'model',
    parts: [{ text: `Amit came back from a Bangalore tech conference, met Sharma ji who'll call this weekend, and brought Mysore pak. Doctor's appointment moved to Thursday 15th, 10 AM, City Hospital.` }],
  },
];

// ── Main entry point ──────────────────────────────────────────

/**
 * @param {string} transcript   Full raw transcript text
 * @param {string} personName   Name of the recognized person
 * @param {string} [startedAt]  ISO timestamp of when ASR session started
 * @returns {Promise<{ summary: string, timestamp: string, method: string }>}
 */
async function summarize(transcript, personName, startedAt) {
  const timestamp = formatTimestamp(startedAt || new Date().toISOString());

  if (!transcript || transcript.trim().length < 8) {
    return {
      summary:   'No significant updates from this visit.',
      timestamp,
      method:    'default',
    };
  }

  // Priority: config.js → settings modal localStorage → none
  const apiKey = window.NS_CONFIG?.GEMINI_API_KEY?.trim()
    || localStorage.getItem(SUMMARIZER_CONFIG.LS_KEY_API)?.trim()
    || '';

  if (apiKey) {
    // Try each model in the chain
    for (const model of SUMMARIZER_CONFIG.MODELS) {
      try {
        console.log(`[Summarizer] Trying ${model.name}…`);
        const summary = await callGemini(transcript, personName, apiKey, model);
        console.log(`[Summarizer] ✅ ${model.name} succeeded`);
        return { summary, timestamp, method: model.name };
      } catch (err) {
        console.warn(`[Summarizer] ${model.name} failed:`, err.message);
        // Continue to next model
      }
    }
    console.warn('[Summarizer] All Gemini models failed — using extractive fallback');
  } else {
    console.log('[Summarizer] No API key — using extractive fallback');
  }

  return {
    summary:   extractiveSummarize(transcript, personName),
    timestamp,
    method:    'extractive',
  };
}

// ── Gemini API call ───────────────────────────────────────────

async function callGemini(transcript, personName, apiKey, model) {
  const input = transcript.length > SUMMARIZER_CONFIG.MAX_INPUT_CHARS
    ? transcript.slice(0, SUMMARIZER_CONFIG.MAX_INPUT_CHARS) + '…'
    : transcript;

  // Build the user message for this specific transcript
  const userMessage = {
    role: 'user',
    parts: [{ text: `Visitor: ${personName}\nTranscript:\n"""\n${input}\n"""` }],
  };

  // Full conversation: few-shot examples + this transcript
  const contents = [...FEW_SHOT_EXAMPLES, userMessage];

  const response = await fetch(
    `${model.endpoint}?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: SYSTEM_INSTRUCTION }],
        },
        contents,
        generationConfig: {
          temperature:     0.3,
          maxOutputTokens: 8192,   // high limit needed — thinking models use internal reasoning tokens
          topP:            0.90,
          topK:            40,
        },
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    const msg = data?.error?.message || `HTTP ${response.status}`;
    console.error(`[Summarizer] ${model.name} API error:`, data);
    throw new Error(msg);
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) {
    console.error(`[Summarizer] Empty ${model.name} response:`, data);
    throw new Error('Empty response');
  }

  return cleanSummary(text);
}

function cleanSummary(text) {
  return text
    .replace(/^(summary:|here('s| is) (a |the )?summary:?)\s*/i, '')
    .replace(/^["']|["']$/g, '')
    .trim();
}

// ── Extractive Fallback ───────────────────────────────────────

function extractiveSummarize(transcript, personName) {
  const sentences = transcript
    .replace(/([.!?])\s+/g, '$1|||')
    .split('|||')
    .map(s => s.trim())
    .filter(s => s.length > 12);

  if (sentences.length === 0) return `Brief visit with ${personName}.`;

  const scored = sentences
    .map(s => ({ text: s, score: scoreInfoDensity(s) }))
    .sort((a, b) => b.score - a.score);

  const top = scored
    .slice(0, SUMMARIZER_CONFIG.FALLBACK_SENTENCES)
    .sort((a, b) => transcript.indexOf(a.text) - transcript.indexOf(b.text))
    .map(s => s.text)
    .join(' ');

  const trimmed = top.length > 250 ? top.slice(0, 250).replace(/\s\w+$/, '') + '…' : top;
  return `${personName} visited. ${trimmed}`;
}

function scoreInfoDensity(s) {
  let score = s.length * 0.4;
  const nums = s.match(/\d+/g);
  if (nums) score += nums.length * 8;
  const caps = s.slice(1).match(/\b[A-Z][a-z]+/g);
  if (caps) score += caps.length * 5;
  const kw = ['talked','mentioned','brought','said','visited','gave','showed',
              'came','helped','told','asked','called','went','bought','made',
              'today','yesterday','tomorrow','week','plan','appointment',
              'doctor','hospital','medicine','school','work','promotion'];
  for (const k of kw) if (s.toLowerCase().includes(k)) score += 6;
  const filler = ['um ','uh ','like,','you know','okay','yeah ','hmm'];
  for (const f of filler) if (s.toLowerCase().includes(f)) score -= 3;
  return score;
}

// ── Timestamp helpers ─────────────────────────────────────────

/**
 * Format an ISO timestamp into a human-readable "Today at 4:40 PM" style string.
 */
function formatTimestamp(isoString) {
  try {
    const date = new Date(isoString);
    const now  = new Date();

    const sameDay = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const wasYesterday = date.toDateString() === yesterday.toDateString();

    const time = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

    if (sameDay)      return `Today at ${time}`;
    if (wasYesterday) return `Yesterday at ${time}`;

    const dateStr = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    return `${dateStr} at ${time}`;
  } catch (_) {
    return '';
  }
}

function getAsrLanguage() { return localStorage.getItem('ns_asr_lang') || 'en-US'; }
function setAsrLanguage(lang) { localStorage.setItem('ns_asr_lang', lang); }

window.Summarizer = { summarize, getAsrLanguage, setAsrLanguage, formatTimestamp };
