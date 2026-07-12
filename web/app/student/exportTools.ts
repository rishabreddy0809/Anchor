export function downloadMarkdown(transcript: readonly (readonly [string, string, string])[]) {
  const body = [
    "# Cellular Respiration & ATP", "", "**Class:** AP Biology", "**Instructor:** Professor Rivera", "",
    "## Summary", "Cellular respiration transfers energy from glucose into ATP. Glycolysis begins in the cytoplasm, while later stages occur inside mitochondria.", "",
    "## Key takeaways", "- Glycolysis nets 2 ATP and creates two pyruvate molecules.", "- NADH and FADH₂ transport high-energy electrons.", "- Oxygen acts as the final electron acceptor.", "",
    "## Homework", "- [ ] Complete questions 12–18 — Thursday, 8 PM", "- [ ] Submit lab hypothesis — Thursday, 8 PM", "- [ ] Review ETC phrase for quiz — Friday", "", "## Transcript",
    ...transcript.map(([time, speaker, text]) => `- **${time} — ${speaker}:** ${text}`),
  ].join("\n");
  download(new Blob([body], { type: "text/markdown;charset=utf-8" }), "cellular-respiration-notes.md");
}

export async function shareLecture() {
  const data = { title: "Cellular Respiration & ATP", text: "My Anchor lecture notes for AP Biology", url: location.href };
  try {
    if (navigator.share) await navigator.share(data);
    else await navigator.clipboard?.writeText(location.href);
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) throw error;
  }
}

export function addCalendar(title: string) {
  const start = nextWeekday(title.includes("quiz") ? 5 : 4); start.setHours(20, 0, 0, 0);
  const end = new Date(start.getTime() + 30 * 60_000);
  const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nDTSTART:${stamp(start)}\r\nDTEND:${stamp(end)}\r\nSUMMARY:${title}\r\nDESCRIPTION:Detected by Anchor during AP Biology\r\nEND:VEVENT\r\nEND:VCALENDAR`;
  download(new Blob([ics], { type: "text/calendar" }), `${title.toLowerCase().replace(/\W+/g, "-")}.ics`);
}

function nextWeekday(day: number) {
  const date = new Date();
  let offset = (day - date.getDay() + 7) % 7;
  if (offset === 0) offset = 7;
  date.setDate(date.getDate() + offset);
  return date;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
}
