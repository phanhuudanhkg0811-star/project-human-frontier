import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { simulationRoot } from '../scripts/load-simulation.mjs';

const assetRoot = path.join(simulationRoot, 'public', 'assets', 'hail');
const manifest = JSON.parse(fs.readFileSync(path.join(assetRoot, 'manifest.json'), 'utf8'));

test('Phase 1.5 HAIL manifest covers every shipped image/audio asset with provenance', () => {
  const diskFiles = fs.readdirSync(assetRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(svg|webp|ogg)$/i.test(entry.name));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.assetCount, diskFiles.length);
  assert.equal(manifest.assets.length, diskFiles.length);
  assert.equal(new Set(manifest.assets.map((asset) => asset.id)).size, manifest.assets.length);

  for (const asset of manifest.assets) {
    assert.match(asset.path, /^\/assets\/hail\//);
    const filePath = path.join(simulationRoot, 'public', asset.path.replace(/^\//, ''));
    const rawBytes = fs.readFileSync(filePath);
    const bytes = asset.mediaType === 'image/svg+xml'
      ? Buffer.from(rawBytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8')
      : rawBytes;
    assert.equal(asset.bytes, bytes.length, `${asset.path} byte size drift`);
    assert.equal(asset.sha256, crypto.createHash('sha256').update(bytes).digest('hex'), `${asset.path} hash drift`);
    assert.ok(asset.source.length > 0 && asset.license.length > 0, `${asset.path} missing provenance`);
    assert.ok(Number.isInteger(asset.version) && asset.version >= 1, `${asset.path} invalid version`);
    if (asset.mediaType.startsWith('image/')) {
      assert.ok(asset.dimensions?.width > 0 && asset.dimensions?.height > 0, `${asset.path} missing dimensions`);
      assert.deepEqual(asset.anchor, { x: 0.5, y: 0.5 });
    }
  }
});
