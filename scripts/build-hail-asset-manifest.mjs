import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetRoot = path.join(root, 'public', 'assets', 'hail');
const outputPath = path.join(assetRoot, 'manifest.json');
const supportedExtensions = new Set(['.svg', '.webp', '.ogg']);

function listFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = path.join(directory, entry.name);
      return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
    })
    .filter((filePath) => supportedExtensions.has(path.extname(filePath).toLowerCase()))
    .sort((left, right) => left.localeCompare(right, 'en'));
}

function svgDimensions(buffer) {
  const source = buffer.toString('utf8');
  const width = source.match(/\bwidth=["']([\d.]+)/i)?.[1];
  const height = source.match(/\bheight=["']([\d.]+)/i)?.[1];
  if (width && height) return { width: Number(width), height: Number(height) };
  const viewBox = source.match(/\bviewBox=["'][\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)[\s,]+([\d.]+)["']/i);
  return viewBox ? { width: Number(viewBox[1]), height: Number(viewBox[2]) } : null;
}

function webpDimensions(buffer) {
  if (buffer.length < 30 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') return null;
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunk = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (chunk === 'VP8X' && data + 10 <= buffer.length) {
      return {
        width: 1 + buffer.readUIntLE(data + 4, 3),
        height: 1 + buffer.readUIntLE(data + 7, 3),
      };
    }
    if (chunk === 'VP8 ' && data + 10 <= buffer.length) {
      return {
        width: buffer.readUInt16LE(data + 6) & 0x3fff,
        height: buffer.readUInt16LE(data + 8) & 0x3fff,
      };
    }
    if (chunk === 'VP8L' && data + 5 <= buffer.length && buffer[data] === 0x2f) {
      return {
        width: 1 + buffer[data + 1] + ((buffer[data + 2] & 0x3f) << 8),
        height: 1 + (buffer[data + 2] >> 6) + (buffer[data + 3] << 2) + ((buffer[data + 4] & 0x0f) << 10),
      };
    }
    offset = data + chunkSize + (chunkSize % 2);
  }
  return null;
}

function inferState(fileName) {
  const normalized = fileName.toLowerCase();
  const states = ['normal', 'hungry', 'sick', 'damaged', 'working', 'idle', 'active', 'broken', 'night', 'day'];
  return states.find((state) => normalized.includes(state)) ?? 'default';
}

function inferLayer(relativePath) {
  const directory = relativePath.split('/')[0];
  return ({
    audio: 'audio', characters: 'crew', environment: 'environment', equipment: 'equipment',
    events: 'event', inventory: 'inventory', resources: 'hud', ui: 'ui',
  })[directory] ?? 'misc';
}

function readCanonicalAssetBytes(filePath, extension) {
  const raw = fs.readFileSync(filePath);
  // Keep SVG manifest sizes/hashes invariant across LF (Linux/CI) and CRLF (Windows) checkouts.
  return extension === '.svg' ? Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n'), 'utf8') : raw;
}

const inferOrigin = (relativePath, extension) => {
  const normalized = relativePath.normalize('NFC').toLowerCase();
  const isHumanArtist =
    normalized.startsWith('nhân vật cho project hail/') ||
    normalized.startsWith('characters/ph_char_nv') ||
    /^4 khung cho cảnh mở đ[ầa][uụ]\//.test(normalized);
  if (isHumanArtist) {
    return {
      origin: 'artist-human',
      siGenerated: false,
      watermarkApplied: false,
      source: 'Project Human Frontier human artist original illustration (non-SI artwork)',
      license: 'Project-owned human artwork; approved for Project Human Frontier use',
    };
  }
  if (extension === '.svg') {
    return {
      origin: 'procedural-vector',
      siGenerated: false,
      watermarkApplied: false,
      source: 'Project Human Frontier deterministic vector SVG graphics (SI-assisted codebase)',
      license: 'Project-owned vector asset; approved for Project Human Frontier use',
    };
  }
  if (extension === '.ogg') {
    return {
      origin: 'si-generated',
      siGenerated: true,
      watermarkApplied: false,
      source: 'Project Human Frontier AeroMatte 2050 SFX (SI-generated audio; disclosed in metadata & Credits)',
      license: 'Project-owned SI-generated audio; approved for Project Human Frontier use',
    };
  }
  return {
    origin: 'si-generated',
    siGenerated: true,
    watermarkApplied: true,
    source: 'Project Human Frontier AeroMatte 2050 artwork (SI-generated image; visible SI watermark embedded)',
    license: 'Project-owned SI-generated asset; approved for Project Human Frontier use',
  };
};

const assets = listFiles(assetRoot).map((filePath) => {
  const extension = path.extname(filePath).toLowerCase();
  const buffer = readCanonicalAssetBytes(filePath, extension);
  const relativePath = path.relative(assetRoot, filePath).replaceAll('\\', '/');
  const dimensions = extension === '.svg' ? svgDimensions(buffer) : extension === '.webp' ? webpDimensions(buffer) : null;
  const versionMatch = path.basename(filePath).match(/_V(\d+)/i);
  const originInfo = inferOrigin(relativePath, extension);
  return {
    id: relativePath.replace(/\.[^.]+$/, '').replaceAll('/', ':'),
    path: `/assets/hail/${relativePath}`,
    mediaType: extension === '.ogg' ? 'audio/ogg' : extension === '.svg' ? 'image/svg+xml' : 'image/webp',
    bytes: buffer.length,
    dimensions,
    anchor: dimensions ? { x: 0.5, y: 0.5 } : null,
    layer: inferLayer(relativePath),
    state: inferState(path.basename(filePath)),
    origin: originInfo.origin,
    siGenerated: originInfo.siGenerated,
    watermarkApplied: originInfo.watermarkApplied,
    source: originInfo.source,
    license: originInfo.license,
    version: versionMatch ? Number(versionMatch[1]) : 1,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
  };
});

const originCounts = assets.reduce(
  (acc, item) => {
    acc[item.origin] = (acc[item.origin] || 0) + 1;
    return acc;
  },
  { 'artist-human': 0, 'si-generated': 0, 'procedural-vector': 0 },
);

const manifest = {
  schemaVersion: 1,
  generatedBy: 'scripts/build-hail-asset-manifest.mjs',
  assetRoot: '/assets/hail/',
  siDisclosure: {
    policy: 'NASA Space Apps Challenge - Use of Super Intelligence (SI)',
    summary:
      'Artist-drawn comic & crew illustrations are non-SI originals (no SI watermark); all SI-generated WebP images carry visible SI watermarks, and SI-generated OGG audio plus SI-assisted code/telemetry helpers are disclosed in metadata and Credits.',
    originCounts,
  },
  assetCount: assets.length,
  assets,
};

fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Wrote ${assets.length} HAIL assets to ${path.relative(root, outputPath)}`);
