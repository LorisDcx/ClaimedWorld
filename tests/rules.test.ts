import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseOwner,
  DAY,
  generationSlots,
  HALF_HOUR,
  nextGeneration,
  requiredInfluence,
  generatedStock,
} from '../src/lib/rules';
test('generation continues every half hour without a daily pause', () => {
  const anchor = 100000000;
  assert.equal(generationSlots(anchor, anchor), 0);
  assert.equal(generationSlots(anchor, anchor + HALF_HOUR - 1), 0);
  assert.equal(generationSlots(anchor, anchor + HALF_HOUR), 1);
  assert.equal(generationSlots(anchor, anchor + 4 * 3600000), 8);
  assert.equal(generationSlots(anchor, anchor + DAY - 1), 47);
  assert.equal(generationSlots(anchor, anchor + DAY), 48);
  assert.equal(generationSlots(anchor, anchor + DAY + HALF_HOUR), 49);
  assert.equal(generationSlots(anchor, anchor + 10 * DAY + 4 * 3600000), 488);
});
test('stock saturation discards excess generation', () => {
  assert.equal(generatedStock(100, 1), 120);
  assert.equal(generatedStock(150, 1), 160);
  assert.equal(generatedStock(160, 4800), 160);
  assert.equal(generatedStock(0, 4800), 160);
  assert.equal(generatedStock(170, 1, 180, 22), 180);
});
test('next generation has no daily pause and handles exact boundaries', () => {
  assert.equal(nextGeneration(0, 0), HALF_HOUR);
  assert.equal(nextGeneration(0, HALF_HOUR), 2 * HALF_HOUR);
  assert.equal(nextGeneration(0, 4 * 3600000), 4 * 3600000 + HALF_HOUR);
  assert.equal(nextGeneration(0, DAY), DAY + HALF_HOUR);
});
test('ownership starts at one point, preserves incumbent ties and resolves neutral ties deterministically', () => {
  assert.equal(chooseOwner([{ id: 'a', score: 0 }], 'a'), null);
  assert.equal(chooseOwner([{ id: 'a', score: 1 }], null), 'a');
  assert.equal(
    chooseOwner(
      [
        { id: 'a', score: 1 },
        { id: 'b', score: 1 },
      ],
      'b',
    ),
    'b',
  );
  assert.equal(
    chooseOwner(
      [
        { id: 'a', score: 1 },
        { id: 'b', score: 2 },
      ],
      'a',
    ),
    'b',
  );
  assert.equal(
    chooseOwner(
      [
        { id: 'b', score: 100 },
        { id: 'a', score: 100 },
      ],
      'b',
    ),
    'b',
  );
  assert.equal(
    chooseOwner(
      [
        { id: 'b', score: 100 },
        { id: 'a', score: 101 },
      ],
      'b',
    ),
    'a',
  );
  assert.equal(
    chooseOwner(
      [
        { id: 'b', score: 100 },
        { id: 'a', score: 100 },
      ],
      null,
    ),
    'a',
  );
});
test('takeover estimate accounts for previous own contributions', () => {
  assert.equal(requiredInfluence(100, 20, false), 81);
  assert.equal(requiredInfluence(0, 0, false), 1);
  assert.equal(requiredInfluence(0, 30, false), 1);
  assert.equal(requiredInfluence(1, 0, false), 2);
  assert.equal(requiredInfluence(2, 1, false), 2);
  assert.equal(requiredInfluence(100, 100, true), 1);
});
