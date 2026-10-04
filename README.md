# NeuroSaathi 👓🧠
### AI-Powered AR Memory Glasses & Cognitive Assistance Platform
**Smart India Hackathon (SIH) | Problem Statement SIH26003**  
*Ministry of Development of North Eastern Region (MDoNER)*

---

## 🌟 Overview

**NeuroSaathi** is an assistive AI platform engineered to support elderly dementia patients—specifically tailored for low-connectivity, culturally diverse environments such as India's North Eastern Region (NER). 

Through an augmented reality (AR) glasses heads-up display (HUD) simulation, NeuroSaathi bridges the gap between memory decline and daily living:
- **Instant Recognition**: Identifies loved ones and familiar caregivers in real time.
- **Contextual Memory Cues**: Recalls past conversations, relationship details, and key reminders directly in the patient's field of view.
- **Conversational Memory**: Continuously transcribes interactions and automatically summarizes them into structured memories using Google Gemini AI.

---

## 🚀 Key Features

- **👓 Immersive AR HUD Simulation**:
  - Live webcam feed overlay with cyber-assistive HUD styling.
  - Target tracking brackets, identity badges, relationship context, and last interaction timestamps.
- **👤 On-Device Face Recognition**:
  - Powered by `face-api.js` (SSD MobileNet V1, Face Landmarks 68, and Face Recognition descriptor embeddings).
  - Runs completely client-side in the browser—fully functional offline without streaming raw video to external servers.
- **🎙️ Real-Time Multilingual Speech-to-Text (ASR)**:
  - Ambient conversation transcription using the Web Speech API.
  - Continuous speech capture and real-time caption display on the AR visor.
- **🤖 Automated Interaction Summarization**:
  - Integrates Google Gemini (`gemini-2.5-flash`) to extract conversational highlights, emotional tone, and actionable reminders from transcribed chats.
  - Automatically enriches the patient's interaction history log for caregiver review.
- **🔒 Privacy & Offline-First Design**:
  - Face embeddings are stored locally.
  - Sensitive API credentials remain secure via client-side configuration.

---

## 📂 Project Structure

```
.
├── index.html              # Main application UI & AR Glasses HUD simulation
├── style.css               # Premium cyber/AR HUD styling, animations, and layouts
├── app.js                  # Core controller: camera management, face detection, & HUD logic
├── asr.js                  # Speech recognition service & live transcription handling
├── summarizer.js           # Gemini AI integration for summarizing interactions
├── config.example.js       # Template for API credentials & language settings
├── config.js               # Local config (Git-ignored for security)
├── NeuroSaathi_PRD.md      # Comprehensive Product Requirements Document (PRD)
├── models/                 # Face-api.js neural network weight shards & manifests
│   ├── ssd_mobilenetv1_model-*
│   ├── face_landmark_68_model-*
│   └── face_recognition_model-*
└── README.md
```

---

## 🛠️ Quick Start Guide

### 1. Clone the Repository
```bash
git clone https://github.com/arnavnavale7/NeuroSaathi.git
cd NeuroSaathi
```

### 2. Configure API Keys
Copy the sample config file to `config.js`:
```bash
cp config.example.js config.js
```

Open `config.js` in your editor and enter your Gemini API key:
```javascript
window.NS_CONFIG = {
  // Get a free key at: https://aistudio.google.com/app/apikey
  GEMINI_API_KEY: 'YOUR_GEMINI_API_KEY_HERE',

  // ASR Language tag (e.g., 'en-IN', 'hi-IN', 'bn-IN', 'as-IN')
  ASR_LANGUAGE: 'en-US',
};
```
*(Note: `config.js` is included in `.gitignore` to prevent leaking private keys.)*

### 3. Run Locally
Because webcam access and face model weights require HTTP/HTTPS (not `file://`), serve the directory using any static web server:

**Using Python:**
```bash
python3 -m http.server 8000
```

**Using Node.js (`serve` or `http-server`):**
```bash
npx serve .
```

Open your browser and navigate to:
```
http://localhost:8000
```

---

## 🎯 How to Use the Simulation

1. **Grant Permissions**: Allow camera and microphone access when prompted.
2. **Model Loading**: Wait for the neural network weights to initialize on the splash screen.
3. **Face Registration**: Add known family members or caregivers by capturing/uploading their face and relationship details.
4. **AR Visor Active**:
   - When a registered face enters the camera frame, their identity card and conversational reminders will appear on the HUD.
   - Start talking—ambient speech will be captured, displayed, and summarized upon concluding the encounter.

---

## 🏆 Smart India Hackathon Details

- **Problem ID**: SIH26003
- **Organization**: Ministry of Development of North Eastern Region (MDoNER)
- **Category**: Software / AI / Healthcare Assistive Tech
- **Target Beneficiaries**: Elderly individuals suffering from mild to moderate Alzheimer's and Dementia, their families, and local healthcare workers in the North Eastern Region.

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details (or open source for SIH evaluation).
