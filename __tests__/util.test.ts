import { expect, test } from '@jest/globals';
import { hasProperty } from '../src/util';

test('returns true for own properties of objects', () => {
  expect(hasProperty({ id: 'abc' }, 'id')).toBe(true);
  expect(hasProperty({ id: undefined }, 'id')).toBe(true);
});

test('returns false for missing properties', () => {
  expect(hasProperty({ id: 'abc' }, 'other')).toBe(false);
  expect(hasProperty({}, 'id')).toBe(false);
});

test('returns false for null and non-objects', () => {
  expect(hasProperty(null, 'id')).toBe(false);
  expect(hasProperty('string', 'id')).toBe(false);
  expect(hasProperty(42, 'id')).toBe(false);
});

test('returns true for inherited properties', () => {
  expect(hasProperty([], 'length')).toBe(true);
});
