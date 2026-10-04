/**
 * NeuroSaathi — AR Glasses Simulation
 * app.js — Core: camera · face detection · recognition · ASR pipeline · reminders
 *
 * Auto-audio pipeline:
 *   Face recognized → mic activates → live transcript streams into overlay
 *   Face leaves / silence → stop ASR → summarize → save to profile → card updates
 *
 * Offline-first: face-api.js models from CDN (cached), profiles in localStorage.
 */

'use strict';

// ══════════════════════════════════════════════════════════════
// Config
// ══════════════════════════════════════════════════════════════

const CONFIG = {
  MODEL_URL_LOCAL:  './models',
  MODEL_URL_CDN:    'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model',
  PREFER_CDN:       true,
  DETECT_INTERVAL:  130,       // ms between detection runs
  MATCH_THRESHOLD:  0.48,      // Euclidean distance; lower = stricter
  OVERLAY_TTL:      8000,      // ms to keep overlay after face disappears (was 3500)
  ASR_FACE_GRACE:   5000,      // ms to wait before stopping ASR when face leaves frame
  REMINDER_TYPES: [
    { label:'Medicine',  icon:'💊', title:'Time for your medication',
      msg:'Please take your morning tablets with a glass of water.' },
    { label:'Hydration', icon:'💧', title:'Stay hydrated!',
      msg:'It has been a while since you last had some water. Please drink a glass now.' },
    { label:'Activity',  icon:'🚶', title:'Time for a short walk',
      msg:'A gentle 10-minute walk will help keep you active and refreshed.' },
    { label:'Meal',      icon:'🍽️', title:'Meal time',
      msg:'Your lunch is ready. Please come to the dining table.' },
  ],
};

// ══════════════════════════════════════════════════════════════
// State
// ══════════════════════════════════════════════════════════════

const STATE = {
  // Core
  modelsLoaded:      false,
  cameraRunning:     false,
  videoStopped:      false,
  glassesMode:       false,
  snapshotTaken:     false,
  reminderVisible:   false,
  reminderSnoozeTimer: null,
  reminderDemoIdx:   0,

  // Data
  profiles:          new Map(),  // key → { name, relationship, note, lastInteractionTime, descriptor }
  activeOverlays:    new Map(),  // faceId → { el, lastSeen, cardEl, transcriptEl, profileKey }

  // ASR pipeline
  asr:               null,
  asrProfileKey:     null,
  asrState:          'idle',     // 'idle' | 'listening' | 'summarizing'
  sessionStartedAt:  null,       // ISO timestamp of when the current ASR session started
  micMuted:          false,      // True when user explicitly mutes the mic
  faceGoneAt:        null,       // timestamp when face left frame (grace period before stopping ASR)
};

// ══════════════════════════════════════════════════════════════
// DOM refs
// ══════════════════════════════════════════════════════════════

const $webcam            = document.getElementById('webcam');
const $stoppedOverlay    = document.getElementById('stopped-overlay');
const $faceOverlays      = document.getElementById('face-overlays');
const $statusText        = document.getElementById('status-text');
const $profilesList      = document.getElementById('profiles-list');
const $loaderFill        = document.getElementById('loader-fill');
const $loaderStatus      = document.getElementById('loader-status');
const $loadingScreen     = document.getElementById('loading-screen');
const $stepCamera        = document.getElementById('step-camera');
const $stepModels        = document.getElementById('step-models');
const $stepAsr           = document.getElementById('step-asr');
const $stepReady         = document.getElementById('step-ready');
const $enrollModal       = document.getElementById('enroll-modal');
const $enrollPreview     = document.getElementById('enroll-preview');
const $enrollSnapshot    = document.getElementById('enroll-snapshot');
const $snapHint          = document.getElementById('snap-hint');
const $btnSave           = document.getElementById('btn-save');
const $btnSnap           = document.getElementById('btn-snap');
const $btnRetake         = document.getElementById('btn-retake');
const $reminderOverlay   = document.getElementById('reminder-overlay');
const $reminderIcon      = document.getElementById('reminder-icon');
const $reminderTypeBadge = document.getElementById('reminder-type-badge');
const $reminderTitle     = document.getElementById('reminder-title');
const $reminderMessage   = document.getElementById('reminder-message');
const $btnStopVideo      = document.getElementById('btn-stop-video');
const $stopIconInner     = document.getElementById('stop-icon-inner');
const $stopLabel         = document.getElementById('stop-label');
const $btnGlassesMode    = document.getElementById('btn-glasses-mode');
const $notifContainer   = document.getElementById('notif-container');
const $settingsModal     = document.getElementById('settings-modal');
const $micGlobalStatus   = document.getElementById('mic-global-status');

// ══════════════════════════════════════════════════════════════
// Boot
// ══════════════════════════════════════════════════════════════

window.addEventListener('DOMContentLoaded', init);

async function init() {
  setLoaderStatus('Initialising…', 8);

  try {
    // 1. Load face-api.js models
    activateStep($stepModels);
    setLoaderStatus('Loading face recognition models…', 15);
    const modelUrl = await resolveModelUrl();
    const source = modelUrl.includes('cdn') ? 'CDN' : 'local cache';
    setLoaderStatus(`Loading models from ${source}…`, 28);

    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(modelUrl),
      faceapi.nets.faceLandmark68Net.loadFromUri(modelUrl),
      faceapi.nets.faceRecognitionNet.loadFromUri(modelUrl),
    ]);

    doneStep($stepModels);
    setLoaderStatus('Face models loaded ✓', 58);

    // 2. Load stored profiles
    loadProfilesFromStorage();
    setLoaderStatus(`Profiles loaded (${STATE.profiles.size} enrolled) ✓`, 70);

    // 3. Start camera
    activateStep($stepCamera);
    setLoaderStatus('Requesting camera…', 78);
    await startCamera();
    doneStep($stepCamera);
    setLoaderStatus('Camera ready ✓', 90);

    // 4. Init ASR
    activateStep($stepAsr);
    initASR();
    doneStep($stepAsr);
    setLoaderStatus('Microphone ready ✓', 95);

    STATE.modelsLoaded = true;

    activateStep($stepReady);
    await sleep(300);
    setLoaderStatus('Ready', 100);
    doneStep($stepReady);
    await sleep(500);
    $loadingScreen.classList.add('hidden');

    // 5. Start detection loop
    startDetectionLoop();
    renderProfilesList();

  } catch (err) {
    console.error('Init error:', err);
    setLoaderStatus('Error: ' + err.message, 100);
    $loaderFill.style.background = '#EF4444';
    showToast('Init failed — check console', 'error', 6000);
  }
}

function setLoaderStatus(msg, pct) {
  $loaderStatus.textContent = msg;
  $loaderFill.style.width = pct + '%';
}

function activateStep(el) {
  if (!el) return;
  el.classList.remove('done');
  el.classList.add('active');
}

function doneStep(el) {
  if (!el) return;
  el.classList.remove('active');
  el.classList.add('done');
}

async function resolveModelUrl() {
  if (location.protocol === 'file:' || CONFIG.PREFER_CDN) return CONFIG.MODEL_URL_CDN;
  try {
    const r = await fetch(CONFIG.MODEL_URL_LOCAL + '/ssd_mobilenetv1_model-weights_manifest.json', { method: 'HEAD' });
    if (r.ok) return CONFIG.MODEL_URL_LOCAL;
  } catch (_) {}
  return CONFIG.MODEL_URL_CDN;
}

// ══════════════════════════════════════════════════════════════
// Camera
// ══════════════════════════════════════════════════════════════

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
    audio: false,
  });
  $webcam.srcObject = stream;
  await new Promise(res => { $webcam.onloadedmetadata = res; });
  await $webcam.play();
  STATE.cameraRunning = true;
}

function toggleMic() {
  STATE.micMuted = !STATE.micMuted;
  if (STATE.micMuted) {
    // If a session is active, grab the transcript BEFORE ending it, then summarize
    if (STATE.asrState === 'listening' && STATE.asr && STATE.asr.isRunning) {
      const transcript  = STATE.asr.fullTranscript;  // snapshot now
      const profileKey  = STATE.asrProfileKey;
      const startedAt   = STATE.sessionStartedAt;

      // End the ASR session (fires onEnd, but we'll skip its summarize path)
      STATE.asr.forceEnd();

      // Manually trigger summarize on captured transcript
      if (transcript && transcript.trim().length >= 5 && profileKey) {
        STATE.sessionStartedAt = startedAt;  // restore so pipeline can timestamp it
        runSummarizePipeline(transcript, profileKey);
      }
    }
    $stopIconInner.style.textDecoration = 'line-through';
    $stopIconInner.style.opacity = '0.5';
    $stopLabel.textContent = 'Unmute Mic';
    $btnStopVideo.classList.add('active');
    showToast('🎙 Mic muted — summarizing…', 'info', 2800);
  } else {
    $stopIconInner.style.textDecoration = 'none';
    $stopIconInner.style.opacity = '1';
    $stopLabel.textContent = 'Mute Mic';
    $btnStopVideo.classList.remove('active');
    showToast('Microphone unmuted', 'success');
  }
}

// ══════════════════════════════════════════════════════════════
// Face Detection Loop
// ══════════════════════════════════════════════════════════════

async function startDetectionLoop() {
  let lastRun = 0;
  async function loop(ts) {
    if (!STATE.videoStopped && STATE.modelsLoaded && (ts - lastRun >= CONFIG.DETECT_INTERVAL)) {
      lastRun = ts;
      await runDetection();
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

async function runDetection() {
  if ($webcam.readyState < 2 || $webcam.paused) return;

  try {
    const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.45 });
    const detections = await faceapi
      .detectAllFaces($webcam, options)
      .withFaceLandmarks()
      .withFaceDescriptors();

    const vw = $webcam.videoWidth  || 1280;
    const vh = $webcam.videoHeight || 720;
    const dw = $webcam.offsetWidth  || window.innerWidth;
    const dh = $webcam.offsetHeight || window.innerHeight;
    const sx = dw / vw, sy = dh / vh;

    const now = Date.now();
    const seenProfileKeys = new Set();

    for (const det of detections) {
      const { box } = det.detection;
      const mirrorX = vw - box.x - box.width;
      const dispX = mirrorX * sx, dispY = box.y * sy;
      const dispW = box.width * sx, dispH = box.height * sy;

      const match = findBestMatch(det.descriptor);
      if (!match) continue;  // FR4: no overlay for unknown faces

      const id = 'face_' + match._key;
      seenProfileKeys.add(match._key);
      upsertOverlay(id, dispX, dispY, dispW, dispH, match, now);
    }

    // ── ASR trigger logic ─────────────────────────────────
    // Start ASR when a face is first recognized; stop when it leaves
    handleASRTrigger(seenProfileKeys);

    // ── Expire overlays for faces that left frame ─────────
    for (const [id, data] of STATE.activeOverlays) {
      if (!seenProfileKeys.has(data.profileKey)) {
        if (now - data.lastSeen > CONFIG.OVERLAY_TTL) {
          removeOverlay(id);
        }
      } else {
        data.lastSeen = now;
      }
    }

  } catch (e) {
    console.debug('Detection frame error:', e.message);
  }
}

// ══════════════════════════════════════════════════════════════
// Face Matching
// ══════════════════════════════════════════════════════════════

function findBestMatch(descriptor) {
  if (STATE.profiles.size === 0) return null;
  let bestDist = Infinity, bestProfile = null;
  for (const [, profile] of STATE.profiles) {
    const dist = faceapi.euclideanDistance(descriptor, profile.descriptor);
    if (dist < bestDist) { bestDist = dist; bestProfile = profile; }
  }
  return bestDist <= CONFIG.MATCH_THRESHOLD ? bestProfile : null;
}

// ══════════════════════════════════════════════════════════════
// Overlay Management
// ══════════════════════════════════════════════════════════════

function upsertOverlay(id, faceX, faceY, faceW, faceH, profile, now) {
  if (STATE.activeOverlays.has(id)) {
    const data = STATE.activeOverlays.get(id);
    data.lastSeen = now;
    positionOverlay(data.el, faceX, faceY, faceW, faceH);
    return;
  }

  const el = document.createElement('div');
  el.className = 'face-overlay entering';
  el.dataset.profileKey = profile._key;

  // Overlay structure: badge row + context card + transcript panel
  el.innerHTML = `
    <div class="badge-row">
      <div class="name-badge">
        <span class="badge-name-text">${escHtml(profile.name)}</span>
        <span class="mic-dot" title="Listening…"></span>
      </div>
      <div class="rel-badge">${escHtml(profile.relationship)}</div>
    </div>
    <div class="context-card" data-role="context">
      <div class="context-text">${escHtml(profile.note || 'No recent interaction recorded.')}</div>
      ${profile.lastInteractionTime
        ? `<div class="context-timestamp">${escHtml(Summarizer.formatTimestamp(profile.lastInteractionTime))}</div>`
        : ''}
    </div>
    <div class="transcript-panel" data-role="transcript" style="display:none;">
      <div class="transcript-header">
        <span class="transcript-dot"></span>
        <span class="transcript-label">Live transcript</span>
      </div>
      <div class="transcript-body"></div>
      <div class="transcript-interim"></div>
    </div>
  `;

  positionOverlay(el, faceX, faceY, faceW, faceH);
  $faceOverlays.appendChild(el);
  setTimeout(() => el.classList.remove('entering'), 500);

  STATE.activeOverlays.set(id, {
    el,
    profileKey:    profile._key,
    lastSeen:      now,
    cardEl:        el.querySelector('[data-role="context"]'),
    transcriptEl:  el.querySelector('[data-role="transcript"]'),
    transcriptBodyEl: el.querySelector('.transcript-body'),
    transcriptInterimEl: el.querySelector('.transcript-interim'),
    micDotEl:      el.querySelector('.mic-dot'),
  });
}

function positionOverlay(el, faceX, faceY, faceW, faceH) {
  const MARGIN = 16, OVERLAY_W = 350;
  const stageW = window.innerWidth, stageH = window.innerHeight;

  let left = faceX + faceW + MARGIN;
  let top  = faceY + faceH * 0.10;

  if (left + OVERLAY_W > stageW - 12) left = Math.max(12, faceX - OVERLAY_W - MARGIN);
  top = Math.max(12, Math.min(top, stageH - 200));

  el.style.left = left + 'px';
  el.style.top  = top  + 'px';
}

function removeOverlay(id) {
  const data = STATE.activeOverlays.get(id);
  if (!data) return;
  data.el.classList.add('exiting');
  setTimeout(() => { if (data.el.parentNode) data.el.parentNode.removeChild(data.el); }, 300);
  STATE.activeOverlays.delete(id);
}

function clearAllOverlays() {
  for (const [id] of [...STATE.activeOverlays]) removeOverlay(id);
}

// Get the overlay data for a given profileKey
function getOverlayByProfileKey(profileKey) {
  for (const [, data] of STATE.activeOverlays) {
    if (data.profileKey === profileKey) return data;
  }
  return null;
}

// ══════════════════════════════════════════════════════════════
// ASR Pipeline — trigger logic
// ══════════════════════════════════════════════════════════════

/**
 * Called every detection frame with the set of currently-seen profileKeys.
 * Starts/stops the ASR session based on face presence.
 */
function handleASRTrigger(seenProfileKeys) {
  // If we're summarizing, don't interrupt
  if (STATE.asrState === 'summarizing') return;

  if (seenProfileKeys.size === 0) {
    // No recognized faces — but don't stop immediately, use a grace period
    if (STATE.asrState === 'listening') {
      if (!STATE.faceGoneAt) {
        STATE.faceGoneAt = Date.now(); // start grace timer
      } else if (Date.now() - STATE.faceGoneAt > CONFIG.ASR_FACE_GRACE) {
        STATE.faceGoneAt = null;
        stopASRSession();
      }
      // else: still within grace period, keep listening
    }
    return;
  }

  // Face is visible — reset grace timer
  STATE.faceGoneAt = null;

  // At least one recognized face present
  if (STATE.asrState === 'idle') {
    if (STATE.micMuted) return; // Don't start listening if muted
    // Start listening for the first recognized face
    const firstKey = [...seenProfileKeys][0];
    startASRSession(firstKey);
    return;
  }

  if (STATE.asrState === 'listening') {
    // If the face we're listening for has left but another appeared
    if (!seenProfileKeys.has(STATE.asrProfileKey)) {
      stopASRSession(); // will summarize for the one that left
      // Next frame will start new session for the new face
    }
  }
}

// ══════════════════════════════════════════════════════════════
// ASR Pipeline — session control
// ══════════════════════════════════════════════════════════════

function initASR() {
  STATE.asr = new ASRSession();
  // Language priority: config.js → settings modal (localStorage) → default en-US
  STATE.asr.language = window.NS_CONFIG?.ASR_LANGUAGE?.trim()
    || Summarizer.getAsrLanguage();

  STATE.asr.onStart = () => {
    setMicStatus('listening', STATE.asrProfileKey);
    updateMicGlobalBadge(true);
  };

  STATE.asr.onInterim = (text) => {
    if (!text) return;
    const overlay = getOverlayByProfileKey(STATE.asrProfileKey);
    if (overlay) {
      overlay.transcriptInterimEl.textContent = text;
    }
  };

  STATE.asr.onFinal = (chunk) => {
    const overlay = getOverlayByProfileKey(STATE.asrProfileKey);
    if (overlay) {
      const p = document.createElement('p');
      p.className = 'transcript-chunk';
      p.textContent = chunk;
      overlay.transcriptBodyEl.appendChild(p);
      overlay.transcriptBodyEl.scrollTop = overlay.transcriptBodyEl.scrollHeight;
      overlay.transcriptInterimEl.textContent = '';
    }
  };

  STATE.asr.onEnd = async (transcript, profileKey) => {
    console.log(`[ASR] Session ended for ${profileKey}. Transcript length: ${transcript.length}`);

    // Clear mic UI
    setMicStatus('idle', profileKey);
    updateMicGlobalBadge(false);

    if (!profileKey || !STATE.profiles.has(profileKey)) return;

    // Switch to summarizing state
    const prevAsrKey = STATE.asrProfileKey;
    STATE.asrProfileKey = null;
    STATE.asrState = 'idle';  // allow new sessions to start

    if (transcript.trim().length < 5) {
      // Nothing meaningful — don't overwrite stored note
      const overlay = getOverlayByProfileKey(profileKey);
      if (overlay) hideTranscriptPanel(overlay);
      return;
    }

    // If mic was just muted, toggleMic() already fired runSummarizePipeline — skip here
    if (STATE.micMuted) {
      const overlay = getOverlayByProfileKey(profileKey);
      if (overlay) hideTranscriptPanel(overlay);
      return;
    }

    await runSummarizePipeline(transcript, profileKey);
  };

  STATE.asr.onError = (msg) => {
    console.warn('[ASR] Error:', msg);
    if (msg.includes('not-allowed') || msg.includes('denied')) {
      showToast('Microphone permission denied', 'error', 4000);
    }
    setMicStatus('idle', STATE.asrProfileKey);
    updateMicGlobalBadge(false);
    STATE.asrState = 'idle';
    STATE.asrProfileKey = null;
  };
}

function startASRSession(profileKey) {
  if (!STATE.asr || STATE.asrState !== 'idle') return;
  if (!STATE.profiles.has(profileKey)) return;

  STATE.asrProfileKey  = profileKey;
  STATE.asrState       = 'listening';
  STATE.sessionStartedAt = new Date().toISOString();  // record start time

  const started = STATE.asr.start(profileKey);
  if (!started) {
    STATE.asrState = 'idle';
    STATE.asrProfileKey = null;
    STATE.sessionStartedAt = null;
    showToast('Microphone not available — transcription disabled', 'error', 4000);
  } else {
    const overlay = getOverlayByProfileKey(profileKey);
    if (overlay) showTranscriptPanel(overlay);
  }
}

function stopASRSession() {
  if (!STATE.asr || STATE.asrState !== 'listening') return;
  STATE.asrState = 'summarizing';
  STATE.asr.stop();
  // onEnd callback will do the rest
}

// ══════════════════════════════════════════════════════════════
// Summarize Pipeline
// ══════════════════════════════════════════════════════════════

async function runSummarizePipeline(transcript, profileKey) {
  const profile = STATE.profiles.get(profileKey);
  if (!profile) return;

  const startedAt = STATE.sessionStartedAt;
  STATE.sessionStartedAt = null;

  const overlay = getOverlayByProfileKey(profileKey);
  if (overlay) setSummarizingState(overlay, true);

  try {
    const { summary, timestamp, method } = await Summarizer.summarize(
      transcript, profile.name, startedAt
    );
    console.log(`[Summarizer] ${method} → "${summary}" @ ${timestamp}`);

    // Save to profile
    profile.note = summary;
    profile.lastInteractionTime = startedAt || new Date().toISOString();
    saveProfilesToStorage();

    // Update overlay card
    if (overlay) {
      setSummarizingState(overlay, false);
      hideTranscriptPanel(overlay);

      const contextText = overlay.cardEl.querySelector('.context-text');
      if (contextText) contextText.textContent = summary;

      // Update or create timestamp element
      let tsEl = overlay.cardEl.querySelector('.context-timestamp');
      if (!tsEl) {
        tsEl = document.createElement('div');
        tsEl.className = 'context-timestamp';
        overlay.cardEl.appendChild(tsEl);
      }
      tsEl.textContent = timestamp;

      overlay.cardEl.classList.add('card-updated');
      setTimeout(() => overlay.cardEl.classList.remove('card-updated'), 1200);
    }

    const icon = method === 'gemini' ? '✨' : '📝';
    showToast(`${icon} Summary saved for ${profile.name}`, 'success', 3500);

  } catch (err) {
    console.error('[Summarizer] Pipeline error:', err);
    if (overlay) { setSummarizingState(overlay, false); hideTranscriptPanel(overlay); }
    showToast('Could not summarize conversation', 'error', 3000);
  }
}

// ── Overlay state helpers ─────────────────────────────────────

function showTranscriptPanel(overlay) {
  const { transcriptEl, cardEl, micDotEl } = overlay;
  transcriptEl.style.display = 'block';
  cardEl.classList.add('card-dim');        // dim stored note while listening
  if (micDotEl) micDotEl.style.display = 'inline-block';
}

function hideTranscriptPanel(overlay) {
  const { transcriptEl, cardEl, micDotEl } = overlay;
  transcriptEl.style.display = 'none';
  cardEl.classList.remove('card-dim', 'card-summarizing');
  if (micDotEl) micDotEl.style.display = 'none';
}

function setSummarizingState(overlay, on) {
  const { cardEl, transcriptEl } = overlay;
  if (on) {
    cardEl.classList.add('card-summarizing');
    cardEl.classList.remove('card-dim');
    const text = cardEl.querySelector('.context-text');
    if (text) text.innerHTML = '<span class="summarizing-spinner"></span> Summarising conversation…';
    transcriptEl.style.display = 'none';
  } else {
    cardEl.classList.remove('card-summarizing');
  }
}

function setMicStatus(state, profileKey) {
  const overlay = getOverlayByProfileKey(profileKey);
  if (!overlay) return;
  const { micDotEl } = overlay;
  if (!micDotEl) return;
  if (state === 'listening') {
    micDotEl.classList.add('mic-active');
    micDotEl.style.display = 'inline-block';
  } else {
    micDotEl.classList.remove('mic-active');
    micDotEl.style.display = 'none';
  }
}

function updateMicGlobalBadge(active) {
  if (!$micGlobalStatus) return;
  $micGlobalStatus.classList.toggle('mic-listening', active);
  $micGlobalStatus.textContent = active ? '🎙 Listening' : '';
  $micGlobalStatus.style.display = active ? 'flex' : 'none';
}

// ══════════════════════════════════════════════════════════════
// Enrollment
// ══════════════════════════════════════════════════════════════

function openEnrollModal() {
  STATE.snapshotTaken = false;
  $btnSave.disabled = true;
  $btnSnap.style.display = '';
  $btnRetake.style.display = 'none';
  $enrollSnapshot.style.display = 'none';
  $enrollPreview.style.display = 'block';
  $snapHint.textContent = 'Position face clearly in frame, then capture';
  document.getElementById('enroll-name').value = '';
  document.getElementById('enroll-rel').selectedIndex = 0;
  document.getElementById('enroll-note').value = '';
  if ($webcam.srcObject) $enrollPreview.srcObject = $webcam.srcObject;
  $enrollModal.classList.add('open');
}

function closeEnrollModal() { $enrollModal.classList.remove('open'); }

function captureSnapshot() {
  if (!STATE.modelsLoaded) { showToast('Models not ready yet', 'error'); return; }
  const video = $enrollPreview;
  const canvas = $enrollSnapshot;
  canvas.width  = video.videoWidth  || 640;
  canvas.height = video.videoHeight || 480;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  canvas.style.display = 'block';
  $enrollPreview.style.display = 'none';
  $btnSnap.style.display = 'none';
  $btnRetake.style.display = '';
  $snapHint.textContent = '✓ Photo captured — fill in the details below';
  STATE.snapshotTaken = true;
  $btnSave.disabled = false;
}

function retakeSnapshot() {
  STATE.snapshotTaken = false;
  $btnSave.disabled = true;
  $enrollSnapshot.style.display = 'none';
  $enrollPreview.style.display = 'block';
  $btnSnap.style.display = '';
  $btnRetake.style.display = 'none';
  $snapHint.textContent = 'Position face clearly in frame, then capture';
}

async function saveEnrollment() {
  const name = document.getElementById('enroll-name').value.trim();
  const rel  = document.getElementById('enroll-rel').value;
  const note = document.getElementById('enroll-note').value.trim();

  if (!name)                { showToast('Please enter a name', 'error'); return; }
  if (!STATE.snapshotTaken) { showToast('Please capture a photo first', 'error'); return; }

  $btnSave.disabled = true;
  $btnSave.textContent = 'Processing…';

  try {
    const detection = await faceapi
      .detectSingleFace($enrollSnapshot, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.35 }))
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      showToast('No face detected — try better lighting or a closer shot', 'error', 4000);
      return;
    }

    const key = name.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now();
    STATE.profiles.set(key, {
      _key:         key,
      name,
      relationship: rel,
      note:         note || 'No recent interaction recorded.',
      descriptor:   detection.descriptor,
    });

    saveProfilesToStorage();
    renderProfilesList();
    closeEnrollModal();
    showToast(`${name} enrolled ✓`, 'success');

  } catch (err) {
    console.error('Enrollment error:', err);
    showToast('Enrollment failed: ' + err.message, 'error');
  } finally {
    $btnSave.disabled = false;
    $btnSave.textContent = 'Save Profile';
  }
}

// ══════════════════════════════════════════════════════════════
// Profile Storage
// ══════════════════════════════════════════════════════════════

function saveProfilesToStorage() {
  try {
    const data = [...STATE.profiles.values()].map(p => ({
      _key:         p._key,
      name:         p.name,
      relationship: p.relationship,
      note:         p.note,
      descriptor:   Array.from(p.descriptor),
    }));
    localStorage.setItem('ns_profiles_v1', JSON.stringify(data));
  } catch (e) { console.warn('Storage save failed:', e); }
}

function loadProfilesFromStorage() {
  try {
    const raw = localStorage.getItem('ns_profiles_v1');
    if (!raw) return;
    for (const p of JSON.parse(raw)) {
      STATE.profiles.set(p._key, { ...p, descriptor: new Float32Array(p.descriptor) });
    }
  } catch (e) { console.warn('Storage load failed:', e); }
}

function deleteProfile(key) {
  if (STATE.asrProfileKey === key && STATE.asrState !== 'idle') stopASRSession();
  STATE.profiles.delete(key);
  saveProfilesToStorage();
  renderProfilesList();
  const id = 'face_' + key;
  if (STATE.activeOverlays.has(id)) removeOverlay(id);
  showToast('Profile deleted', 'success');
}

function renderProfilesList() {
  $profilesList.innerHTML = '';
  for (const [key, p] of STATE.profiles) {
    const pill = document.createElement('div');
    pill.className = 'profile-pill';
    pill.innerHTML = `
      <span class="pdot"></span>
      <span>${escHtml(p.name)} <span style="opacity:0.5;font-size:10px;">${escHtml(p.relationship)}</span></span>
      <button class="btn-del-profile" onclick="deleteProfile('${escHtml(key)}')" title="Remove">×</button>
    `;
    $profilesList.appendChild(pill);
  }
}

// ══════════════════════════════════════════════════════════════
// Reminders
// ══════════════════════════════════════════════════════════════

function triggerReminderDemo() {
  const t = CONFIG.REMINDER_TYPES[STATE.reminderDemoIdx % CONFIG.REMINDER_TYPES.length];
  STATE.reminderDemoIdx++;
  $reminderIcon.textContent      = t.icon;
  $reminderTypeBadge.textContent = t.label;
  $reminderTitle.textContent     = t.title;
  $reminderMessage.textContent   = t.msg;
  $reminderOverlay.classList.add('visible');
  STATE.reminderVisible = true;
}

function dismissReminder() {
  $reminderOverlay.classList.remove('visible');
  STATE.reminderVisible = false;
  if (STATE.reminderSnoozeTimer) { clearTimeout(STATE.reminderSnoozeTimer); STATE.reminderSnoozeTimer = null; }
  showToast('Reminder acknowledged ✓', 'success');
}

function snoozeReminder() {
  $reminderOverlay.classList.remove('visible');
  STATE.reminderVisible = false;
  showToast('Snoozed for 5 minutes', 'success');
  STATE.reminderSnoozeTimer = setTimeout(() => {
    $reminderOverlay.classList.add('visible');
    STATE.reminderVisible = true;
  }, 5 * 60 * 1000);
}

// ══════════════════════════════════════════════════════════════
// Settings Modal
// ══════════════════════════════════════════════════════════════

function openSettings() {
  document.getElementById('input-gemini-key').value =
    localStorage.getItem('ns_gemini_key') || '';
  document.getElementById('select-asr-lang').value =
    Summarizer.getAsrLanguage();
  $settingsModal.classList.add('open');
}

function closeSettings() { $settingsModal.classList.remove('open'); }

function saveSettings() {
  const key  = document.getElementById('input-gemini-key').value.trim();
  const lang = document.getElementById('select-asr-lang').value;

  if (key) {
    localStorage.setItem('ns_gemini_key', key);
  } else {
    localStorage.removeItem('ns_gemini_key');
  }

  Summarizer.setAsrLanguage(lang);
  if (STATE.asr) STATE.asr.language = lang;

  closeSettings();
  showToast('Settings saved ✓', 'success');
}

// ══════════════════════════════════════════════════════════════
// Glasses Mode
// ══════════════════════════════════════════════════════════════

function toggleGlassesMode() {
  STATE.glassesMode = !STATE.glassesMode;
  document.body.classList.toggle('glasses-mode', STATE.glassesMode);
  $btnGlassesMode.classList.toggle('active', STATE.glassesMode);
  $btnGlassesMode.textContent = STATE.glassesMode ? 'Exit Ray-Ban Mode' : 'Enter Ray-Ban Mode';
  showToast(STATE.glassesMode ? 'Glasses view active' : 'Standard view', 'success');
}

// ══════════════════════════════════════════════════════════════
// Status Badge
// ══════════════════════════════════════════════════════════════

function updateStatus(text, connected) {
  $statusText.textContent = text;
  const dot = document.getElementById('status-dot');
  dot.style.background = connected ? 'var(--green)' : '#EF4444';
  dot.style.boxShadow  = connected ? '0 0 5px var(--green)' : '0 0 5px #EF4444';
}

// ══════════════════════════════════════════════════════════════
// Toast
// ══════════════════════════════════════════════════════════════

let _toastTimer = null;
const NOTIF_META = {
  success: { icon: '✓', label: 'Success' },
  error:   { icon: '✕', label: 'Error' },
  info:    { icon: 'ℹ', label: 'Info' },
  '':      { icon: '•', label: 'Notice' },
};



function showToast(msg, type = '', duration = 2600) {
  const meta = NOTIF_META[type] || NOTIF_META[''];

  const card = document.createElement('div');
  card.className = `notif-card${type ? ' ' + type : ''}`;
  card.innerHTML = `
    <div class="notif-icon">${meta.icon}</div>
    <div class="notif-body">
      <div class="notif-title">${meta.label}</div>
      <div class="notif-msg">${escHtml(msg)}</div>
    </div>
    <div class="notif-progress" style="animation-duration:${duration}ms"></div>
  `;

  $notifContainer.appendChild(card);

  // Trigger slide-in on next frame
  requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('show')));

  // Click to dismiss early
  card.addEventListener('click', () => dismiss(card));

  // Auto-dismiss
  const timer = setTimeout(() => dismiss(card), duration);

  function dismiss(el) {
    clearTimeout(timer);
    el.classList.add('hide');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
  }
}

// ══════════════════════════════════════════════════════════════
// Utilities
// ══════════════════════════════════════════════════════════════

function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ══════════════════════════════════════════════════════════════
// Keyboard shortcuts
// ══════════════════════════════════════════════════════════════

window.addEventListener('keydown', e => {
  if ($enrollModal.classList.contains('open')) {
    if (e.key === 'Escape') closeEnrollModal();
    return;
  }
  if ($settingsModal && $settingsModal.classList.contains('open')) {
    if (e.key === 'Escape') closeSettings();
    return;
  }
  switch (e.key) {
    case 'e': case 'E': openEnrollModal();       break;
    case 'r': case 'R': triggerReminderDemo();   break;
    case 'g': case 'G': toggleGlassesMode();     break;
    case ',': openSettings();                    break;
    case ' ': e.preventDefault(); toggleMic();   break;
  }
});
