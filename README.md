# VigilanceEAR

### AI-Powered Driver Drowsiness & Fatigue Detection System

🌐 Live Website: https://vigilanceear.ai.studio

💻 Source Code: https://github.com/panchakshari19gj-pixel/VigilanceEAR


**VigilanceEAR** is an intelligent driver monitoring application designed to detect signs of driver drowsiness, fatigue, and reduced alertness in real time. It uses computer vision and facial landmark analysis to monitor eye movements, mouth movements, and head posture, helping identify potentially dangerous fatigue-related behaviour.

The system uses **MediaPipe Face Landmarker** to extract facial landmarks and calculate important monitoring parameters, including Eye Aspect Ratio (EAR), Mouth Aspect Ratio (MAR), and head-pose measurements. These parameters are analysed over time to identify prolonged eye closure, microsleep-like events, excessive yawning, head nodding, and elevated fatigue indicators.

## Key Features

- **Real-Time Driver Monitoring:** Monitor driver alertness using a webcam-based facial analysis interface.
- **Facial Landmark Detection:** Uses MediaPipe Face Landmarker to analyse facial features and eye movements.
- **Eye Aspect Ratio (EAR):** Measures eye openness and detects prolonged eye closure.
- **Mouth Aspect Ratio (MAR):** Analyses mouth opening to identify possible yawning events.
- **Microsleep Detection:** Identifies extended eye-closure events based on configurable thresholds.
- **Head-Pose Monitoring:** Tracks head pitch and yaw to identify possible fatigue-related head movements.
- **PERCLOS Analysis:** Calculates the percentage of time the eyes remain closed over a configurable observation window.
- **Audio Alerts:** Provides configurable audio warnings for detected fatigue events.
- **Live Telemetry Dashboard:** Displays eye measurements, facial monitoring values, blink information, and system status.
- **EAR Waveform Analytics:** Visualises changes in eye aspect ratio over time.
- **Monitoring Sessions:** Starts and ends monitoring sessions and stores session statistics.
- **Event Logging:** Records fatigue warnings, microsleep alerts, yawning events, head nods, and monitoring session events.
- **Driver Profiles:** Supports driver information and individual baseline configurations.
- **Calibration Settings:** Allows adjustment of EAR, MAR, closure duration, PERCLOS, head-pitch, and alert settings.
- **Sample Simulation:** Provides sample driver images and monitoring scenarios for testing without a live webcam.
- **Analytics Dashboard:** Presents monitoring history, event statistics, and session-level fatigue information.

## Technology Stack

- **Frontend:** React 19, TypeScript, Vite
- **Computer Vision:** MediaPipe Tasks Vision
- **UI and Visualisation:** Tailwind CSS, Lucide React, Motion
- **Backend:** Node.js, Express.js
- **Data Storage:** JSON-based telemetry persistence
- **AI Integration Package:** Google GenAI SDK
- **Development Tools:** npm, Bun, TypeScript

## System Architecture

1. The camera or sample input provides driver images or video frames.
2. MediaPipe Face Landmarker detects facial landmarks.
3. The application extracts facial measurements and calculates EAR, MAR, and head-pose indicators.
4. Monitoring logic evaluates these measurements against configurable thresholds and time windows.
5. Detected events are displayed on the monitoring dashboard.
6. Audio alerts notify the user when configured fatigue conditions are detected.
7. Session statistics, calibration settings, driver profiles, and event logs are managed through the backend.

## Project Objective

The primary objective of VigilanceEAR is to demonstrate how computer vision and real-time facial behaviour analysis can support driver safety by identifying early indicators of fatigue and drowsiness.

The project is intended as a prototype and development platform for intelligent driver monitoring systems. It is not a replacement for certified vehicle safety equipment or professional driver-safety procedures.

## Future Development Possibilities

- Improved fatigue classification using trained machine-learning models.
- Enhanced low-light and night-time facial monitoring.
- Integration with vehicle telematics and embedded hardware.
- Mobile and edge-device deployment.
- Advanced driver behaviour analysis.
- Automated monitoring reports and notifications.

**VigilanceEAR — Monitoring Alertness. Supporting Safer Driving.**
