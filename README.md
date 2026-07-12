# Anchor

**You zoned out. Anchor didn't.**

Anchor is a two-sided classroom tool built around a simple moment: a student gets lost in a lecture, doesn't want to raise their hand and admit it, and falls further behind for the rest of class. Anchor catches that moment instead of letting it slide.

Built solo by a 14-year-old high school student for [VSHacks / hackathon name].

---

## The Problem

Every student has had the experience of tuning out for a few minutes and losing the thread — and every student has also been too embarrassed to say "wait, can you go back" in front of the whole class. Teachers, meanwhile, have no real-time signal for when that's happening. By the time it shows up on a test, it's too late to do anything about it.

## How It Works

**For students:**
- Join a live class session with a short code from the teacher
- Lost the thread? Tap **Catch Me Up**
- Get an instant, plain-English recap of the last few minutes — generated live, no waiting

**For teachers:**
- Start a session, get a shareable code
- Run live transcription of the lecture in the background
- Watch a real-time dashboard: how many students are lost *right now*, and a rolling chart of confusion spikes over the last 15 minutes
- No more waiting for a test to find out a concept didn't land

**Privacy, by design:**
- Recording is never secret — the class always knows a session is active, shown with a persistent visible indicator
- Only an anonymous timestamp syncs to the backend when a student taps Catch Me Up — never audio, never transcript text, never an identity
- The full lecture transcript only ever exists to generate that one student's recap in the moment; it isn't logged or stored beyond the rolling buffer

## Tech Stack

- **Frontend:** Next.js, TypeScript, Tailwind CSS, Framer Motion
- **Backend / real-time sync:** Firebase (Firestore)
- **AI:** Google Gemini API — live audio transcription and plain-English recap generation *(confirm this against final build — earlier version used the browser's native Web Speech API as a no-cost fallback; update this line to match whichever actually shipped)*
- **Deployment:** Vercel

## Architecture

```
Teacher Dashboard (/teacher)
  → captures lecture audio
  → transcribes on a rolling 3-minute buffer
  → writes buffer to sessions/{code} in Firestore
  → listens live to sessions/{code}/pings for the confusion count + chart

Student Page (/student/[code])
  → reads sessions/{code}'s live transcript on demand
  → "Catch Me Up" generates a plain-English recap from that transcript
  → writes one anonymous timestamped ping to sessions/{code}/pings
```

## Getting Started

```bash
git clone [repo-url]
cd anchor/web
npm install
```

Add a `.env.local` file with:
```
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
GEMINI_API_KEY=...
```

```bash
npm run dev
```

Open `/teacher` to start a session, `/student` to join one with the generated code.

## What's Next

- **Peer Nodes:** group students who are stuck on the *same specific concept* (not just "confused" generally) and surface a one-click link to a small peer study room
- Native iOS version using Apple's on-device FoundationModels, so recap generation never leaves the device at all
- Multi-language transcription support

## Built By

Rishab, age 14 — solo build, [hackathon name], [date].
