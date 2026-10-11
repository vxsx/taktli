import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const downloads: { name: string; type: string; size: number }[] = [];
vi.mock('../io/download', async (orig) => ({
  ...(await orig<typeof import('../io/download')>()),
  downloadBytes: (bytes: Uint8Array, name: string, type: string) => downloads.push({ name, type, size: bytes.length }),
}));

import { decodeShare, payloadFromHash } from '../io/share';
import { createDemoProject } from '../model/factory';
import * as actions from './actions';
import { appStore } from './store';

beforeEach(() => {
  downloads.length = 0;
  appStore.getState().loadProject(createDemoProject());
  vi.stubGlobal('location', { origin: 'https://dm.test', pathname: '/app/' });
});
afterEach(() => vi.unstubAllGlobals());

describe('exportMidiFile', () => {
  it('downloads a .mid named after the project', () => {
    actions.exportMidiFile();
    expect(downloads).toEqual([{ name: 'Demo-groove.mid', type: 'audio/midi', size: expect.any(Number) }]);
    expect(downloads[0].size).toBeGreaterThan(100);
  });
});

describe('shareProject', () => {
  it('uses the Web Share API when available', async () => {
    const share = vi.fn(async (_data: ShareData) => undefined);
    vi.stubGlobal('navigator', { share });
    await actions.shareProject();
    const url = share.mock.calls[0][0].url!;
    expect(url.startsWith('https://dm.test/app/#p=')).toBe(true);
    const p = await decodeShare(payloadFromHash(new URL(url).hash)!);
    expect(p.name).toBe('Demo groove');
  });

  it('falls back to the clipboard', async () => {
    const writeText = vi.fn(async (_t: string) => undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await actions.shareProject();
    expect(writeText.mock.calls[0][0]).toMatch(/#p=/);
    expect(appStore.getState().toasts.at(-1)?.message).toBe('Link copied');
  });

  it('stays quiet when the user cancels the share sheet', async () => {
    const share = vi.fn(async () => { throw Object.assign(new Error('cancel'), { name: 'AbortError' }); });
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { share, clipboard: { writeText } });
    await actions.shareProject();
    expect(writeText).not.toHaveBeenCalled();
  });
});
