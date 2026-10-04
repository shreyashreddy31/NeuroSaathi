# Product Requirements Document
## NeuroSaathi — AI-Based Cognitive Gaming and Memory Assistance Platform for Elderly Dementia Patients in NER

**SIH Problem Statement:** SIH26003 | Ministry of Development of North Eastern Region (MDoNER)
**Document status:** Draft v1
**Team:** Innov8ors

---

## 1. Overview

NeuroSaathi is a multi-surface AI platform that helps elderly dementia patients in the North Eastern Region recognize the people around them, follow their daily routines, and exercise cognitive function — while giving caregivers and healthcare workers visibility into how the patient is doing over time.

The platform has four functional pillars delivered across three client surfaces (a wearable-style "glasses" experience, a mobile app, and a caregiver web dashboard), all backed by one shared engine.

**One-line proposed solution:** An AI-powered wearable and app platform that helps NER dementia patients recognize loved ones and follow daily routines in real time, through face-recognition memory support, adaptive cognitive games, and voice-guided reminders — all in their own language, online or off.

---

## 2. Problem Statement Recap

Elderly dementia patients in NER face progressive memory decline, confusion, and social isolation, compounded by language diversity, low digital literacy, and poor connectivity in the region. Existing dementia-care apps are generic, English-first, connectivity-dependent, and stop at basic games — they don't address the most painful symptom: failing to recognize the people closest to you.

The Ministry's ask: an AI/ML platform combining cognitive games, adaptive difficulty, multilingual voice interaction, culturally relevant content, reminders, caregiver monitoring, and offline functionality.

---

## 3. Goals

| Goal | Success metric |
|---|---|
| Help patients recognize enrolled loved ones in real time | Recognition displayed within ~1-2 seconds of a known face entering frame, in the live demo |
| Reduce missed medicine/routine events | Reminder fires on schedule and escalates to caregiver if unacknowledged within a set window |
| Improve/maintain cognitive engagement | Adaptive difficulty visibly responds to patient accuracy/response time across a game session |
| Give caregivers actionable visibility | Dashboard shows trend graphs and an alert log, not just raw scores |
| Work in low-connectivity NER settings | Core features (games, reminders, recognition) function fully offline; sync resumes automatically when online |
| Respect patient dignity and consent | Closed-set, opt-in recognition only; no open-ended surveillance; DPDP Act 2023–aligned data handling |

---

## 4. Users / Personas

- **Patient** — elderly individual living with dementia; primary user of the glasses simulation and mobile app; low digital literacy assumed
- **Caregiver** — family member managing the patient's day-to-day care; configures reminders, enrolls faces, monitors the dashboard
- **Healthcare/community worker** (e.g. ASHA worker) — may monitor multiple patients across households; needs a lightweight multi-patient view

---

## 5. Scope by Build Phase

The build order is deliberate: **start with the AR glasses simulation**, since it is the flagship differentiator and the hardest thing to get right live on stage. The app and dashboard support it, not the other way around.

### Phase 1 — AR Glasses Simulation (build first)
The centerpiece deliverable. A full-screen, laptop-based simulation of what a patient would see through smart glasses, styled after the reference interface below (see Section 7 for full UI spec):
- Live webcam feed as the background
- Face detection + recognition against enrolled profiles
- Name badge + relationship badge + last-interaction context card overlay, appearing near the recognized face
- Connection status indicator
- A mode toggle control (styled like "Enter Ray-Ban Mode" in the reference) representing the transition into the glasses' point-of-view experience
- On-glass reminder pop-ups (medicine/hydration/activity) firing at scheduled or triggered times, styled consistently with the recognition overlay

### Phase 2 — Mobile App (patient-facing)
- Cognitive games with adaptive difficulty
- Voice-guided instructions and interaction, regional language support (2-3 languages for prototype)
- Reminder acknowledgment flow
- Daily routine assistant

### Phase 3 — Web Dashboard (caregiver-facing)
- Face enrollment (name, relationship, reference photos, interaction notes)
- Reminder configuration (medicine, hydration, activity, appointment)
- Cognitive performance trend graphs
- Activity/engagement logs and anomaly alerts
- Multi-patient support for community health workers
- Exportable weekly/monthly reports

### Phase 4 — Stretch / Roadmap (mention, don't build in hackathon)
- Actual AR glasses hardware integration
- Full multilingual coverage across NER languages
- Location/time-aware proactive reminders
- District-level health monitoring integration

---

## 6. Functional Requirements

### 6.1 Familiar Faces (Recognition Engine)
- FR1: System shall detect faces in the live camera feed in real time
- FR2: System shall match a detected face against enrolled profiles using embedding similarity
- FR3: On match, system shall display the person's name, relationship, and a short note from their most recent logged interaction
- FR4: System shall NOT display any information for unmatched/unenrolled faces
- FR5: Caregiver shall be able to enroll, edit, and delete a profile (name, relationship, reference photo(s), interaction notes) from the web dashboard
- FR6: Recognition and profile data shall be available offline once synced to the device

### 6.2 Reminder Engine
- FR7: Caregiver shall be able to configure reminders (type, time/frequency, message) from the web dashboard
- FR8: Reminders shall fire on the active client (glasses simulation or mobile app) at the scheduled time, with a visual + voice cue
- FR9: Patient shall be able to acknowledge a reminder (voice or simple tap/gesture)
- FR10: If unacknowledged within a configurable window, system shall escalate the alert to the caregiver dashboard
- FR11: Reminders shall be scheduled and fire locally, independent of connectivity

### 6.3 Cognitive Games
- FR12: System shall provide at least 2 game types for the prototype (e.g. memory match, sequence recall), themed with NER-relevant content
- FR13: Difficulty shall adjust based on accuracy and response time/hesitation, not score alone
- FR14: The reason for a difficulty change shall be visible/explainable on the caregiver dashboard

### 6.4 Caregiver Dashboard
- FR15: Dashboard shall show cognitive performance trend graphs over time
- FR16: Dashboard shall show a recognized-person interaction log
- FR17: Dashboard shall show reminder acknowledgment/escalation history
- FR18: Dashboard shall support multiple patients per caregiver/health-worker account

### 6.5 Platform-wide
- FR19: All core features (games, reminders, recognition) shall function fully offline, syncing when connectivity returns
- FR20: UI shall support at least 2-3 regional languages for the prototype, with an extensible content structure for more
- FR21: All patient data shall be encrypted locally; sync/consent flows shall be explicit and caregiver-managed

---

## 7. UI Spec — AR Glasses Simulation (Phase 1 detail)

Styled after the reference screenshot shared by the team: a live camera feed with minimal, glanceable overlays — no dashboard chrome, no navigation menus.

**Layout elements:**
- **Background:** full-bleed live webcam feed
- **Connection status badge** — top-right corner, small pill, e.g. "● Connected (WebRTC)" — signals the system is live/active
- **Name badge** — appears near the recognized face once matched; solid-color pill (e.g. teal), bold text, first name only for glanceability
- **Relationship badge** — smaller pill directly beside the name badge, distinct color (e.g. blue), one or two words ("Son", "Neighbor", "Doctor")
- **Context card** — a translucent dark bar beneath the badges, 1-2 lines of plain text summarizing the most recent interaction (e.g. "Visited last week and talked about the hackathon he went to where he got 3rd place")
- **Mode toggle control** — bottom control bar, includes a "Stop video" control and a distinctly styled button representing entry into the immersive glasses view (reference used "Enter Ray-Ban Mode" — for this project, label it something like "Enter Glasses View")
- **Reminder overlay** — same visual language as the recognition overlay (translucent bar + short bold label + short context line), triggered on a schedule instead of a face match, so the two features feel like one consistent system rather than two bolted-together ones

**Interaction flow for the demo:**
1. System opens in standard webcam view, status badge shows "Connected"
2. A pre-enrolled person walks into frame → name + relationship badges animate in, followed by the context card
3. At a triggered time (or fast-forwarded clock, for demo purposes), a reminder overlay appears in the same visual style
4. Presenter can toggle "Enter Glasses View" to demonstrate the intended full immersive framing (e.g. a cropped/vignette view simulating a glasses lens) versus the standard webcam framing

---

## 8. Technical Architecture

Three clients, one shared backend:

- **Glasses simulation** (Phase 1): standalone full-screen web app (HTML/JS or lightweight React), own window/URL, runs face detection (MediaPipe/face-api.js) + embedding (MobileFaceNet) directly against the webcam feed, calls the shared backend for matching and reminder data
- **Mobile app** (Phase 2): Flutter, patient-facing
- **Web dashboard** (Phase 3): React, caregiver-facing

**Shared backend:**
- Recognition engine — face embedding similarity search (MongoDB Atlas Vector Search, or in-memory cosine similarity for the hackathon scale)
- Reminder engine — scheduling, delivery targeting, escalation logic
- Data stores — MongoDB (profiles, embeddings, interaction history), PostgreSQL (patients, caregivers, reminders, game data)

**Cross-cutting:**
- Offline-first: on-device inference (TensorFlow Lite/ONNX Runtime Mobile) and local scheduling, background sync when online
- Voice: AI4Bharat/IndicTrans2-based STT/TTS for regional languages
- Security: encrypted local storage, caregiver-managed consent, DPDP Act 2023–aligned handling of biometric/health data

**Data model (person profile, MongoDB):**
```
{
  person_id,
  name,
  relationship: "Son",
  face_embedding: [vector],
  last_interaction: {
    date,
    summary: "Visited last week, talked about the hackathon",
    logged_by: caregiver_id
  },
  interaction_history: [...]
}
```

---

## 9. Non-Functional Requirements

- **Offline resilience:** core flows must not depend on live connectivity
- **Latency:** face match + overlay render within ~1-2 seconds for a convincing live demo
- **Accessibility:** large touch targets, high contrast, minimal navigation depth (≤2 taps) on the mobile app
- **Privacy:** closed-set recognition only; explicit consent for enrollment; full delete/right-to-be-forgotten for any profile
- **Extensibility:** language packs and cultural content packs should be swappable configuration, not hardcoded per build

---

## 10. Ethics & Trust Commitments

- Recognition is strictly opt-in and closed-set — only pre-enrolled, consented individuals are ever identified; unmatched faces show nothing
- Enrollment is performed by the caregiver, with the enrolled person's consent
- All biometric/interaction data is encrypted and stored locally by default; sync is opt-in
- Data handling aligns with the DPDP Act 2023's treatment of biometric data as sensitive personal data

---

## 11. Milestones / Build Sequence

1. **Glasses simulation MVP** — webcam feed + face detection/recognition + name/relationship/context overlay, styled per Section 7
2. **On-glass reminder overlay** — same simulation, add scheduled/triggered reminder pop-ups
3. **Web dashboard (minimum)** — face enrollment + reminder configuration (feeds directly into #1 and #2)
4. **Mobile app (minimum)** — 1-2 cognitive games with visible adaptive difficulty + reminder acknowledgment
5. **Dashboard (full)** — trend graphs, recognized-person log, escalation history
6. **Offline mode validation** — demo each core flow with connectivity disabled
7. **Polish pass** — voice interaction, 2nd/3rd language, multi-patient support (time permitting)

---

## 12. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Live face recognition fails/misfires on stage | Rehearse extensively with fixed lighting; have a pre-recorded fallback clip ready |
| Judges question surveillance/privacy implications | Lead with the consent/closed-set design in the pitch, don't wait for Q&A |
| Multilingual voice scope creep | Commit to 2-3 languages only for the prototype; frame the rest as roadmap |
| Team runs out of time before dashboard/app are demo-ready | Build order in Section 11 ensures the flagship glasses demo is functional first, everything else is additive |

---

## 13. Out of Scope (for this build)

- Actual AR glasses hardware
- Full NER-wide language coverage
- District/state-level health system integration
- Clinical diagnosis or treatment recommendations of any kind
