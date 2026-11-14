import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(root, 'dist');
const assetsDir = path.join(distDir, 'assets');
const hailDistDir = path.join(distDir, 'assets', 'hail');

const MAX_SINGLE_JS_CHUNK_RAW_BYTES = 500 * 1024;
const MAX_INITIAL_JS_GZIP_BYTES = 250 * 1024;
const MAX_INITIAL_CSS_GZIP_BYTES = 30 * 1024;
const MAX_CRITICAL_ROUTE_BYTES = 2.5 * 1024 * 1024;

const CRITICAL_BOOT_ASSETS = [
  'environments/PH_ENV_SPACE_DEEP_BASE_V01.webp',
  'environments/PH_ENV_LUNAR_EXTERIOR_DAY_V01.webp',
  'environments/PH_ENV_COCKPIT_SHELL_BASE_V01.webp',
  'equipment/PH_EQP_CONSOLE_DESK_BASE_V02.webp',
  'equipment/PH_EQP_FABRICATOR_IDLE_V02.webp',
  'equipment/PH_EQP_COMMS_TERMINAL_BASE_V03.webp',
  'nhân vật cho project hail/trạng thái bình thường/nv 1.webp',
  'nhân vật cho project hail/trạng thái bình thường/nv 2.webp',
  'nhân vật cho project hail/trạng thái bình thường/nv 3.webp',
  'nhân vật cho project hail/trạng thái bình thường/nv 4.webp',
];

function gzipSize(filePath) {
  return zlib.gzipSync(fs.readFileSync(filePath)).length;
}

function collectDirBytes(dirPath) {
  if (!fs.existsSync(dirPath)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) total += collectDirBytes(full);
    else if (entry.isFile()) total += fs.statSync(full).size;
  }
  return total;
}

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(2)} kB`;
}

assert.ok(fs.existsSync(path.join(distDir, 'index.html')), 'dist/index.html must exist; run npm run build first');
const html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');

const initialRefs = new Set();
for (const match of html.matchAll(/(?:src|href)=["']\/(assets\/[^"']+\.(?:js|css))["']/g)) {
  initialRefs.add(match[1]);
}

const jsFiles = fs.readdirSync(assetsDir).filter((name) => name.endsWith('.js'));
const cssFiles = fs.readdirSync(assetsDir).filter((name) => name.endsWith('.css'));

let initialJsRaw = 0;
let initialJsGzip = 0;
let initialCssGzip = 0;

console.log('--- JS Chunks ---');
for (const file of jsFiles) {
  const full = path.join(assetsDir, file);
  const raw = fs.statSync(full).size;
  const gz = gzipSize(full);
  const isInitial = initialRefs.has(`assets/${file}`);
  if (isInitial) {
    initialJsRaw += raw;
    initialJsGzip += gz;
  }
  console.log(`  [${isInitial ? 'INIT' : 'LAZY'}] ${file.padEnd(36)} raw=${formatKb(raw).padStart(10)}  gzip=${formatKb(gz).padStart(10)}`);
  assert.ok(
    raw <= MAX_SINGLE_JS_CHUNK_RAW_BYTES,
    `JS chunk ${file} exceeds 500 kB ceiling (${formatKb(raw)})`,
  );
}

console.log('--- CSS Bundles ---');
for (const file of cssFiles) {
  const full = path.join(assetsDir, file);
  const raw = fs.statSync(full).size;
  const gz = gzipSize(full);
  const isInitial = initialRefs.has(`assets/${file}`);
  if (isInitial) initialCssGzip += gz;
  console.log(`  [${isInitial ? 'INIT' : 'LAZY'}] ${file.padEnd(36)} raw=${formatKb(raw).padStart(10)}  gzip=${formatKb(gz).padStart(10)}`);
}

let criticalAssetBytes = 0;
for (const rel of CRITICAL_BOOT_ASSETS) {
  const full = path.join(hailDistDir, rel);
  assert.ok(fs.existsSync(full), `Missing critical boot asset in dist: ${rel}`);
  criticalAssetBytes += fs.statSync(full).size;
}
criticalAssetBytes += collectDirBytes(path.join(hailDistDir, 'inventory'));
criticalAssetBytes += collectDirBytes(path.join(hailDistDir, 'svg'));

const criticalRouteTotal = initialJsGzip + initialCssGzip + criticalAssetBytes;

console.log('--- Option B Budget Summary ---');
console.log(`  Initial JS (raw/gzip) : ${formatKb(initialJsRaw)} / ${formatKb(initialJsGzip)} (limit ${formatKb(MAX_INITIAL_JS_GZIP_BYTES)})`);
console.log(`  Initial CSS (gzip)    : ${formatKb(initialCssGzip)} (limit ${formatKb(MAX_INITIAL_CSS_GZIP_BYTES)})`);
console.log(`  Critical Boot Assets  : ${(criticalAssetBytes / 1024 / 1024).toFixed(3)} MB`);
console.log(`  Critical Route Total  : ${(criticalRouteTotal / 1024 / 1024).toFixed(3)} MB (limit 2.500 MB)`);

assert.ok(
  initialJsGzip <= MAX_INITIAL_JS_GZIP_BYTES,
  `Initial JS gzip ${formatKb(initialJsGzip)} exceeds ${formatKb(MAX_INITIAL_JS_GZIP_BYTES)}`,
);
assert.ok(
  initialCssGzip <= MAX_INITIAL_CSS_GZIP_BYTES,
  `Initial CSS gzip ${formatKb(initialCssGzip)} exceeds ${formatKb(MAX_INITIAL_CSS_GZIP_BYTES)}`,
);
assert.ok(
  criticalRouteTotal <= MAX_CRITICAL_ROUTE_BYTES,
  `Critical route payload ${(criticalRouteTotal / 1024 / 1024).toFixed(3)} MB exceeds 2.500 MB Option B budget`,
);
console.log('PASS: All Option B bundle & critical asset budgets satisfied.');
