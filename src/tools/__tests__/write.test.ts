import { describe, it, expect, vi } from 'vitest';
import { createNote, updateNote } from '../write.js';
import type { TriliumClient } from '../../trilium-client.js';

function mockClient(overrides: Record<string, unknown> = {}) {
  return {
    createNote: vi.fn().mockResolvedValue({
      note: { noteId: 'new123', title: 'Test', type: 'text' },
      branch: { branchId: 'branch1' },
    }),
    updateNoteTitle: vi.fn().mockResolvedValue({}),
    updateNoteContent: vi.fn().mockResolvedValue(undefined),
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
