"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import VantaRingsBackground from "../components/VantaRingsBackground";

const ease = [0.22, 1, 0.36, 1] as const;

const reveal = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.75, ease } },
};

function Wordmark() {
  return (
    <a href="#top" className="font-serif text-2xl tracking-[-0.04em] text-stone-50" aria-label="Anchor home">
      Anchor<span className="text-gold">.</span>
    </a>
  );
}

function StudentIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className="h-8 w-8">
      <path d="M14 21.5 32 13l18 8.5L32 30l-18-8.5Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M21 26v11c0 4 5 8 11 8s11-4 11-8V26M50 22v15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function TeacherIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className="h-8 w-8">
      <path d="M13 48V34M25 48V25M37 48V31M49 48V16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="m12 25 12-8 12 4 14-12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function QuizIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className="h-8 w-8">
      <path d="M18 11h28a6 6 0 0 1 6 6v30a6 6 0 0 1-6 6H18a6 6 0 0 1-6-6V17a6 6 0 0 1 6-6Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="m21 27 4 4 8-9M21 43h10M38 27h7M38 43h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PodcastIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className="h-8 w-8">
      <rect x="22" y="9" width="20" height="34" rx="10" stroke="currentColor" strokeWidth="1.8" />
      <path d="M15 31a17 17 0 0 0 34 0M32 48v8M24 56h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function VoiceIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className="h-8 w-8">
      <path d="M13 37h8l11 9V18l-11 9h-8v10Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M41 25c4 4 4 10 0 14M47 19c8 7 8 19 0 26" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function LockedInMascot() {
  return (
    <svg
      viewBox="0 0 180 180"
      role="img"
      aria-label="Calm golden mascot sitting cross-legged"
      className="locked-in-mascot"
    >
      <defs>
        <linearGradient id="mascotGold" x1="38" y1="25" x2="142" y2="158" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFD85A" />
          <stop offset="0.55" stopColor="#E9AA2F" />
          <stop offset="1" stopColor="#C98218" />
        </linearGradient>
        <filter id="mascotGlow" x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#E0A94A" floodOpacity="0.2" />
        </filter>
      </defs>
      <g filter="url(#mascotGlow)" stroke="#8B5A18" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <path fill="url(#mascotGold)" d="M65 42c-8-4-9-17-1-24 6-5 14-4 19 1 5-7 18-8 25-1 8-4 18 0 21 8 4 9-2 18-9 21-3 18-15 29-30 29S63 64 61 48c-7-1-12-8-11-15 1-8 8-13 15-12" />
        <path fill="#F3BC38" d="M62 69c-16 6-25 20-25 39 0 17 6 28 17 37l72 1c12-11 18-24 17-40-1-18-10-32-25-38-4 12-14 20-28 20S67 80 62 69Z" />
        <path fill="#E9A72A" d="M55 139c-15 2-27 10-31 22 12 6 28 6 45 1 12 4 30 4 42 0 17 5 33 5 45-1-4-12-16-20-31-22-18 8-52 8-70 0Z" />
        <path fill="none" d="M68 73c0 20-1 31-6 45 14-2 26 0 34 7M112 72c0 19 3 31 8 44-12-1-23 1-30 8" />
        <path fill="#F7C948" d="M49 89c-10 7-11 25-3 35 8 10 22 14 37 14l8-13-21-7 10-7c-10-7-22-12-31-22Z" />
        <path fill="#F7C948" d="M131 88c10 7 12 25 4 35-8 10-22 14-38 14l-8-12 21-8-10-7c10-7 22-12 31-22Z" />
        <path fill="#F3BA33" d="M82 118c4-3 9-2 12 2 4-4 9-4 13-1-2 8-7 13-14 13-6 0-10-5-11-14Z" />
        <path fill="none" d="M75 43c4 3 8 3 12 0M101 43c4 3 8 3 12 0M86 54c3 3 7 3 10 0" />
      </g>
    </svg>
  );
}

export default function Home() {
  const reduceMotion = useReducedMotion();
  const initial = reduceMotion ? "visible" : "hidden";

  return (
    <main id="top" className="relative overflow-hidden">
      <VantaRingsBackground />

      <motion.nav
        initial={initial}
        animate="visible"
        variants={reveal}
        className="site-nav relative z-20 mx-auto mt-3 flex max-w-7xl items-center justify-between px-5 py-4 md:px-7"
      >
        <Wordmark />
        <div className="flex items-center gap-4 sm:gap-8">
          <a href="#study-your-way" className="hidden text-sm text-stone-300 transition-colors hover:text-white md:block">Study Your Way</a>
          <Link href="/student" className="hidden text-sm text-stone-300 transition-colors hover:text-white sm:block">For Students</Link>
          <Link href="/teacher" className="hidden text-sm text-stone-300 transition-colors hover:text-white sm:block">For Teachers</Link>
          <a href="#demo" className="button button-primary text-sm">Try the Demo</a>
        </div>
      </motion.nav>

      <section className="relative z-10 mx-auto flex min-h-[calc(100svh-84px)] max-w-6xl flex-col items-center justify-center px-6 pb-28 pt-12 text-center md:pb-32 md:pt-14">
        <motion.div className="hero-copy" initial={initial} animate="visible" variants={{ visible: { transition: { staggerChildren: 0.11, delayChildren: 0.15 } } }}>
          <motion.p variants={reveal} className="mb-7 text-[0.68rem] font-semibold tracking-[0.26em] text-gold/90 sm:text-xs">
            BUILT BY A STUDENT. FOR STUDENTS.
          </motion.p>
          <h1 className="font-serif text-[clamp(3.35rem,8.5vw,7.75rem)] font-medium leading-[0.88] tracking-[-0.055em] text-stone-50">
            <motion.span variants={reveal} className="block">You zoned out.</motion.span>
            <motion.span variants={reveal} className="mt-[0.13em] block">Anchor didn&apos;t.</motion.span>
            <motion.span variants={reveal} className="hero-gold mt-[0.13em] block text-gold">Catch up in seconds.</motion.span>
          </h1>
          <motion.p variants={reveal} className="mx-auto mt-8 max-w-2xl text-base leading-7 text-stone-400 md:text-lg md:leading-8">
            A rolling on-device buffer turns the last few minutes into an instant recap—your lecture audio never leaves your phone.
          </motion.p>
          <motion.div variants={reveal} className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a href="#how-it-works" className="button button-secondary w-full sm:w-auto">See How It Works <span aria-hidden="true">↓</span></a>
            <a href="#demo" className="button button-primary w-full sm:w-auto">Try the Demo <span aria-hidden="true">→</span></a>
          </motion.div>
        </motion.div>
      </section>

      <section id="demo" className="section-shell relative z-10 pt-4 md:pt-8">
        <motion.div
          initial={initial}
          whileInView="visible"
          viewport={{ once: true, amount: 0.35 }}
          variants={reveal}
          className="mb-10 flex flex-col gap-5 md:flex-row md:items-end md:justify-between"
        >
          <div>
            <p className="eyebrow">LIVE, ON YOUR DEVICE</p>
            <h2 className="section-title mt-5 max-w-3xl">
              A quiet signal that <span className="text-gold">keeps you present.</span>
            </h2>
          </div>
          <p className="max-w-md text-base leading-7 text-stone-400">
            Listening and posture cues stay visible without competing with the lecture.
          </p>
        </motion.div>

        <div className="grid gap-5 lg:grid-cols-2">
          <motion.article
            initial={initial}
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            variants={reveal}
            className="signal-card"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold tracking-[0.22em] text-gold">LISTENING</p>
                <h3 className="mt-3 font-serif text-3xl tracking-[-0.03em] text-stone-50">Lecture buffer active</h3>
              </div>
              <span className="status-pill"><span className="status-dot" />Live</span>
            </div>
            <div className="waveform" aria-label="Audio buffer visualization">
              {[18, 34, 52, 29, 66, 43, 76, 48, 61, 36, 55, 25, 46, 31, 20].map((height, index) => (
                <motion.span
                  key={index}
                  initial={{ height: 8 }}
                  whileInView={{ height }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.45, delay: index * 0.035, ease }}
                />
              ))}
            </div>
            <div className="mt-8 flex items-center justify-between border-t border-white/[0.08] pt-5 text-sm">
              <span className="text-stone-500">Rolling buffer</span>
              <span className="font-medium text-stone-200">02:47 / 03:00</span>
            </div>
          </motion.article>

          <motion.article
            initial={initial}
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            variants={{ ...reveal, visible: { ...reveal.visible, transition: { ...reveal.visible.transition, delay: 0.12 } } }}
            className="signal-card"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold tracking-[0.22em] text-gold">POSTURE</p>
                <h3 className="mt-3 font-serif text-3xl tracking-[-0.03em] text-stone-50">You&apos;re locked in</h3>
              </div>
              <span className="status-pill">On-device</span>
            </div>
            <div className="posture-visual" aria-hidden="true">
              <div className="mascot-stage">
                <LockedInMascot />
              </div>
              <div>
                <p className="font-medium text-stone-100">Steady posture</p>
                <p className="mt-2 max-w-xs text-sm leading-6 text-stone-500">Processed privately on your phone. Nothing visual is stored or shared.</p>
              </div>
            </div>
          </motion.article>
        </div>
      </section>

      <section id="study-your-way" className="section-shell relative z-10">
        <motion.div
          initial={initial}
          whileInView="visible"
          viewport={{ once: true, amount: 0.35 }}
          variants={reveal}
          className="max-w-4xl"
        >
          <p className="eyebrow">MORE THAN A RECAP</p>
          <h2 className="section-title mt-5">
            Learn it in the format that <span className="text-gold">makes it click.</span>
          </h2>
          <p className="mt-7 max-w-2xl text-base leading-7 text-stone-400 md:text-lg md:leading-8">
            Turn the same private, on-device lesson context into a quick knowledge check, a podcast-style explanation, or a voice you enjoy listening to.
          </p>
        </motion.div>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {[
            {
              label: "QUIZ ME",
              title: "Prove you got it",
              body: "Generate a short quiz from the lesson, answer one question at a time, and get a clear explanation whenever you miss one.",
              detail: "Questions adapt to what you need to review.",
              icon: <QuizIcon />,
            },
            {
              label: "PODCAST MODE",
              title: "Hear the big picture",
              body: "Transform dense class material into a natural back-and-forth conversation that connects the ideas and makes them easier to remember.",
              detail: "Perfect for the walk home or a study break.",
              icon: <PodcastIcon />,
            },
            {
              label: "VOICE CHOICE",
              title: "A voice you’ll remember",
              body: "Choose from expressive narrator styles—or authorized voices from participating creators and celebrities—to make every explanation more engaging.",
              detail: "Think iconic pop-star energy, always licensed and clearly labeled.",
              icon: <VoiceIcon />,
            },
          ].map((feature, index) => (
            <motion.article
              key={feature.label}
              initial={initial}
              whileInView="visible"
              viewport={{ once: true, amount: 0.2 }}
              variants={{ hidden: { opacity: 0, y: 26 }, visible: { opacity: 1, y: 0, transition: { duration: 0.7, delay: index * 0.1, ease } } }}
              className="learning-card"
            >
              <div className="icon-box">{feature.icon}</div>
              <p className="mt-9 text-xs font-semibold tracking-[0.22em] text-gold">{feature.label}</p>
              <h3 className="mt-4 font-serif text-3xl leading-tight tracking-[-0.035em] text-stone-50">{feature.title}</h3>
              <p className="mt-5 text-base leading-7 text-stone-400">{feature.body}</p>
              <p className="mt-auto border-t border-white/[0.08] pt-6 text-sm leading-6 text-stone-500">{feature.detail}</p>
            </motion.article>
          ))}
        </div>
      </section>

      <section id="teachers" className="section-shell relative z-10">
        <motion.h2 initial={initial} whileInView="visible" viewport={{ once: true, amount: 0.6 }} variants={reveal} className="section-title max-w-4xl">
          One button. Two sides of the <span className="text-gold">same moment.</span>
        </motion.h2>
        <div className="mt-12 grid gap-5 lg:grid-cols-2">
          {[
            { label: "FOR STUDENTS", title: "Catch Me Up button", body: "Instant recap of the last 3 minutes, generated entirely on your device. No audio ever leaves your phone.", icon: <StudentIcon /> },
            { label: "FOR TEACHERS", title: "Real-time dashboard", body: "See confusion spikes as they happen, not after the test. Only anonymous counts sync, never transcripts.", icon: <TeacherIcon /> },
          ].map((card, index) => (
            <motion.article key={card.label} initial={initial} whileInView="visible" viewport={{ once: true, amount: 0.25 }} variants={{ hidden: { opacity: 0, y: 28 }, visible: { opacity: 1, y: 0, transition: { duration: 0.75, delay: index * 0.12, ease } } }} className="portal-card group">
              <div className="icon-box">{card.icon}</div>
              <p className="mt-12 text-xs font-semibold tracking-[0.22em] text-gold">{card.label}</p>
              <h3 className="mt-4 font-serif text-4xl leading-[1.05] tracking-[-0.035em] text-stone-50 sm:text-5xl">{card.title}</h3>
              <p className="mt-5 max-w-xl text-base leading-7 text-stone-400 md:text-lg md:leading-8">{card.body}</p>
            </motion.article>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="section-shell relative z-10 pb-32 pt-28 md:pb-40 md:pt-36">
        <motion.p initial={initial} whileInView="visible" viewport={{ once: true }} variants={reveal} className="eyebrow">HOW IT WORKS</motion.p>
        <motion.h2 initial={initial} whileInView="visible" viewport={{ once: true }} variants={reveal} className="section-title mt-5">From lost to caught up.</motion.h2>
        <div className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.08] md:grid-cols-3">
          {[
            ["01", "Class starts", "The buffer runs silently and visibly."],
            ["02", "Lost the thread?", "Tap Catch Me Up."],
            ["03", "You’re back", "An instant plain-English recap appears."],
          ].map(([number, title, body], index) => (
            <motion.article key={number} initial={initial} whileInView="visible" viewport={{ once: true, amount: 0.3 }} variants={{ hidden: { opacity: 0, y: 18 }, visible: { opacity: 1, y: 0, transition: { duration: 0.65, delay: index * 0.13, ease } } }} className="bg-[#100d0a] p-8 md:min-h-64 md:p-10">
              <span className="font-serif text-lg text-gold">{number}</span>
              <h3 className="mt-14 font-serif text-3xl tracking-[-0.03em] text-stone-50">{title}</h3>
              <p className="mt-3 leading-7 text-stone-400">{body}</p>
            </motion.article>
          ))}
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/[0.08]">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-10 md:px-10 lg:flex-row lg:items-center lg:justify-between">
          <Wordmark />
          <p className="max-w-2xl text-sm leading-6 text-stone-500">
            Built by Nitin and Rishab—two creative 14-year-old problem solvers turning smart ideas into meaningful solutions.
          </p>
          <div className="flex gap-6 text-sm text-stone-300">
            <a href="#" className="hover:text-gold">GitHub repo</a>
            <a href="#" className="hover:text-gold">Devpost</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
