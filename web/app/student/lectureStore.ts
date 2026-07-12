export type SavedLecture = {
  id: string;
  title: string;
  className: string;
  createdAt: string;
  duration: number;
  transcript: readonly (readonly [string, string, string])[];
};

const DATABASE = "anchor-student";
const STORE = "recordings";

export function saveLectureMetadata(lecture: SavedLecture) {
  const current = readLectures().filter((item) => item.id !== lecture.id);
  localStorage.setItem("anchor-lectures", JSON.stringify([lecture, ...current].slice(0, 30)));
}

export function readLectures(): SavedLecture[] {
  try {
    return JSON.parse(localStorage.getItem("anchor-lectures") ?? "[]") as SavedLecture[];
  } catch {
    return [];
  }
}

export async function saveRecording(id: string, blob: Blob) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put(blob, id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function getRecording(id: string) {
  const database = await openDatabase();
  const blob = await new Promise<Blob | undefined>((resolve, reject) => {
    const request = database.transaction(STORE, "readonly").objectStore(STORE).get(id);
    request.onsuccess = () => resolve(request.result as Blob | undefined);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return blob;
}

export async function downloadRecording(id: string) {
  const blob = await getRecording(id);
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "cellular-respiration-lecture.webm";
  anchor.click();
  URL.revokeObjectURL(url);
  return true;
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
