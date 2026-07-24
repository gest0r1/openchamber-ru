import { describe, expect, test } from 'bun:test';

import {
  DEFAULT_FOLLOW_UP_BEHAVIOR,
  isFollowUpBehavior,
  normalizeFollowUpBehavior,
} from './messageQueueStore';

describe('follow-up behavior', () => {
  test('default value is queue', () => {
    expect(DEFAULT_FOLLOW_UP_BEHAVIOR).toBe('queue');
  });

  describe('isFollowUpBehavior', () => {
    test('returns true for steer', () => {
      expect(isFollowUpBehavior('steer')).toBe(true);
    });

    test('returns true for queue', () => {
      expect(isFollowUpBehavior('queue')).toBe(true);
    });

    test('returns false for undefined', () => {
      expect(isFollowUpBehavior(undefined)).toBe(false);
    });

    test('returns false for null', () => {
      expect(isFollowUpBehavior(null)).toBe(false);
    });

    test('returns false for legacy immediate value', () => {
      expect(isFollowUpBehavior('immediate')).toBe(false);
    });

    test('returns false for random string', () => {
      expect(isFollowUpBehavior('unknown')).toBe(false);
    });
  });

  describe('normalizeFollowUpBehavior', () => {
    test('returns steer when value is immediate (legacy migration)', () => {
      expect(normalizeFollowUpBehavior('immediate')).toBe('steer');
    });

    test('returns steer when value is steer', () => {
      expect(normalizeFollowUpBehavior('steer')).toBe('steer');
    });

    test('returns queue when value is queue', () => {
      expect(normalizeFollowUpBehavior('queue')).toBe('queue');
    });

    test('returns steer when legacy queueModeEnabled is false', () => {
      expect(normalizeFollowUpBehavior(undefined, false)).toBe('steer');
    });

    test('returns queue when legacy queueModeEnabled is true', () => {
      expect(normalizeFollowUpBehavior(undefined, true)).toBe('queue');
    });

    test('returns default when both value and legacy are undefined', () => {
      expect(normalizeFollowUpBehavior(undefined, undefined)).toBe(DEFAULT_FOLLOW_UP_BEHAVIOR);
    });

    test('returns default when both value and legacy are null', () => {
      expect(normalizeFollowUpBehavior(null, null)).toBe(DEFAULT_FOLLOW_UP_BEHAVIOR);
    });

    test('value takes precedence over legacy', () => {
      expect(normalizeFollowUpBehavior('steer', true)).toBe('steer');
      expect(normalizeFollowUpBehavior('queue', false)).toBe('queue');
    });
  });
});
