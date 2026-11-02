import { describe, expect, it } from 'vitest';
import { APP_VERSION, compareVersions, latestRelease } from '../update/updateCheck';
import pkg from '../../package.json';

describe('update check', () => {
  it('knows the running version', () => {
    expect(APP_VERSION).toBe(pkg.version);
  });

  it('compares versions numerically', () => {
    expect(compareVersions('1.10.0', '1.9.3')).toBeGreaterThan(0);
    expect(compareVersions('v1.7.0', '1.7.0')).toBe(0);
    expect(compareVersions('1.7', '1.7.0')).toBe(0);
    expect(compareVersions('1.6.9', '1.7.0')).toBeLessThan(0);
    expect(compareVersions('2.0.0-beta', '1.9.0')).toBeGreaterThan(0);
  });

  it('reads the latest release from GitHub and stays quiet when unreachable', async () => {
    const ok = (async () => new Response(JSON.stringify({ tag_name: 'v9.0.0', html_url: 'https://example.invalid/r' }))) as typeof fetch;
    expect(await latestRelease(ok)).toEqual({ version: '9.0.0', url: 'https://example.invalid/r' });
    const down = (async () => {
      throw new Error('offline');
    }) as typeof fetch;
    expect(await latestRelease(down)).toBeUndefined();
    const limited = (async () => new Response('{}', { status: 403 })) as typeof fetch;
    expect(await latestRelease(limited)).toBeUndefined();
  });
});
