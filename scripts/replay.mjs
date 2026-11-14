import fs from 'node:fs';
import { loadSimulation } from './load-simulation.mjs';

try {
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/replay.mjs <trace.json>');
  const core = await loadSimulation();
  const state = core.replayCampaign(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), core.loadContentBundle());
  console.log(JSON.stringify({ status: 'verified', sol: state.clock.sol, outcome: state.campaign.status, finalHash: core.stateHash(state) }, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
