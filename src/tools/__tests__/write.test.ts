import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
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
    getNote: vi.fn().mockResolvedValue({ attributes: [], type: 'text', utcDateModified: 'after-write' }),
    ...overrides,
  } as unknown as TriliumClient;
}

const DOT_CONTENT =
  'digraph Map { a [label=<<B>x</B> & "y"> pos="1.5,2!"] } // *not* _markdown_ \\N \\\\ $& $1 → “é” 📌\n';

function codeNote(utcDateModified = 'v1') {
  return { attributes: [], type: 'code', mime: 'text/plain', utcDateModified };
}

describe('non-text notes are stored unchanged', () => {
  it('createNote stores code content unchanged with the default contentFormat', async () => {
    const client = mockClient();

    await createNote(client, {
      parentNoteId: 'root',
      title: 'Map',
      content: DOT_CONTENT,
      contentFormat: 'markdown',
      type: 'code',
      mime: 'text/plain',
    });

    const call = (client.createNote as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.content).toBe(DOT_CONTENT);
  });

  it('createNote accepts the canvas type and stores its content unchanged', async () => {
    const client = mockClient();
    const canvas = '{"elements":[{"text":"*a*"}]}';

    await createNote(client, {
      parentNoteId: 'root',
      title: 'Layout',
      content: canvas,
      contentFormat: 'markdown',
      type: 'canvas',
    });

    const call = (client.createNote as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.type).toBe('canvas');
    expect(call.content).toBe(canvas);
  });

  it('updateNote stores code content unchanged with the default contentFormat', async () => {
    const client = mockClient({ getNote: vi.fn().mockResolvedValue(codeNote()) });

    await updateNote(client, { noteId: 'abc123', content: DOT_CONTENT, contentFormat: 'markdown' });

    expect(client.updateNoteContent).toHaveBeenCalledWith('abc123', DOT_CONTENT);
  });

  it('patchNote changes only the matched characters of a code note', async () => {
    const client = mockClient({
      getNote: vi.fn().mockResolvedValue(codeNote()),
      getNoteContent: vi.fn().mockResolvedValue(DOT_CONTENT),
    });

    await patchNote(client, {
      noteId: 'abc123',
      search: '*not*',
      replace: '*now*',
      isRegex: false,
      contentFormat: 'markdown',
    });

    expect(client.updateNoteContent).toHaveBeenCalledWith(
      'abc123',
      DOT_CONTENT.replace('*not*', '*now*')
    );
  });

  it('patchNote treats $& and $1 in the replacement as literal text', async () => {
    const client = mockClient({
      getNote: vi.fn().mockResolvedValue(codeNote()),
      getNoteContent: vi.fn().mockResolvedValue('a b'),
    });

    await patchNote(client, {
      noteId: 'abc123',
      search: 'b',
      replace: '$& $1',
      isRegex: false,
      contentFormat: 'markdown',
    });

    expect(client.updateNoteContent).toHaveBeenCalledWith('abc123', 'a $& $1');
  });
});

describe('updateNote with empty content', () => {
  it('clears the note', async () => {
    const client = mockClient();

    const parsed = JSON.parse(await updateNote(client, { noteId: 'abc123', content: '' }));

    expect(client.updateNoteContent).toHaveBeenCalledWith('abc123', '');
    expect(parsed.updated).toEqual(['content']);
  });

  it('still rejects a call with nothing to update', async () => {
    const client = mockClient();

    await expect(updateNote(client, { noteId: 'abc123' })).rejects.toThrow('At least one of');
  });
});

describe('writes return utcDateModified from after the write', () => {
  it('createNote reads it after attributes are written', async () => {
    const order: string[] = [];
    const client = mockClient({
      createAttribute: vi.fn(async () => {
        order.push('createAttribute');
        return { type: 'label', name: 'a', value: '' };
      }),
      getNote: vi.fn(async () => {
        order.push('getNote');
        return { attributes: [], utcDateModified: 'after-write' };
      }),
    });

    const parsed = JSON.parse(
      await createNote(client, {
        parentNoteId: 'root',
        title: 'Test',
        content: 'x',
        type: 'text',
        attributes: [{ type: 'label', name: 'a', value: '', isInheritable: false }],
      })
    );

    expect(parsed.utcDateModified).toBe('after-write');
    expect(order).toEqual(['createAttribute', 'getNote']);
  });

  it('updateNote returns the new value, not the one it checked', async () => {
    const client = mockClient({
      getNote: vi
        .fn()
        .mockResolvedValueOnce(codeNote('v1'))
        .mockResolvedValueOnce(codeNote('v2')),
    });

    const parsed = JSON.parse(
      await updateNote(client, {
        noteId: 'abc123',
        content: DOT_CONTENT,
        expectedUtcDateModified: 'v1',
      })
    );

    expect(parsed.utcDateModified).toBe('v2');
  });

  it('updateNote reads it after attributes are written', async () => {
    const order: string[] = [];
    const client = mockClient({
      createAttribute: vi.fn(async () => {
        order.push('createAttribute');
        return {};
      }),
      getNote: vi.fn(async () => {
        order.push('getNote');
        return { attributes: [], utcDateModified: 'after-write' };
      }),
    });

    await updateNote(client, {
      noteId: 'abc123',
      attributes: [{ type: 'label', name: 'a', value: '', isInheritable: false }],
    });

    expect(order).toEqual(['getNote', 'createAttribute', 'getNote']);
  });

  it('patchNote returns the new value', async () => {
    const client = mockClient({
      getNoteContent: vi.fn().mockResolvedValue('<p>Hello world</p>'),
    });

    const parsed = JSON.parse(
      await patchNote(client, {
        noteId: 'abc123',
        search: 'world',
        replace: 'there',
        isRegex: false,
        contentFormat: 'html',
      })
    );

    expect(parsed.utcDateModified).toBe('after-write');
  });

  it('reports success with null when the read after a write fails', async () => {
    const client = mockClient({ getNote: vi.fn().mockRejectedValue(new Error('down')) });

    const parsed = JSON.parse(
      await createNote(client, { parentNoteId: 'root', title: 'Test', content: 'x', type: 'text' })
    );

    expect(parsed.success).toBe(true);
    expect(parsed.utcDateModified).toBeNull();
  });
});

describe('contentFilePath', () => {
  let root: string;
  let outside: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'bolt-content-'));
    outside = await mkdtemp(join(tmpdir(), 'bolt-outside-'));
    vi.stubEnv('TRILIUM_CONTENT_DIR', root);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  it('createNote stores a file unchanged in a code note', async () => {
    await writeFile(join(root, 'map.dot'), DOT_CONTENT);
    const client = mockClient();

    await createNote(client, {
      parentNoteId: 'root',
      title: 'Map',
      contentFilePath: join(root, 'map.dot'),
      contentFormat: 'markdown',
      type: 'code',
    });

    const call = (client.createNote as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.content).toBe(DOT_CONTENT);
  });

  it('updateNote resolves a relative path against the allowed folder', async () => {
    await writeFile(join(root, 'map.dot'), DOT_CONTENT);
    const client = mockClient({ getNote: vi.fn().mockResolvedValue(codeNote()) });

    await updateNote(client, { noteId: 'abc123', contentFilePath: 'map.dot' });

    expect(client.updateNoteContent).toHaveBeenCalledWith('abc123', DOT_CONTENT);
  });

  it('keeps a byte order mark', async () => {
    await writeFile(join(root, 'bom.txt'), '﻿abc');
    const client = mockClient({ getNote: vi.fn().mockResolvedValue(codeNote()) });

    await updateNote(client, { noteId: 'abc123', contentFilePath: 'bom.txt' });

    expect(client.updateNoteContent).toHaveBeenCalledWith('abc123', '﻿abc');
  });

  it('rejects content and contentFilePath together, before writing anything', async () => {
    await writeFile(join(root, 'map.dot'), DOT_CONTENT);
    const client = mockClient();

    await expect(
      updateNote(client, { noteId: 'abc123', title: 'New', content: 'x', contentFilePath: 'map.dot' })
    ).rejects.toThrow('not both');

    expect(client.updateNoteTitle).not.toHaveBeenCalled();
  });

  it('createNote rejects a call with neither', async () => {
    await expect(
      createNote(mockClient(), { parentNoteId: 'root', title: 'Test', type: 'text' })
    ).rejects.toThrow('must be provided');
  });

  it('is disabled when TRILIUM_CONTENT_DIR is not set', async () => {
    vi.stubEnv('TRILIUM_CONTENT_DIR', '');
    await writeFile(join(root, 'map.dot'), DOT_CONTENT);

    await expect(
      updateNote(mockClient(), { noteId: 'abc123', contentFilePath: join(root, 'map.dot') })
    ).rejects.toThrow('disabled');
  });

  it('rejects an absolute path outside the folder', async () => {
    await writeFile(join(outside, 'secret'), 'secret');

    await expect(
      updateNote(mockClient(), { noteId: 'abc123', contentFilePath: join(outside, 'secret') })
    ).rejects.toThrow('outside the folder');
  });

  it('rejects a relative path that climbs out of the folder', async () => {
    await writeFile(join(outside, 'secret'), 'secret');

    await expect(
      updateNote(mockClient(), {
        noteId: 'abc123',
        contentFilePath: join('..', basename(outside), 'secret'),
      })
    ).rejects.toThrow('outside the folder');
  });

  it('rejects a symbolic link that leads out of the folder', async () => {
    await writeFile(join(outside, 'secret'), 'secret');
    await symlink(join(outside, 'secret'), join(root, 'link'));

    await expect(
      updateNote(mockClient(), { noteId: 'abc123', contentFilePath: 'link' })
    ).rejects.toThrow('outside the folder');
  });

  it('allows a file whose name starts with two dots', async () => {
    await writeFile(join(root, '..notes'), 'x');
    const client = mockClient({ getNote: vi.fn().mockResolvedValue(codeNote()) });

    await updateNote(client, { noteId: 'abc123', contentFilePath: '..notes' });

    expect(client.updateNoteContent).toHaveBeenCalledWith('abc123', 'x');
  });

  it('rejects a folder', async () => {
    await expect(
      updateNote(mockClient(), { noteId: 'abc123', contentFilePath: '.' })
    ).rejects.toThrow('not a regular file');
  });

  it('rejects a file that is not valid UTF-8 rather than corrupting it', async () => {
    await writeFile(join(root, 'image.png'), Buffer.from([0x89, 0x50, 0xff, 0xfe]));
    const client = mockClient({ getNote: vi.fn().mockResolvedValue(codeNote()) });

    await expect(
      updateNote(client, { noteId: 'abc123', contentFilePath: 'image.png' })
    ).rejects.toThrow('not valid UTF-8');

    expect(client.updateNoteContent).not.toHaveBeenCalled();
  });
});

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

describe('updateNote optimistic concurrency', () => {
  it('proceeds normally when expectedUtcDateModified matches', async () => {
    const client = mockClient({
      getNote: vi.fn().mockResolvedValue({ attributes: [], utcDateModified: 'v1' }),
    });

    const result = await updateNote(client, {
      noteId: 'abc123',
      title: 'New Title',
      expectedUtcDateModified: 'v1',
    });

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(client.updateNoteTitle).toHaveBeenCalledWith('abc123', 'New Title');
  });

  it('throws and does not write when expectedUtcDateModified does not match', async () => {
    const client = mockClient({
      getNote: vi.fn().mockResolvedValue({ attributes: [], utcDateModified: 'v2' }),
    });

    await expect(
      updateNote(client, {
        noteId: 'abc123',
        title: 'New Title',
        expectedUtcDateModified: 'v1',
      })
    ).rejects.toThrow('changed since last read');

    expect(client.updateNoteTitle).not.toHaveBeenCalled();
  });

  it('reads the note only after the write when no check, attributes or conversion need it', async () => {
    const getNote = vi.fn().mockResolvedValue({ attributes: [], utcDateModified: 'after-write' });
    const client = mockClient({ getNote });

    await updateNote(client, { noteId: 'abc123', content: '<p>x</p>', contentFormat: 'html' });

    expect(getNote).toHaveBeenCalledTimes(1);
    expect(getNote.mock.invocationCallOrder[0]).toBeGreaterThan(
      (client.updateNoteContent as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]
    );
  });
});

describe('patchNote optimistic concurrency', () => {
  it('proceeds normally when expectedUtcDateModified matches', async () => {
    const client = mockClient({
      getNoteContent: vi.fn().mockResolvedValue('<p>Hello world</p>'),
      getNote: vi.fn().mockResolvedValue({ utcDateModified: 'v1' }),
    });

    const result = await patchNote(client, {
      noteId: 'abc123',
      search: 'world',
      replace: 'there',
      isRegex: false,
      contentFormat: 'html',
      expectedUtcDateModified: 'v1',
    });

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(client.updateNoteContent).toHaveBeenCalledWith('abc123', '<p>Hello there</p>');
  });

  it('throws and does not write when expectedUtcDateModified does not match', async () => {
    const client = mockClient({
      getNoteContent: vi.fn().mockResolvedValue('<p>Hello world</p>'),
      getNote: vi.fn().mockResolvedValue({ utcDateModified: 'v2' }),
    });

    await expect(
      patchNote(client, {
        noteId: 'abc123',
        search: 'world',
        replace: 'there',
        isRegex: false,
        contentFormat: 'html',
        expectedUtcDateModified: 'v1',
      })
    ).rejects.toThrow('changed since last read');

    expect(client.updateNoteContent).not.toHaveBeenCalled();
  });

  it('reads the note only after the write when format is html and no check is requested', async () => {
    const getNote = vi.fn().mockResolvedValue({ attributes: [], utcDateModified: 'after-write' });
    const client = mockClient({
      getNoteContent: vi.fn().mockResolvedValue('<p>Hello world</p>'),
      getNote,
    });

    await patchNote(client, {
      noteId: 'abc123',
      search: 'world',
      replace: 'there',
      isRegex: false,
      contentFormat: 'html',
    });

    expect(getNote).toHaveBeenCalledTimes(1);
    expect(getNote.mock.invocationCallOrder[0]).toBeGreaterThan(
      (client.updateNoteContent as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]
    );
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
