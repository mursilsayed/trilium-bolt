import { describe, it, expect, vi } from 'vitest';
import { createNote, updateNote, patchNote, deleteAttribute } from '../write.js';
import type { TriliumClient } from '../../trilium-client.js';

function mockClient(overrides: Record<string, unknown> = {}) {
  return {
    createNote: vi.fn().mockResolvedValue({
      note: { noteId: 'new123', title: 'Test', type: 'text' },
      branch: { branchId: 'branch1' },
    }),
    updateNoteTitle: vi.fn().mockResolvedValue({}),
    updateNoteContent: vi.fn().mockResolvedValue(undefined),
    getNoteContent: vi.fn().mockResolvedValue(''),
    createAttribute: vi.fn().mockResolvedValue({ type: 'label', name: 'test', value: 'val' }),
    getNote: vi.fn().mockResolvedValue({ attributes: [] }),
    ...overrides,
  } as unknown as TriliumClient;
}

describe('createNote', () => {
  it('converts markdown to HTML by default', async () => {
    const client = mockClient();

    await createNote(client, {
      parentNoteId: 'root',
      title: 'Test',
      content: '# Hello\n\nThis is **bold**.',
      type: 'text',
    });

    const call = (client.createNote as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.content).toContain('<h1>');
    expect(call.content).toContain('Hello');
    expect(call.content).toContain('<strong>bold</strong>');
  });

  it('converts markdown to HTML when contentFormat is "markdown"', async () => {
    const client = mockClient();

    await createNote(client, {
      parentNoteId: 'root',
      title: 'Test',
      content: '- Item 1\n- Item 2',
      contentFormat: 'markdown',
      type: 'text',
    });

    const call = (client.createNote as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.content).toContain('<li>');
    expect(call.content).toContain('Item 1');
  });

  it('passes HTML through when contentFormat is "html"', async () => {
    const client = mockClient();
    const htmlContent = '<p>Already HTML</p>';

    await createNote(client, {
      parentNoteId: 'root',
      title: 'Test',
      content: htmlContent,
      contentFormat: 'html',
      type: 'text',
    });

    const call = (client.createNote as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.content).toBe(htmlContent);
  });
});

describe('updateNote', () => {
  it('converts markdown content to HTML by default', async () => {
    const client = mockClient();

    await updateNote(client, {
      noteId: 'abc123',
      content: '## Updated\n\nNew content with *emphasis*.',
    });

    const call = (client.updateNoteContent as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('abc123');
    expect(call[1]).toContain('<h2>');
    expect(call[1]).toContain('<em>emphasis</em>');
  });

  it('passes HTML through when contentFormat is "html"', async () => {
    const client = mockClient();
    const htmlContent = '<p>Raw HTML</p>';

    await updateNote(client, {
      noteId: 'abc123',
      content: htmlContent,
      contentFormat: 'html',
    });

    const call = (client.updateNoteContent as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1]).toBe(htmlContent);
  });
});

describe('patchNote', () => {
  it('replaces a unique literal match in markdown content', async () => {
    const client = mockClient({
      getNoteContent: vi.fn().mockResolvedValue('<h1>Phase 1</h1><p>Some text.</p>'),
    });

    const result = await patchNote(client, {
      noteId: 'abc123',
      search: 'Phase 1',
      replace: 'Phase 2',
      isRegex: false,
      contentFormat: 'markdown',
    });

    const call = (client.updateNoteContent as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('abc123');
    expect(call[1]).toContain('<h1>Phase 2</h1>');

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.matchCount).toBe(1);
    expect(parsed.occurrenceReplaced).toBe(1);
  });

  it('replaces raw HTML directly when contentFormat is "html"', async () => {
    const client = mockClient({
      getNoteContent: vi.fn().mockResolvedValue('<p>Hello world</p>'),
    });

    await patchNote(client, {
      noteId: 'abc123',
      search: 'world',
      replace: 'there',
      isRegex: false,
      contentFormat: 'html',
    });

    const call = (client.updateNoteContent as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1]).toBe('<p>Hello there</p>');
  });

  it('throws when search matches nothing', async () => {
    const client = mockClient({
      getNoteContent: vi.fn().mockResolvedValue('<p>Hello world</p>'),
    });

    await expect(
      patchNote(client, {
        noteId: 'abc123',
        search: 'missing',
        replace: 'x',
        isRegex: false,
        contentFormat: 'markdown',
      })
    ).rejects.toThrow('No match found');
  });

  it('throws when search matches more than once without an occurrence', async () => {
    const client = mockClient({
      getNoteContent: vi.fn().mockResolvedValue('<p>foo foo</p>'),
    });

    await expect(
      patchNote(client, {
        noteId: 'abc123',
        search: 'foo',
        replace: 'bar',
        isRegex: false,
        contentFormat: 'markdown',
      })
    ).rejects.toThrow('matches 2 locations');
  });

  it('replaces only the specified occurrence when disambiguated', async () => {
    const client = mockClient({
      getNoteContent: vi.fn().mockResolvedValue('<p>foo foo</p>'),
    });

    await patchNote(client, {
      noteId: 'abc123',
      search: 'foo',
      replace: 'bar',
      isRegex: false,
      occurrence: 2,
      contentFormat: 'html',
    });

    const call = (client.updateNoteContent as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1]).toBe('<p>foo bar</p>');
  });

  it('throws when occurrence is out of range', async () => {
    const client = mockClient({
      getNoteContent: vi.fn().mockResolvedValue('<p>foo foo</p>'),
    });

    await expect(
      patchNote(client, {
        noteId: 'abc123',
        search: 'foo',
        replace: 'bar',
        isRegex: false,
        occurrence: 5,
        contentFormat: 'html',
      })
    ).rejects.toThrow('out of range');
  });

  it('supports regex search', async () => {
    const client = mockClient({
      getNoteContent: vi.fn().mockResolvedValue('<p>call user123 now</p>'),
    });

    await patchNote(client, {
      noteId: 'abc123',
      search: 'user\\d+',
      replace: 'user456',
      isRegex: true,
      contentFormat: 'html',
    });

    const call = (client.updateNoteContent as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1]).toBe('<p>call user456 now</p>');
  });
});

describe('deleteAttribute', () => {
  it('deletes a matching attribute successfully', async () => {
    const client = mockClient({
      getNote: vi.fn().mockResolvedValue({
        attributes: [
          { attributeId: 'attr1', type: 'label', name: 'priority', value: 'high' },
        ],
      }),
      deleteAttribute: vi.fn().mockResolvedValue(undefined),
    });

    const result = await deleteAttribute(client, {
      noteId: 'note1',
      attributeName: 'priority',
    });

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.attributeId).toBe('attr1');
    expect((client.deleteAttribute as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('attr1');
  });

  it('throws when attribute is not found', async () => {
    const client = mockClient({
      getNote: vi.fn().mockResolvedValue({ attributes: [] }),
    });

    await expect(
      deleteAttribute(client, { noteId: 'note1', attributeName: 'missing' })
    ).rejects.toThrow('not found');
  });
});
