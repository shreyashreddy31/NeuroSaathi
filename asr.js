/**
 * NeuroSaathi — ASR Module
 * asr.js — Web Speech API wrapper for live conversation transcription
 *
 * Wraps SpeechRecognition into a clean stateful class.
 * Production path: swap internals for IndicWhisper via WebSocket, same external API.
 *
 * Usage:
 *   const asr = new ASRSession();
 *   asr.onInterim = (text) => ...
 *   asr.onFinal   = (text) => ...
 *   asr.onEnd     = (fullTranscript) => ...
 *   asr.start('profile_key');
 *   asr.stop();
 */

'use strict';

const ASR_CONFIG = {
  SILENCE_THRESHOLD_MS: 10000,  // stop after 10s of silence
  MAX_SESSION_MS:       600000, // hard cap: 10 minutes per session
  LANGUAGE:             'en-US', // swappable — set to 'hi-IN', 'ne-NP', etc.
};

class ASRSession {
  constructor() {
    this.recognition = null;
    this.profileKey   = null;
    this.isRunning    = false;
    this.interimText  = '';
    this.finalChunks  = [];       // array of final transcript strings
    this._silenceTimer = null;
    this._maxTimer     = null;
    this._supported    = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

    // Callbacks — override these
    this.onInterim = (_text) => {};          // called with interim (unstable) transcript
    this.onFinal   = (_chunk) => {};         // called each time a final phrase is committed
    this.onEnd     = (_fullTranscript) => {}; // called when session ends with full transcript
    this.onError   = (_msg) => {};
    this.onStart   = () => {};
  }

  get supported() { return this._supported; }

  get fullTranscript() {
    return this.finalChunks.join(' ').trim();
  }

  get language() { return ASR_CONFIG.LANGUAGE; }
  set language(lang) { ASR_CONFIG.LANGUAGE = lang; }

  start(profileKey) {
    if (!this._supported) {
      this.onError('Web Speech API not supported in this browser. Use Chrome.');
      return false;
    }
    if (this.isRunning) this._teardown();

    this.profileKey  = profileKey;
    this.finalChunks = [];
    this.interimText = '';
    this.isRunning   = true;

    this._buildRecognition();
    this._startRecognition();
    this.onStart();
    this._resetSilenceTimer();
    this._resetMaxTimer();

    return true;
  }

  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;  // ← must set BEFORE calling recognition.stop()
    this._clearTimers();     //   so onend fires the callback instead of restarting
    if (this.recognition) {
      try { this.recognition.stop(); } catch (_) {}
    }
  }

  forceEnd() {
    // Immediately end and fire callback without waiting for recognition to settle
    if (!this.isRunning) return;
    this.isRunning = false;
    this._clearTimers();
    if (this.recognition) {
      try { this.recognition.abort(); } catch (_) {}
      this.recognition = null;
    }
    const transcript = this.fullTranscript;
    const key = this.profileKey;
    this.profileKey = null;
    this.onEnd(transcript, key);
  }

  // ── Private ──────────────────────────────────────────────

  _buildRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SR();

    this.recognition.lang           = ASR_CONFIG.LANGUAGE;
    this.recognition.continuous     = true;   // keep listening
    this.recognition.interimResults = true;   // stream partial results
    this.recognition.maxAlternatives = 1;

    this.recognition.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) {
          const chunk = result[0].transcript.trim();
          if (chunk) {
            this.finalChunks.push(chunk);
            this.onFinal(chunk);
          }
        } else {
          interim += result[0].transcript;
        }
      }
      this.interimText = interim;
      this.onInterim(interim);
      this._resetSilenceTimer(); // any speech = reset silence window
    };

    this.recognition.onerror = (e) => {
      // 'no-speech' and 'aborted' are expected — don't treat as hard errors
      if (e.error === 'no-speech') return;
      if (e.error === 'aborted')   return;
      console.warn('ASR error:', e.error);
      this.onError(e.error);
    };

    this.recognition.onend = () => {
      // SpeechRecognition auto-stops after silence or ~60s; restart if session is still live.
      // IMPORTANT: Chrome needs ~150ms gap between stop and start — calling start() immediately
      // throws InvalidStateError which is silently caught, leaving the session dead.
      if (this.isRunning) {
        setTimeout(() => {
          if (!this.isRunning) return; // session was ended during the delay
          // Rebuild a fresh recognition object — reusing the old one after onend is unreliable
          this._buildRecognition();
          try {
            this.recognition.start();
            this._resetSilenceTimer(); // reset so silence window counts from last speech, not restart
          } catch (e) {
            console.warn('[ASR] Restart failed:', e.message);
            // Give one more attempt after a longer delay
            setTimeout(() => {
              if (!this.isRunning) return;
              this._buildRecognition();
              try { this.recognition.start(); this._resetSilenceTimer(); } catch (_) {
                // Truly failed — end the session gracefully
                this.isRunning = false;
                const transcript = this.fullTranscript;
                const key = this.profileKey;
                this.profileKey = null;
                this.onEnd(transcript, key);
              }
            }, 500);
          }
        }, 150);
      } else {
        // Session intentionally ended
        const transcript = this.fullTranscript;
        const key = this.profileKey;
        this.profileKey = null;
        this.recognition = null;
        this.onEnd(transcript, key);
      }
    };
  }

  _startRecognition() {
    try {
      this.recognition.start();
    } catch (e) {
      this.onError('Could not start microphone: ' + e.message);
      this.isRunning = false;
    }
  }

  _teardown() {
    this.isRunning = false;
    this._clearTimers();
    if (this.recognition) {
      try { this.recognition.abort(); } catch (_) {}
      this.recognition = null;
    }
  }

  _resetSilenceTimer() {
    clearTimeout(this._silenceTimer);
    this._silenceTimer = setTimeout(() => {
      if (this.isRunning) {
        console.log('[ASR] Silence threshold — ending session');
        this.isRunning = false;  // set before stop() so onend fires the callback
        if (this.recognition) {
          try { this.recognition.stop(); } catch (_) {}
        }
      }
    }, ASR_CONFIG.SILENCE_THRESHOLD_MS);
  }

  _resetMaxTimer() {
    clearTimeout(this._maxTimer);
    this._maxTimer = setTimeout(() => {
      if (this.isRunning) {
        console.log('[ASR] Max session length reached — ending session');
        this.isRunning = false;
        if (this.recognition) {
          try { this.recognition.stop(); } catch (_) {}
        }
      }
    }, ASR_CONFIG.MAX_SESSION_MS);
  }

  _clearTimers() {
    clearTimeout(this._silenceTimer);
    clearTimeout(this._maxTimer);
    this._silenceTimer = null;
    this._maxTimer = null;
  }
}

// Singleton export
window.ASRSession = ASRSession;
