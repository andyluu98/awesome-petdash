/**
 * Claude Code subscription quota fetcher.
 * Reads the OAuth access token from ~/.claude/.credentials.json, then calls
 * Anthropic's /api/oauth/usage endpoint. Falls back to the CK usage cache
 * written by the Claude Code CLI at os.tmpdir()/ck-usage-limits-cache.json.
 */

import { readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

// ----- Types -----------------------------------------------------------------

export interface QuotaBucket {
  readonly usedPct: number;
  readonly remainingPct: number;
  readonly resetsAt: string;
}

export interface QuotaSnapshot {
  readonly fiveHour: QuotaBucket | null;
  readonly sevenDay: QuotaBucket | null;
  /** Where the data came from */
  readonly source: "api" | "cache";
  /** True when the cache was used and is older than 10 minutes */
  readonly stale: boolean;
}

// Raw shape returned by the API and the cache's `data` field
interface RawUsageResponse {
  five_hour?: RawBucket | null;
  seven_day?: RawBucket | null;
  seven_day_sonnet?: RawBucket | null;
}

interface RawBucket {
  utilization: number;
  resets_at: string;
}

// Shape of the CK usage-limits cache file
interface CkCacheFile {
  timestamp?: number;
  status?: "available" | "unavailable";
  data?: RawUsageResponse;
}

// ----- Token reader ----------------------------------------------------------

/** Read the OAuth access token from ~/.claude/.credentials.json. Returns null on any error. */
export function readOAuthToken(): string | null {
  try {
    const credPath = join(homedir(), ".claude", ".credentials.json");
    const raw = readFileSync(credPath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const oauth = parsed["claudeAiOauth"] as Record<string, unknown> | undefined;
    const token = oauth?.["accessToken"];
    return typeof token === "string" && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

// ----- API fetch -------------------------------------------------------------

const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const CACHE_STALE_MS = 10 * 60 * 1000; // 10 minutes

/** Convert a raw API bucket to our typed bucket. Returns null if the raw value is absent/null. */
function normalizeBucket(raw: RawBucket | null | undefined): QuotaBucket | null {
  if (!raw || typeof raw.utilization !== "number") return null;
  const usedPct = Math.max(0, Math.min(100, raw.utilization));
  return { usedPct, remainingPct: 100 - usedPct, resetsAt: raw.resets_at ?? "" };
}

/** Build a QuotaSnapshot from a raw API/cache response object. */
function buildSnapshot(raw: RawUsageResponse, source: "api" | "cache", stale: boolean): QuotaSnapshot {
  return {
    // Prefer the non-model-specific seven_day bucket; fall back to seven_day_sonnet
    fiveHour: normalizeBucket(raw.five_hour),
    sevenDay: normalizeBucket(raw.seven_day ?? raw.seven_day_sonnet),
    source,
    stale,
  };
}

/**
 * Attempt to fetch quota from the Anthropic API.
 * Returns null if the token is missing, the request fails, or the response is malformed.
 */
async function fetchFromApi(): Promise<QuotaSnapshot | null> {
  const token = readOAuthToken();
  if (!token) return null;

  try {
    const response = await fetch(USAGE_URL, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "anthropic-beta": "oauth-2025-04-20",
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) return null;

    const json = await response.json() as RawUsageResponse;
    return buildSnapshot(json, "api", false);
  } catch {
    return null;
  }
}

/**
 * Attempt to read quota from the CK usage-limits cache file.
 * Returns null if the file is missing, unreadable, or has status !== "available".
 */
function fetchFromCache(): QuotaSnapshot | null {
  try {
    const cachePath = join(tmpdir(), "ck-usage-limits-cache.json");
    const raw = readFileSync(cachePath, "utf-8");
    const cache = JSON.parse(raw) as CkCacheFile;

    if (cache.status !== "available" || !cache.data) return null;

    const age = typeof cache.timestamp === "number" ? Date.now() - cache.timestamp : Infinity;
    const stale = age > CACHE_STALE_MS;
    return buildSnapshot(cache.data, "cache", stale);
  } catch {
    return null;
  }
}

/**
 * Fetch the current Claude Code quota.
 * Tries the live API first; falls back to the local CK cache.
 * Returns null if neither source is available — callers must handle this gracefully.
 */
export async function fetchClaudeQuota(): Promise<QuotaSnapshot | null> {
  const fromApi = await fetchFromApi();
  if (fromApi) return fromApi;
  return fetchFromCache();
}
