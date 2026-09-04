# Wardly

A web chat that runs **pre-visit clinical intake** and produces a **clinician-facing brief** with:

- **Patient demographics** - name (optional), age, and sex/gender captured up-front; rendered as a chip in the brief panel and as the standard one-liner lead in the HPI ("Patient is a 34-year-old female presenting with…")
- **CC** - chief complaint
- **HPI** - history of present illness (narrative from the gathered fields)
- **ROS** - review of systems (grouped by system with positives/negatives as elicited)
- **Live brief** - CC / HPI / ROS panels **update as you chat** (before intake completes)
- **Clinical insights** - rule-based urgency, differentials, and workup reminders (after chief complaint is captured)
- **Voice input** - Web Speech API: mic asks for **microphone permission** first; **Stop** ends recognition; language via `VITE_SPEECH_LANG` or browser locale
- **Gemini (optional)** - when `VITE_GEMINI_API_KEY` is set (free tier via [Google AI Studio](https://aistudio.google.com/)), the **Insights** tab auto-generates a supplementary AI bullet list once the brief is complete (with a manual *Regenerate* control)
- **Export** - copy the full brief to clipboard or download it as a `.txt` file from the right panel footer

### Environment variables

Copy [.env.example](.env.example) to `.env` (not committed):

| Variable | Purpose |
|----------|---------|
| `VITE_GEMINI_API_KEY` | Enables optional Gemini bullet points in Insights (browser exposes this string-use only in trusted environments) |
| `VITE_GEMINI_MODEL` | Optional model id (default `gemini-1.5-flash`) |
| `VITE_SPEECH_LANG` | BCP-47 tag for speech recognition, e.g. `en-IN`, `hi-IN` (default: browser language) |

### If voice typing shows nothing

Use **Chrome or Edge** on desktop, **HTTPS or localhost**, and allow **microphone** when prompted. Recognition uses **continuous** capture with accumulated **final** transcripts. Chrome relies on **Google’s speech service**-a network error will block results. Set **`VITE_SPEECH_LANG`** if your accent/language differs from the browser default.

## Intake engine

The conversation flow, extraction, and brief generation are **deterministic** in TypeScript. The code is structured so you can **swap the extractor** for an LLM call (OpenAI, Anthropic, etc.) for richer parsing later.

> This is **not** medical device software and **not** for real clinical decisions.

## Quick start

```bash
npm install
npm run dev
```

Open the URL shown (e.g. `http://localhost:5173`).

**Production build**

```bash
npm run build
npm run preview   # optional, serve the built app
```

## Architecture (where to look)

| Path | Role |
|------|------|
| [src/intake/types.ts](src/intake/types.ts) | `IntakeStep`, HPI/ROS state, `ClinicalBrief`, `LiveBrief`, `IntakeSession` |
| [src/intake/extract.ts](src/intake/extract.ts) | Heuristic parsing + `inferChiefComplaintTheme`, ROS line setup |
| [src/intake/brief.ts](src/intake/brief.ts) | Renders HPI paragraph + grouped ROS from state |
| [src/intake/liveBrief.ts](src/intake/liveBrief.ts) | Incremental `liveBrief` after each answered step |
| [src/intake/insights.ts](src/intake/insights.ts) | Rule-based clinical insights from `IntakeState` |
| [src/lib/gemini.ts](src/lib/gemini.ts) | Optional Gemini API helper for Insights panel |
| [src/intake/engine.ts](src/intake/engine.ts) | Question flow, session transitions, `submitUserMessage` |
| [src/App.tsx](src/App.tsx) | Chat UI, progress bar, brief panel, voice input |

```text
User reply → applyStepToState (extract) → buildLiveBrief → next step question → (at end) buildClinicalBrief
```

## Extending

- **LLM:** Replace or augment `applyStepToState` and/or add a `POST /extract` with JSON schema to fill `IntakeState`. Keep the same `ClinicalBrief` for stable UI.
- **Voice (telephony):** Twilio (or similar) in front of a small Node server that calls the same engine or LLM, streaming transcripts into `submitUserMessage`. The web UI uses the browser **Web Speech API** for optional speech-to-text.
- **EHR / FHIR:** Map `IntakeState` to `Condition`, `Observation`, and narrative `DocumentReference` in a follow-on iteration.
