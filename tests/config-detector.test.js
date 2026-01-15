const fs = require('fs');
const path = require('path');
const { CONFIG_FORMATS, detectConfigFormat, resolveConfigFormat } = require('../src/config/config-detector');

describe('config-detector', () => {
  const testDir = '/tmp/config-detector-test';

  beforeEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  describe('detectConfigFormat', () => {
    test('returns skyhook when only skyhook.yaml exists', () => {
      fs.writeFileSync(path.join(testDir, 'skyhook.yaml'), 'services: []');
      expect(detectConfigFormat(testDir)).toBe(CONFIG_FORMATS.SKYHOOK);
    });

    test('returns koala when only .koala-monorepo.json exists', () => {
      fs.writeFileSync(path.join(testDir, '.koala-monorepo.json'), '{}');
      expect(detectConfigFormat(testDir)).toBe(CONFIG_FORMATS.KOALA);
    });

    test('returns skyhook when both configs exist (skyhook preferred)', () => {
      fs.writeFileSync(path.join(testDir, 'skyhook.yaml'), 'services: []');
      fs.writeFileSync(path.join(testDir, '.koala-monorepo.json'), '{}');
      expect(detectConfigFormat(testDir)).toBe(CONFIG_FORMATS.SKYHOOK);
    });

    test('returns null when no config exists', () => {
      expect(detectConfigFormat(testDir)).toBeNull();
    });
  });

  describe('resolveConfigFormat', () => {
    test('returns auto-detected format when input is auto', () => {
      fs.writeFileSync(path.join(testDir, 'skyhook.yaml'), 'services: []');
      expect(resolveConfigFormat(testDir, 'auto')).toBe(CONFIG_FORMATS.SKYHOOK);
    });

    test('returns explicitly specified skyhook format', () => {
      fs.writeFileSync(path.join(testDir, '.koala-monorepo.json'), '{}');
      expect(resolveConfigFormat(testDir, 'skyhook')).toBe(CONFIG_FORMATS.SKYHOOK);
    });

    test('returns explicitly specified koala format', () => {
      fs.writeFileSync(path.join(testDir, 'skyhook.yaml'), 'services: []');
      expect(resolveConfigFormat(testDir, 'koala')).toBe(CONFIG_FORMATS.KOALA);
    });

    test('throws error for invalid config format input', () => {
      expect(() => resolveConfigFormat(testDir, 'invalid')).toThrow(/Invalid config-format/);
    });

    test('throws error when no config found and input is auto', () => {
      expect(() => resolveConfigFormat(testDir, 'auto')).toThrow(/No configuration found/);
    });

    test('handles empty string input as auto', () => {
      fs.writeFileSync(path.join(testDir, 'skyhook.yaml'), 'services: []');
      expect(resolveConfigFormat(testDir, '')).toBe(CONFIG_FORMATS.SKYHOOK);
    });

    test('handles undefined input as auto', () => {
      fs.writeFileSync(path.join(testDir, '.koala-monorepo.json'), '{}');
      expect(resolveConfigFormat(testDir, undefined)).toBe(CONFIG_FORMATS.KOALA);
    });
  });
});
