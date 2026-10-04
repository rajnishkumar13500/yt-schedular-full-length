import fs from "fs";
import path from "path";

export interface YouTubeUploadRecord {
  ipoSlug: string;
  companyName: string;
  youtubeVideoId: string;
  youtubeUrl: string;
  publishedAt: string;
  scheduledFor?: string;
  privacyStatus: string;
  title: string;
  pinnedCommentId?: string;
}

export interface YouTubeTrackerStore {
  version: number;
  lastUpdated: string;
  history: YouTubeUploadRecord[];
}

const TRACKER_PATH = path.resolve(__dirname, "../data/uploaded_youtube.json");
const MAX_HISTORY = 50;

export function loadYouTubeTracker(): YouTubeTrackerStore {
  if (!fs.existsSync(TRACKER_PATH)) {
    const initial: YouTubeTrackerStore = {
      version: 1,
      lastUpdated: new Date().toISOString(),
      history: [],
    };
    fs.mkdirSync(path.dirname(TRACKER_PATH), { recursive: true });
    fs.writeFileSync(TRACKER_PATH, JSON.stringify(initial, null, 2), "utf-8");
    return initial;
  }
  const raw = fs.readFileSync(TRACKER_PATH, "utf-8");
  return JSON.parse(raw) as YouTubeTrackerStore;
}

export function saveYouTubeTracker(store: YouTubeTrackerStore): void {
  store.lastUpdated = new Date().toISOString();
  if (store.history.length > MAX_HISTORY) {
    store.history = store.history.slice(0, MAX_HISTORY);
  }
  fs.mkdirSync(path.dirname(TRACKER_PATH), { recursive: true });
  fs.writeFileSync(TRACKER_PATH, JSON.stringify(store, null, 2), "utf-8");
}

export function isIPOAlreadyOnYouTube(ipoSlugOrName: string): boolean {
  const store = loadYouTubeTracker();
  const normalized = ipoSlugOrName.toLowerCase().replace(/[^a-z0-9]/g, "");
  return store.history.some((item) => {
    const itemSlugNorm = item.ipoSlug.toLowerCase().replace(/[^a-z0-9]/g, "");
    const itemNameNorm = item.companyName.toLowerCase().replace(/[^a-z0-9]/g, "");
    return (
      itemSlugNorm === normalized ||
      itemNameNorm === normalized ||
      normalized.includes(itemSlugNorm) ||
      normalized.includes(itemNameNorm)
    );
  });
}

export function recordYouTubeUpload(entry: YouTubeUploadRecord): void {
  const store = loadYouTubeTracker();
  const existingIdx = store.history.findIndex(
    (h) => h.ipoSlug.toLowerCase() === entry.ipoSlug.toLowerCase()
  );
  if (existingIdx >= 0) {
    store.history[existingIdx] = entry;
  } else {
    store.history.unshift(entry);
  }
  if (store.history.length > MAX_HISTORY) {
    store.history = store.history.slice(0, MAX_HISTORY);
  }
  saveYouTubeTracker(store);
}
