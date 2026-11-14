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

const assets = listFiles(assetRoot).map((filePath) => {
  const buffer = fs.readFileSync(filePath);
  const relativePath = path.relative(assetRoot, filePath).replaceAll('\\', '/');
  const extension = path.extname(filePath).toLowerCase();
  const dimensions = extension === '.svg' ? svgDimensions(buffer) : extension === '.webp' ? webpDimensions(buffer) : null;
  const versionMatch = path.basename(filePath).match(/_V(\d+)/i);
  return {
    id: relativePath.replace(/\.[^.]+$/, '').replaceAll('/', ':'),
    path: `/assets/hail/${relativePath}`,
    mediaType: extension === '.ogg' ? 'audio/ogg' : extension === '.svg' ? 'image/svg+xml' : 'image/webp',
    bytes: buffer.length,
    dimensions,
    anchor: dimensions ? { x: 0.5, y: 0.5 } : null,
    layer: inferLayer(relativePath),
    state: inferState(path.basename(filePath)),
    source: 'Project Human Frontier internal AeroMatte 2050 production',
    license: 'Project-owned asset; approved for Project Human Frontier use',
    version: versionMatch ? Number(versionMatch[1]) : 1,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
  };
});

const manifest = {
  schemaVersion: 1,
  generatedBy: 'scripts/build-hail-asset-manifest.mjs',
  assetRoot: '/assets/hail/',
  assetCount: assets.length,
  assets,
};

fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Wrote ${assets.length} HAIL assets to ${path.relative(root, outputPath)}`);
