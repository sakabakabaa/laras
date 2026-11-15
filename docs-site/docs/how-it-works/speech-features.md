---
title: Speech features
description: Conversation practice, speech synthesis (Hostinger, ElevenLabs) and speech-to-text (self-hosted Whisper sidecar, hosted providers) in LARAS.
sidebar_position: 4
---

# Speech features

LARAS includes spoken-language practice and assistance. These features are **learning tools**, not official assessment: they never produce assignment grades.

## Conversation practice

Conversation practice (*percakapan*) is a turn-based speaking exercise:

- The student speaks; the recording is **transcribed** to text.
- The platform generates a **model reply** and continues the conversation.
- Replies are read aloud with **speech synthesis**.
- The conversation is limited to a fixed number of turns; a reflection is saved to the student's profile for review.

Voice-activity detection runs in the browser. The pipeline is a sequence of HTTP turns — not a continuous realtime socket — which keeps it reliable on modest connections.

```mermaid
flowchart LR
  REC["Student speaks"] --> VAD["Voice activity detection (browser)"]
  VAD --> STT["Transcription:<br/>Whisper sidecar or hosted STT"]
  STT --> MODEL["Model reply"]
  MODEL --> TTS["Speech synthesis:<br/>Hostinger or ElevenLabs"]
  TTS --> PLAY["Played to the student"]
  PLAY -->|"next turn (fixed limit)"| REC
  STT -.->|"turn transcript"| REF["Reflection saved<br/>to the student profile"]

## Speech-to-text

| Aspect | Detail |
|---|---|
| Self-hosted option | A Whisper sidecar container used with priority for library audio |
| Hosted fallback | A hosted transcription endpoint (`whisper-1` by default) |
| Where used | Conversation practice and audio submissions |

Transcription output is treated as **evidence** — and one explicit rule follows from that: AI evaluation feedback **never judges pronunciation, intonation or fluency from a transcript**, because a transcript does not contain that information.

## Speech synthesis

| Provider | Status |
|---|---|
| Hostinger TTS | Default voice synthesis provider |
| ElevenLabs | Optional alternative, selected by deployment configuration |

Provider choice is a deployment-level configuration; the docs site does not track which provider any particular deployment currently uses.
