import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import { renderTagRGBA, tagModules } from './apriltag';
import { TAG36H11_CODES } from './tag36h11-codes';

const require = createRequire(import.meta.url);
const { AR } = require('js-aruco2');
require('js-aruco2/src/dictionaries/apriltag_36h11');

describe('AprilTag 36h11 rendering ↔ detection', () => {
  it('has the full 587-marker family', () => {
    expect(TAG36H11_CODES).toHaveLength(587);
  });

  it('renders a black border and white quiet zone', () => {
    const g = tagModules(0);
    expect(g[0].every(Boolean)).toBe(true);
    expect(g[1].slice(1, 9).every((v) => !v)).toBe(true);
  });

  it('the browser detector reads back the IDs the projector renders', () => {
    const detector = new AR.Detector({ dictionaryName: 'APRILTAG_36h11', maxHammingDistance: 4 });
    for (const id of [0, 1, 42, 123, 300, 586]) {
      const img = renderTagRGBA(id, 12, 3);
      const found = detector.detect(img);
      expect(found.map((m: any) => m.id)).toContain(id);
    }
  });
});
