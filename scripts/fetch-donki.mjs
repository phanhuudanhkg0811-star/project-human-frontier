import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const OUT_JSON = path.join(ROOT, 'src', 'data', 'donki-space-weather.json');
const OUT_LOG = path.join(ROOT, 'local-docs', 'donki-fetch-log.json');

const WINDOWS = [
  {
    id: 'may-2024-xstorm',
    name: 'AR3664 Extreme Solar Storm (May 2024)',
    description:
      'Historic May 2024 AR3664 eruption sequence with intense X-class flares, halo CMEs, and SEP shockwaves peaking mid-window.',
    startDate: '2024-04-26',
    endDate: '2024-05-27',
  },
  {
    id: 'oct-2024-x9storm',
    name: 'AR3842 X9.0 & October CME Cluster (Sep-Oct 2024)',
    description:
      'Strong late-Sep to Oct 2024 solar activity featuring X7.1/X9.0 flares and fast Earth/Moon-vicinity CMEs centered mid-campaign.',
    startDate: '2024-09-20',
    endDate: '2024-10-21',
  },
  {
    id: 'dec-2024-jan-2025-mixed',
    name: 'Year-End Moderate-to-Storm Window (Dec 2024-Jan 2025)',
    description:
      'Mixed moderate background activity punctuated by late-December/early-January X-class flares and CME shocks.',
    startDate: '2024-12-18',
    endDate: '2025-01-18',
  },
];

function loadApiKey() {
  if (!fs.existsSync(ENV_PATH)) {
    throw new Error(`Missing .env file at ${ENV_PATH}`);
  }
  const lines = fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const k = line.slice(0, eqIdx).trim();
    let v = line.slice(eqIdx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (k === 'NASA_API_KEY' && v.length > 0) {
      return v;
    }
  }
  throw new Error('NASA_API_KEY not found or empty in .env');
}

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function enumerateDates(startDate, count = 32) {
  const dates = [];
  for (let i = 0; i < count; i += 1) {
    dates.push(addDays(startDate, i));
  }
  return dates;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function redactUrl(urlStr, apiKey) {
  return urlStr.split(apiKey).join('REDACTED');
}

async function fetchJsonLogged(endpoint, params, apiKey, requestLogs, baseUrl = 'https://api.nasa.gov/DONKI') {
  const isNasaGateway = baseUrl.includes('api.nasa.gov');
  const qs = new URLSearchParams(isNasaGateway ? { ...params, api_key: apiKey } : params);
  const url = `${baseUrl}/${endpoint}?${qs.toString()}`;
  const redactedUrl = redactUrl(url, apiKey);
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  let status = 0;
  let count = 0;
  let error = null;
  let data = [];
  let rawSha256 = null;

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(45000),
    });
    status = res.status;
    const text = await res.text();
    if (!res.ok) {
      error = `HTTP ${res.status}: ${text.slice(0, 200)}`;
    } else if (text.trim().length > 0) {
      rawSha256 = sha256Hex(text);
      const parsed = JSON.parse(text);
      data = Array.isArray(parsed) ? parsed : [];
      count = data.length;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  requestLogs.push({
    timestampUtc: startedAt,
    endpoint,
    host: isNasaGateway ? 'api.nasa.gov' : 'ccmc.gsfc.nasa.gov',
    params: isNasaGateway ? { ...params, api_key: 'REDACTED' } : params,
    url: redactedUrl,
    httpStatus: status,
    durationMs: Date.now() - t0,
    recordCount: count,
    rawSha256,
    error,
  });

  if (error) {
    const err = new Error(`DONKI request failed (${redactedUrl}): ${error}`);
    err.httpStatus = status;
    throw err;
  }
  await sleep(250);
  return data;
}

async function fetchFlareWithFallback(startDate, midEnd, midStart, endDate, apiKey, requestLogs) {
  const fetchChunk = async (s, e) => {
    try {
      return await fetchJsonLogged('FLR', { startDate: s, endDate: e }, apiKey, requestLogs, 'https://api.nasa.gov/DONKI');
    } catch (err) {
      if (err.httpStatus === 404) {
        return await fetchJsonLogged('FLR', { startDate: s, endDate: e }, apiKey, requestLogs, 'https://ccmc.gsfc.nasa.gov/DONKI/WS/get');
      }
      throw err;
    }
  };
  const [a, b] = [await fetchChunk(startDate, midEnd), await fetchChunk(midStart, endDate)];
  const byId = new Map();
  for (const item of [...a, ...b]) {
    const key = item.flrID ?? `${item.beginTime}-${item.classType}`;
    if (!byId.has(key)) byId.set(key, item);
  }
  return [...byId.values()];
}

function parseFlareScore(classType) {
  if (typeof classType !== 'string' || classType.length === 0) return 0;
  const letter = classType[0].toUpperCase();
  const magnitude = Number.parseFloat(classType.slice(1)) || 1.0;
  const clampedMag = Math.min(20, Math.max(0.1, magnitude));
  if (letter === 'X') return Math.min(1, 0.45 + Math.log10(1 + clampedMag) * 0.45);
  if (letter === 'M') return Math.min(0.44, 0.16 + (clampedMag / 10) * 0.25);
  if (letter === 'C') return Math.min(0.14, 0.04 + (clampedMag / 10) * 0.08);
  return 0.02;
}

function pickHigherClass(a, b) {
  const rank = (cls) => {
    if (!cls) return 0;
    const weights = { X: 1000, M: 100, C: 10, B: 1, A: 0.1 };
    const w = weights[cls[0]?.toUpperCase()] ?? 0;
    const mag = Number.parseFloat(cls.slice(1)) || 0;
    return w * 100 + mag;
  };
  return rank(b) > rank(a) ? b : a;
}

function clamp01(v) {
  return Math.round(Math.min(1, Math.max(0, v)) * 10000) / 10000;
}

function classifyLevel(maxIndex) {
  if (maxIndex >= 0.72) return 'extreme';
  if (maxIndex >= 0.42) return 'storm';
  if (maxIndex >= 0.18) return 'moderate';
  return 'quiet';
}

function normalizeSample(meta, raw) {
  const dates = enumerateDates(meta.startDate, 32);
  const byDate = new Map(
    dates.map((date, idx) => [
      date,
      {
        sol: idx + 1,
        date,
        flares: { count: 0, maxClass: null, ids: [] },
        cme: { count: 0, maxSpeedKms: 0, maxHalfAngle: 0, earthDirectedCount: 0, ids: [] },
        sep: { count: 0, ids: [] },
        ips: { count: 0, ids: [] },
        notifications: { count: 0, types: [], headline: null },
        _flareScore: 0,
      },
    ])
  );

  for (const ev of raw.flr) {
    const day = (ev.beginTime || ev.peakTime || '').slice(0, 10);
    const bucket = byDate.get(day);
    if (!bucket) continue;
    bucket.flares.count += 1;
    bucket.flares.maxClass = pickHigherClass(bucket.flares.maxClass, ev.classType ?? null);
    bucket._flareScore = Math.max(bucket._flareScore, parseFlareScore(ev.classType));
    if (ev.flrID) bucket.flares.ids.push(ev.flrID);
  }

  for (const ev of raw.cme) {
    const day = (ev.startTime || '').slice(0, 10);
    const bucket = byDate.get(day);
    if (!bucket) continue;
    bucket.cme.count += 1;
    if (ev.activityID) bucket.cme.ids.push(ev.activityID);
    const analyses = Array.isArray(ev.cmeAnalyses) ? ev.cmeAnalyses : [];
    let isEarthSectorCme = false;
    for (const a of analyses) {
      if (typeof a.speed === 'number' && a.speed > bucket.cme.maxSpeedKms) {
        bucket.cme.maxSpeedKms = Math.round(a.speed);
      }
      if (typeof a.halfAngle === 'number' && a.halfAngle > bucket.cme.maxHalfAngle) {
        bucket.cme.maxHalfAngle = Math.round(a.halfAngle);
      }
      const enlilHit =
        Array.isArray(a.enlilList) &&
        a.enlilList.some(
          (e) =>
            e.isEarthGB === true ||
            (Array.isArray(e.impactList) &&
              e.impactList.some((im) => /earth|moon/i.test(String(im.location ?? ''))))
        );
      const coneHit =
        typeof a.longitude === 'number' &&
        typeof a.halfAngle === 'number' &&
        (a.halfAngle >= 45 || (Math.abs(a.longitude) <= 45 && a.halfAngle >= 25));
      if (a.isEarthGB === true || enlilHit || coneHit) {
        isEarthSectorCme = true;
      }
    }
    if (isEarthSectorCme) {
      bucket.cme.earthDirectedCount += 1;
    }
  }

  for (const ev of raw.sep) {
    const day = (ev.eventTime || '').slice(0, 10);
    const bucket = byDate.get(day);
    if (!bucket) continue;
    bucket.sep.count += 1;
    if (ev.sepID) bucket.sep.ids.push(ev.sepID);
  }

  for (const ev of raw.ips) {
    const day = (ev.eventTime || '').slice(0, 10);
    const bucket = byDate.get(day);
    if (!bucket) continue;
    bucket.ips.count += 1;
    if (ev.activityID) bucket.ips.ids.push(ev.activityID);
  }

  const seenMsgIds = new Set();
  for (const n of raw.notifications) {
    if (n.messageID && seenMsgIds.has(n.messageID)) continue;
    if (n.messageID) seenMsgIds.add(n.messageID);
    const day = (n.messageIssueTime || '').slice(0, 10);
    const bucket = byDate.get(day);
    if (!bucket) continue;
    bucket.notifications.count += 1;
    if (n.messageType && !bucket.notifications.types.includes(n.messageType)) {
      bucket.notifications.types.push(n.messageType);
    }
    if (!bucket.notifications.headline && typeof n.messageBody === 'string') {
      const firstLine = n.messageBody
        .split(/\r?\n/)
        .map((s) => s.trim())
        .find((s) => s.length > 0 && !s.startsWith('##')) ?? '';
      if (firstLine) {
        bucket.notifications.headline = firstLine.slice(0, 160);
      }
    }
  }

  const sols = [];
  for (const bucket of byDate.values()) {
    const cmeFastBonus =
      bucket.cme.maxSpeedKms >= 1500
        ? 0.28
        : bucket.cme.maxSpeedKms >= 900
          ? 0.16
          : bucket.cme.maxSpeedKms >= 500
            ? 0.08
            : 0;

    const radiationRiskIndex = clamp01(
      bucket._flareScore * 0.72 +
        Math.min(1, bucket.sep.count) * 0.48 +
        (bucket.sep.count > 1 ? 0.12 : 0) +
        cmeFastBonus * 0.65
    );

    const commsNoiseIndex = clamp01(
      bucket._flareScore * 0.68 +
        Math.min(3, bucket.cme.count) * 0.08 +
        cmeFastBonus * 0.55 +
        (bucket.cme.earthDirectedCount > 0 ? 0.1 : 0)
    );

    const hardwareStressIndex = clamp01(
      Math.min(2, bucket.ips.count) * 0.28 +
        Math.min(2, bucket.sep.count) * 0.25 +
        cmeFastBonus +
        bucket._flareScore * 0.3
    );

    const peakIndex = Math.max(radiationRiskIndex, commsNoiseIndex, hardwareStressIndex);
    const solarPenaltyPct =
      peakIndex >= 0.7 ? 0.18 : peakIndex >= 0.45 ? 0.1 : peakIndex >= 0.22 ? 0.04 : 0;

    sols.push({
      sol: bucket.sol,
      date: bucket.date,
      level: classifyLevel(peakIndex),
      radiationRiskIndex,
      commsNoiseIndex,
      hardwareStressIndex,
      solarPenaltyPct,
      flares: bucket.flares,
      cme: bucket.cme,
      sep: bucket.sep,
      ips: bucket.ips,
      notifications: bucket.notifications,
    });
  }

  const summary = {
    totalFlares: raw.flr.length,
    xClassFlares: raw.flr.filter((f) => String(f.classType || '').toUpperCase().startsWith('X')).length,
    mClassFlares: raw.flr.filter((f) => String(f.classType || '').toUpperCase().startsWith('M')).length,
    totalCmes: raw.cme.length,
    totalSeps: raw.sep.length,
    totalIps: raw.ips.length,
    totalNotifications: seenMsgIds.size,
    stormOrExtremeSols: sols.filter((s) => s.level === 'storm' || s.level === 'extreme').map((s) => s.sol),
  };

  return {
    id: meta.id,
    name: meta.name,
    description: meta.description,
    startDate: meta.startDate,
    endDate: meta.endDate,
    solCount: sols.length,
    provenance: 'observed',
    summary,
    sols,
  };
}

async function main() {
  const apiKey = loadApiKey();
  const requestLogs = [];
  const samples = [];

  for (const w of WINDOWS) {
    console.log(`Fetching DONKI window "${w.id}" (${w.startDate} .. ${w.endDate})...`);
    const midEnd = addDays(w.startDate, 15);
    const midStart = addDays(w.startDate, 16);

    const [flr, cme, sep, ips, notifA, notifB] = [
      await fetchFlareWithFallback(w.startDate, midEnd, midStart, w.endDate, apiKey, requestLogs),
      await fetchJsonLogged('CME', { startDate: w.startDate, endDate: w.endDate }, apiKey, requestLogs),
      await fetchJsonLogged('SEP', { startDate: w.startDate, endDate: w.endDate }, apiKey, requestLogs),
      await fetchJsonLogged('IPS', { startDate: w.startDate, endDate: w.endDate }, apiKey, requestLogs),
      await fetchJsonLogged(
        'notifications',
        { startDate: w.startDate, endDate: midEnd, type: 'all' },
        apiKey,
        requestLogs
      ),
      await fetchJsonLogged(
        'notifications',
        { startDate: midStart, endDate: w.endDate, type: 'all' },
        apiKey,
        requestLogs
      ),
    ];

    const normalized = normalizeSample(
      w,
      { flr, cme, sep, ips, notifications: [...notifA, ...notifB] }
    );
    samples.push(normalized);
    console.log(
      `  -> Flares=${normalized.summary.totalFlares} (X=${normalized.summary.xClassFlares}, M=${normalized.summary.mClassFlares}), CME=${normalized.summary.totalCmes}, SEP=${normalized.summary.totalSeps}, IPS=${normalized.summary.totalIps}, Notif=${normalized.summary.totalNotifications}, StormSols=[${normalized.summary.stormOrExtremeSols.join(',')}]`
    );
  }

  const successfulRequests = requestLogs.filter((r) => !r.error && r.rawSha256);
  const baseCatalog = {
    catalogVersion: '1.1.0-donki',
    generatedAtUtc: new Date().toISOString(),
    source: 'NASA DONKI Web API (https://api.nasa.gov/DONKI/)',
    endpointsUsed: ['FLR', 'CME', 'SEP', 'IPS', 'notifications'],
    excludedEndpoints: [
      {
        endpoint: 'GST',
        reason: 'Geomagnetic Storm (Kp index) applies only to Earth magnetosphere, not the Moon.',
      },
      {
        endpoint: 'RBE',
        reason: 'Radiation Belt Enhancement applies only to Earth Van Allen belts, not the Moon.',
      },
    ],
    provenance: 'observed',
    derivedIndicesProvenance: 'inferred',
    samples,
  };

  const catalog = {
    ...baseCatalog,
    provenanceMeta: {
      sourceUrls: [...new Set(successfulRequests.map((r) => r.url))],
      fetchSha256: sha256Hex(
        successfulRequests.map((r) => `${r.endpoint}:${r.url}:${r.rawSha256}`).join('\n')
      ),
      normalizedSha256: sha256Hex(JSON.stringify(samples)),
    },
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(catalog, null, 2) + '\n', 'utf8');

  fs.mkdirSync(path.dirname(OUT_LOG), { recursive: true });
  fs.writeFileSync(
    OUT_LOG,
    JSON.stringify(
      {
        generatedAtUtc: catalog.generatedAtUtc,
        note: 'All NASA_API_KEY values stripped/redacted before logging.',
        totalRequests: requestLogs.length,
        requests: requestLogs,
      },
      null,
      2
    ) + '\n',
    'utf8'
  );

  const bytes = fs.statSync(OUT_JSON).size;
  console.log(`Saved ${OUT_JSON} (${(bytes / 1024).toFixed(1)} KB)`);
  console.log(`Saved ${OUT_LOG}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
