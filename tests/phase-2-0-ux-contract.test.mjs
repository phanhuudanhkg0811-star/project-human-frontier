import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { simulationRoot } from '../scripts/load-simulation.mjs';

const contractPath = path.join(simulationRoot, 'docs/plan/second-phase/PHASE_2_0_ONBOARDING_CONTRACT.md');
const contractMarkdown = fs.readFileSync(contractPath, 'utf8');

function extractContractJson(markdown) {
  const match = markdown.match(/```json\s*\n([\s\S]*?)\n```/);
  assert.ok(match, 'PHASE_2_0_ONBOARDING_CONTRACT.md must contain a fenced ```json contract block');
  return JSON.parse(match[1]);
}

function countWords(text) {
  return text
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0 && !/^[-—–·•()[\]{}:;.,!?]+$/.test(token)).length;
}

const contract = extractContractJson(contractMarkdown);

test('Phase 2.0 intro storyboard satisfies scene count (5-7), duration (60-90s), and gesture/gameplay locks', () => {
  const { intro } = contract;
  assert.equal(intro.autoplayAudioBeforeGesture, false);
  assert.equal(intro.containsGameplayActions, false);
  assert.equal(intro.handoffTarget, 'mission-setup');

  assert.ok(
    intro.scenes.length >= 5 && intro.scenes.length <= 7,
    `Expected 5-7 intro scenes, got ${intro.scenes.length}`
  );

  const totalSeconds = intro.scenes.reduce((sum, scene) => sum + scene.durationSec, 0);
  assert.ok(
    totalSeconds >= 60 && totalSeconds <= 90,
    `Expected total intro duration in 60-90s, got ${totalSeconds}s`
  );

  const sceneIds = new Set();
  for (const scene of intro.scenes) {
    assert.ok(scene.id && !sceneIds.has(scene.id), `Duplicate or missing scene id: ${scene.id}`);
    sceneIds.add(scene.id);
    assert.ok(scene.durationSec > 0);
    assert.ok(scene.vi.trim().length > 0 && scene.en.trim().length > 0);
  }
});

test('Phase 2.0 Guided Sol 1 script covers all required targets, fallbacks, test events, and <= 45-word popovers', () => {
  const targetSet = new Set(contract.dataTourTargets);
  const requiredTargets = [
    'open-briefing',
    'weather-status',
    'event-choice',
    'crew-assignment',
    'systems-panel',
    'open-comms',
    'resource-forecast',
    'end-sol',
  ];

  const stepIds = new Set();
  const testEvents = new Set();
  const coveredTargets = new Set();

  for (const step of contract.guidedSol1Steps) {
    assert.ok(step.stepId && !stepIds.has(step.stepId), `Duplicate or missing stepId: ${step.stepId}`);
    stepIds.add(step.stepId);

    assert.equal(step.decorationOnly, false, `Step ${step.stepId} must not be decoration-only`);
    assert.ok(targetSet.has(step.target), `Target "${step.target}" must be registered in dataTourTargets`);
    coveredTargets.add(step.target);

    assert.ok(step.expectedAction.trim().length > 0, `Missing expectedAction on ${step.stepId}`);
    assert.ok(step.completionCondition.trim().length > 0, `Missing completionCondition on ${step.stepId}`);
    assert.ok(step.fallback.trim().length > 0, `Missing fallback on ${step.stepId}`);
    assert.ok(
      typeof step.testEvent === 'string' && step.testEvent.startsWith('onboarding:test:') && !testEvents.has(step.testEvent),
      `Invalid or duplicate testEvent on ${step.stepId}: ${step.testEvent}`
    );
    testEvents.add(step.testEvent);

    for (const locale of ['vi', 'en']) {
      const combined = `${step.title[locale]} ${step.body[locale]}`;
      const words = countWords(combined);
      assert.ok(
        words <= contract.copyLimits.guidedPopoverMaxWords,
        `Step ${step.stepId} (${locale}) exceeds ${contract.copyLimits.guidedPopoverMaxWords} words: ${words}`
      );
    }
  }

  for (const required of requiredTargets) {
    assert.ok(coveredTargets.has(required), `Missing required Guided Sol 1 target: ${required}`);
  }
});

test('Phase 2.0 contextual hints satisfy anti-spam rules, registered CTA targets, and <= 35-word copy budget', () => {
  const targetSet = new Set(contract.dataTourTargets);
  const hintIds = new Set();

  assert.equal(contract.contextualHints.length, 8, 'Expected all 8 P1 contextual hints');

  for (const hint of contract.contextualHints) {
    assert.ok(hint.id && !hintIds.has(hint.id), `Duplicate or missing hint id: ${hint.id}`);
    hintIds.add(hint.id);

    assert.ok(Number.isFinite(hint.priority) && hint.priority > 0);
    assert.ok(Number.isFinite(hint.cooldownSols) && hint.cooldownSols >= 1);
    assert.ok(['safety-per-sol', 'educational-permanent'].includes(hint.dismissPolicy));
    assert.ok(targetSet.has(hint.ctaTarget), `Hint CTA target "${hint.ctaTarget}" must be in dataTourTargets`);

    for (const locale of ['vi', 'en']) {
      const words = countWords(hint[locale]);
      assert.ok(
        words <= contract.copyLimits.contextualHintMaxWords,
        `Hint ${hint.id} (${locale}) exceeds ${contract.copyLimits.contextualHintMaxWords} words: ${words}`
      );
    }
  }
});
