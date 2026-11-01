import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { TriliumClient } from '../trilium-client.js';

const note = { noteId: 'abc123', title: 'Test', utcDateModified: 'v1' };

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Serves the note's metadata as JSON, and its content as the given bytes. */
function stubEtapi(content: Uint8Array) {
  const fetchMock = vi.fn(async (url: string) =>
    url.endsWith('/content') ? new Response(content) : new Response(JSON.stringify(note))
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('TriliumClient', () => {
  beforeEach(() => {
    vi.stubEnv('TRILIUM_TOKEN', 'token');
    vi.stubEnv('TRILIUM_URL', 'http://trilium.test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe('getNoteWithContent', () => {
    it('hashes UTF-8 text', async () => {
      const bytes = new TextEncoder().encode('digraph → “é” 📌\n');
      stubEtapi(bytes);

      const result = await new TriliumClient().getNoteWithContent('abc123');

      expect(result.contentSha256).toBe(sha256(bytes));
      expect(result.contentSha256).toMatch(/^[0-9a-f]{64}$/);
    });

    it('matches a known SHA-256', async () => {
      stubEtapi(new TextEncoder().encode('abc'));

      const result = await new TriliumClient().getNoteWithContent('abc123');

      expect(result.contentSha256).toBe(
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
      );
    });

    it('hashes the stored bytes of binary content that is not valid UTF-8', async () => {
      const bytes = new Uint8Array([0x89, 0x50, 0xff, 0xfe, 0x00]);
      stubEtapi(bytes);

      const result = await new TriliumClient().getNoteWithContent('abc123');

      expect(result.contentSha256).toBe(sha256(bytes));
    });

    it('includes a leading byte order mark in both the hash and the text', async () => {
      const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x61]);
      stubEtapi(bytes);

      const result = await new TriliumClient().getNoteWithContent('abc123');

      expect(result.contentSha256).toBe(sha256(bytes));
      expect(result.content).toBe('﻿a');
    });

    it('changes the hash when one character changes and the length does not', async () => {
      stubEtapi(new TextEncoder().encode('abc'));
      const first = await new TriliumClient().getNoteWithContent('abc123');

      stubEtapi(new TextEncoder().encode('abd'));
      const second = await new TriliumClient().getNoteWithContent('abc123');

      expect(first.content.length).toBe(second.content.length);
      expect(first.contentSha256).not.toBe(second.contentSha256);
    });

    it('reads metadata before content', async () => {
      const fetchMock = stubEtapi(new TextEncoder().encode('abc'));

      await new TriliumClient().getNoteWithContent('abc123');

      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
        'http://trilium.test/etapi/notes/abc123',
        'http://trilium.test/etapi/notes/abc123/content',
      ]);
    });
  });

  describe('searchNotes', () => {
    function stubSearch() {
      const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify({ results: [] })));
      vi.stubGlobal('fetch', fetchMock);
      return fetchMock;
    }

    it('leaves out includeArchivedNotes by default', async () => {
      const fetchMock = stubSearch();

      await new TriliumClient().searchNotes('#map');

      expect(fetchMock.mock.calls[0][0]).not.toContain('includeArchivedNotes');
    });

    it('sends includeArchivedNotes when asked', async () => {
      const fetchMock = stubSearch();

      await new TriliumClient().searchNotes('#map', 100, true);

      expect(fetchMock.mock.calls[0][0]).toContain('includeArchivedNotes=true');
    });
  });
});
