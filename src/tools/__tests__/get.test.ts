import { describe, it, expect, vi } from 'vitest';
import { getNote, getRevisions, getRevision } from '../get.js';
import type { TriliumClient } from '../../trilium-client.js';

function mockClient(overrides: Record<string, unknown> = {}) {
  return {
    getNoteWithContent: vi.fn(),
    getNote: vi.fn(),
    listRevisions: vi.fn(),
    getRevisionMetadata: vi.fn(),
    getRevisionContent: vi.fn(),
    ...overrides,
  } as unknown as TriliumClient;
}

const baseNote = {
  noteId: 'abc123',
  title: 'Test Note',
  type: 'text',
  mime: 'text/html',
  dateCreated: '2024-01-01',
  dateModified: '2024-01-02',
  attributes: [],
  childNoteIds: [],
  parentNoteIds: [],
  parentBranchIds: [],
  childBranchIds: [],
  isProtected: false,
  utcDateCreated: '2024-01-01',
  utcDateModified: '2024-01-02',
};

describe('getNote', () => {
  describe('markdown conversion for text notes', () => {
    it('converts HTML headings to markdown', async () => {
      const client = mockClient({
        getNoteWithContent: vi.fn().mockResolvedValue({
          ...baseNote,
          content: '<h1>Hello World</h1>',
        }),
      });

      const result = JSON.parse(await getNote(client, { noteId: 'abc123', includeContent: true }));
      expect(result.content).toContain('Hello World');
      expect(result.content).not.toContain('<h1>');
      expect(result.contentFormat).toBe('markdown');
    });

    it('converts HTML paragraphs and bold/italic to markdown', async () => {
      const client = mockClient({
        getNoteWithContent: vi.fn().mockResolvedValue({
          ...baseNote,
          content: '<p>This is <strong>bold</strong> and <em>italic</em> text.</p>',
        }),
      });

      const result = JSON.parse(await getNote(client, { noteId: 'abc123', includeContent: true }));
      expect(result.content).toContain('**bold**');
      expect(result.content).toMatch(/[_*]italic[_*]/);
      expect(result.content).not.toContain('<strong>');
      expect(result.content).not.toContain('<em>');
      expect(result.contentFormat).toBe('markdown');
    });

    it('converts HTML lists to markdown', async () => {
      const client = mockClient({
        getNoteWithContent: vi.fn().mockResolvedValue({
          ...baseNote,
          content: '<ul><li>Item 1</li><li>Item 2</li></ul>',
        }),
      });

      const result = JSON.parse(await getNote(client, { noteId: 'abc123', includeContent: true }));
      expect(result.content).toContain('* Item 1');
      expect(result.content).toContain('* Item 2');
    });

    it('converts HTML links to markdown', async () => {
      const client = mockClient({
        getNoteWithContent: vi.fn().mockResolvedValue({
          ...baseNote,
          content: '<p><a href="https://example.com">Click here</a></p>',
        }),
      });

      const result = JSON.parse(await getNote(client, { noteId: 'abc123', includeContent: true }));
      expect(result.content).toContain('[Click here](https://example.com)');
    });

    it('converts complex HTML with mixed elements', async () => {
      const client = mockClient({
        getNoteWithContent: vi.fn().mockResolvedValue({
          ...baseNote,
          content: '<h2>Meeting Notes</h2><p>Discussed <strong>Q4 goals</strong>:</p><ul><li>Revenue targets</li><li>Hiring plan</li></ul>',
        }),
      });

      const result = JSON.parse(await getNote(client, { noteId: 'abc123', includeContent: true }));
      expect(result.content).toContain('Meeting Notes');
      expect(result.content).toContain('**Q4 goals**');
      expect(result.content).toContain('* Revenue targets');
      expect(result.content).toContain('* Hiring plan');
      expect(result.contentFormat).toBe('markdown');
    });
  });

  describe('non-text notes', () => {
    it('returns code note content as-is', async () => {
      const codeContent = 'function hello() { return "world"; }';
      const client = mockClient({
        getNoteWithContent: vi.fn().mockResolvedValue({
          ...baseNote,
          type: 'code',
          mime: 'application/javascript',
          content: codeContent,
        }),
      });

      const result = JSON.parse(await getNote(client, { noteId: 'abc123', includeContent: true }));
      expect(result.content).toBe(codeContent);
      expect(result.contentFormat).toBe('raw');
    });

    it('returns image note content as-is', async () => {
      const client = mockClient({
        getNoteWithContent: vi.fn().mockResolvedValue({
          ...baseNote,
          type: 'image',
          mime: 'image/png',
          content: 'binary-data',
        }),
      });

      const result = JSON.parse(await getNote(client, { noteId: 'abc123', includeContent: true }));
      expect(result.content).toBe('binary-data');
      expect(result.contentFormat).toBe('raw');
    });
  });

  describe('without content', () => {
    it('returns metadata only when includeContent is false', async () => {
      const client = mockClient({
        getNote: vi.fn().mockResolvedValue(baseNote),
      });

      const result = JSON.parse(await getNote(client, { noteId: 'abc123', includeContent: false }));
      expect(result.noteId).toBe('abc123');
      expect(result.title).toBe('Test Note');
      expect(result.content).toBeUndefined();
      expect(result.contentFormat).toBeUndefined();
    });
  });

  describe('pagination', () => {
    it('returns full content and truncated:false when no pagination params given', async () => {
      const client = mockClient({
        getNoteWithContent: vi.fn().mockResolvedValue({
          ...baseNote,
          content: '<p>Hello world</p>',
        }),
      });

      const result = JSON.parse(await getNote(client, { noteId: 'abc123', includeContent: true }));
      expect(result.content).toBe('Hello world');
      expect(result.contentLength).toBe('Hello world'.length);
      expect(result.truncated).toBe(false);
      expect(result.nextStart).toBeUndefined();
    });

    it('slices content and reports truncated:true with nextStart when contentMaxChars is less than length', async () => {
      const client = mockClient({
        getNoteWithContent: vi.fn().mockResolvedValue({
          ...baseNote,
          content: '<p>Hello world</p>',
        }),
      });

      const result = JSON.parse(
        await getNote(client, { noteId: 'abc123', includeContent: true, contentMaxChars: 5 })
      );
      expect(result.content).toBe('Hello');
      expect(result.contentLength).toBe('Hello world'.length);
      expect(result.truncated).toBe(true);
      expect(result.nextStart).toBe(5);
    });

    it('returns an empty slice without crashing when contentStart is past the end', async () => {
      const client = mockClient({
        getNoteWithContent: vi.fn().mockResolvedValue({
          ...baseNote,
          content: '<p>Hello world</p>',
        }),
      });

      const result = JSON.parse(
        await getNote(client, { noteId: 'abc123', includeContent: true, contentStart: 1000 })
      );
      expect(result.content).toBe('');
      expect(result.truncated).toBe(false);
    });
  });
});

describe('getRevisions', () => {
  it('lists revision metadata for a note', async () => {
    const client = mockClient({
      listRevisions: vi.fn().mockResolvedValue([
        {
          revisionId: 'rev2',
          noteId: 'abc123',
          type: 'text',
          mime: 'text/html',
          dateCreated: '2024-01-02',
          dateLastEdited: '2024-01-02',
        },
        {
          revisionId: 'rev1',
          noteId: 'abc123',
          type: 'text',
          mime: 'text/html',
          dateCreated: '2024-01-01',
          dateLastEdited: '2024-01-01',
        },
      ]),
    });

    const result = JSON.parse(await getRevisions(client, { noteId: 'abc123' }));
    expect(result.revisions).toHaveLength(2);
    expect(result.revisions[0].revisionId).toBe('rev2');
  });
});

describe('getRevision', () => {
  const revisionMeta = {
    revisionId: 'rev1',
    noteId: 'abc123',
    type: 'text',
    mime: 'text/html',
    dateCreated: '2024-01-01',
    dateLastEdited: '2024-01-01',
  };

  it('fetches metadata and content, converting text to markdown', async () => {
    const client = mockClient({
      getRevisionMetadata: vi.fn().mockResolvedValue(revisionMeta),
      getRevisionContent: vi.fn().mockResolvedValue('<h1>Old Version</h1>'),
    });

    const result = JSON.parse(await getRevision(client, { revisionId: 'rev1', includeContent: true }));
    expect(result.content).toContain('Old Version');
    expect(result.content).not.toContain('<h1>');
    expect(result.contentFormat).toBe('markdown');
  });

  it('does not fetch content when includeContent is false', async () => {
    const getRevisionContent = vi.fn();
    const client = mockClient({
      getRevisionMetadata: vi.fn().mockResolvedValue(revisionMeta),
      getRevisionContent,
    });

    const result = JSON.parse(await getRevision(client, { revisionId: 'rev1', includeContent: false }));
    expect(result.content).toBeUndefined();
    expect(getRevisionContent).not.toHaveBeenCalled();
  });
});
