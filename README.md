# Kumpas WIKA

Real-time sign language translator and live subtitle studio. It runs entirely in the browser. MediaPipe Hand + Pose Landmarker track your hand from the webcam, and a hybrid static + dynamic classifier reads FSL / ASL signs. A gloss-to-sentence engine then turns them into natural Filipino and English subtitles: **AKO · KAILANGAN · TULONG → "Kailangan ko ng tulong." / "I need help."**

## Features

- **Live webcam tracking:** a mirrored HD feed with a 21-point hand skeleton, fingertip trails and shoulder/arm lines. The overlay redraws every display frame, with landmarks smoothly interpolated between inference frames.
- **Off-main-thread inference:** MediaPipe runs in a module Web Worker on 640-px frames, one frame in flight at a time, at up to about 30 Hz. It falls back to the main thread if the worker can't start.
  - The first inference compiles shaders and allocates buffers. That warm-up happens during loading, so the first live camera frames never stall.
  - At load, the GPU and CPU delegates are benchmarked and the faster one is kept.
- **48 signs:**
  - 22 word signs: Kumusta, Paalam, Salamat, Walang anuman, Oo, Hindi, Pakiusap, Patawad, Tulong, Mahal kita, Magaling, Mali, Ako, Ikaw, Gusto, Kailangan, Saan, Ano, Tubig and Kain, plus the ASL citation forms of HELLO (salute) and NO (snap).
  - Full A–Z fingerspelling, including the motion letters J and Z. Consecutive letters merge into one word (Z·A·K·I → ZAKI).
- **FSL / ASL / FSL + ASL toggle:** switches which variants are recognized, the gloss labels and the Sign Guide.
- **Time-indexed motion window:** a 1.0 s sliding buffer keyed by timestamp, not frame count. Velocity, oscillation and displacement features work the same at 10–60 fps.
- **Anti-spam locking:**
  - Hold-to-lock takes 450 ms for motion signs and 600 ms for static ones.
  - A held sign never repeats.
  - The same sign can only lock again after a hand reset (the hand drops out of view or goes neutral) or a 1.8 s cooldown.
  - A velocity gate stops static letters (e.g. a stray "B") from locking while the hand is still moving into a motion sign.
- **Gloss → natural sentence:** the live preview updates as each sign locks. After a 2 s pause the phrase is finalized and punctuated in Filipino and English, then read aloud as one sentence (Read aloud toggle). Raw gloss pills are shown above the sentence.
- **Sign Guide:** a line-art hand diagram for every sign (drawn from the same hand model the recognizer is tested against), with motion arrows, plain-language steps and a Filipino cue.
- **Studio toolbar:** subtitle language, a confidence calibration slider, and a hand alignment and lighting hint.
- **Demo Mode (No Camera):** synthesized joint-angle hand trajectories sign whole phrases through the same classifier.

## Develop

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # type-check + production build to dist/
npm run lint      # oxlint
npm run verify    # offline test suite (see below)
```

Webcam access requires `localhost` or HTTPS.

`npm run verify` checks, without a browser:
- every synthetic handshape (left and right hand, ±12° tilt, two sizes);
- every one of the 48 signs, performed once by the simulator, locks exactly once and in order at 10, 15, 24, 30 and 60 fps;
- the showcase phrases group into the right sentences under the 2 s pause rule;
- the anti-spam and velocity-gate scenarios;
- 23 gloss → sentence grammar cases.

## Deploy to Vercel

1. Push this repository to GitHub.
2. In Vercel, choose **Add New → Project** and import the repo. The Vite preset is detected automatically (build: `npm run build`, output: `dist`).
3. Deploy. No environment variables are needed.

Model files load at runtime from Google's hosted `mediapipe-models` bucket. The WASM runtime loads from jsDelivr, pinned to the installed `@mediapipe/tasks-vision` version.

## How it works

| Stage | File |
| --- | --- |
| Worker inference client + main-thread fallback | `src/lib/inference.ts`, `src/lib/inference.worker.ts` |
| Model loading, delegate benchmark, monotonic timestamps | `src/lib/mediapipe.ts` |
| Hand-local geometry + handshape classifier (A–Z, ILY, pointing, thumbs) | `src/lib/handshape.ts` |
| Time-indexed window, dynamic/static rules, gates, lock/cooldown | `src/lib/engine.ts` |
| Gloss → Filipino/English sentence grammar | `src/lib/grammar.ts` |
| Sign dictionary, FSL/ASL variants, step-by-step guide | `src/lib/signs.ts` |
| Demo landmark simulator | `src/lib/demo.ts` |
| Render loop, overlay, alignment hints | `src/hooks/useDetectionLoop.ts`, `src/lib/draw.ts` |
| Phrase buffer, sentence finalization, speech | `src/hooks/useSubtitles.ts` |

## Limitations

- **Rule-based classifier:** it uses hand-tuned rules, not a trained model. Thresholds are validated against the simulator, not a corpus of real signers, so expect to tune them (or the confidence slider) for your camera and lighting.
- **Least reliable letters:** E, M, N, S and T differ mainly in thumb placement and are the hardest to tell apart from a single webcam.
- **Simplified signs:** word signs are one-handed approximations of FSL/ASL citation forms, not a complete dictionary. Location-dependent signs (TUBIG and KAIN at the chin) need the hand clearly at face height.
- **Small grammar:** the sentence engine covers the supported vocabulary. Unknown combinations fall back to a readable gloss.
