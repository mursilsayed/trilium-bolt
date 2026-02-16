/**
 * Simple fetch-based ETAPI client for Trilium Notes
 */

import type {
  Note,
  NoteWithContent,
  Attribute,
  AttributeInput,
  SearchResult,
  CreateNoteParams,
  CreateNoteResponse,
} from './types.js';

export class TriliumClient {
  private baseUrl: string;
  private token: string;

  constructor() {
    this.token = process.env.TRILIUM_TOKEN || '';
    this.baseUrl = process.env.TRILIUM_URL || 'http://localhost:37840';

    if (!this.token) {
      throw new Error(
        'TRILIUM_TOKEN is required. Get your token from Trilium: Options → ETAPI'
      );
    }

    // Remove trailing slash if present
    this.baseUrl = this.baseUrl.replace(/\/$/, '');
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}/etapi${endpoint}`;

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: this.token,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      let errorMessage: string;
      try {
        const errorBody = (await response.json()) as { message?: string };
        errorMessage = errorBody.message || response.statusText;
      } catch {
        errorMessage = response.statusText;
      }

      if (response.status === 401) {
        throw new Error(
          `Authentication failed. Check your TRILIUM_TOKEN. (${errorMessage})`
        );
      }

      if (response.status === 404) {
        throw new Error(`Not found: ${endpoint} (${errorMessage})`);
      }

      throw new Error(`Trilium API error (${response.status}): ${errorMessage}`);
    }

    // Handle empty responses (e.g., DELETE)
    const text = await response.text();
    if (!text) {
      return {} as T;
    }

    return JSON.parse(text) as T;
  }

  /**
   * Search notes using Trilium's search syntax
   */
  async searchNotes(query: string, limit = 100): Promise<SearchResult[]> {
    const params = new URLSearchParams({
      search: query,
      limit: limit.toString(),
    });

    const results = await this.request<{ results: SearchResult[] }>(
      'GET',
      `/notes?${params}`
    );

    return results.results || [];
  }

  /**
   * Get a note by ID (metadata only)
   */
  async getNote(noteId: string): Promise<Note> {
    return this.request<Note>('GET', `/notes/${noteId}`);
  }

  /**
   * Get a note's content
   */
  async getNoteContent(noteId: string): Promise<string> {
    const url = `${this.baseUrl}/etapi/notes/${noteId}/content`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: this.token,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get note content: ${response.statusText}`);
    }

    return response.text();
  }

  /**
   * Get a note with its content
   */
  async getNoteWithContent(noteId: string): Promise<NoteWithContent> {
    const [note, content] = await Promise.all([
      this.getNote(noteId),
      this.getNoteContent(noteId),
    ]);

    return { ...note, content };
  }

  /**
   * Get children of a note
   */
  async getNoteChildren(noteId: string): Promise<Note[]> {
    const note = await this.getNote(noteId);
    const children = await Promise.all(
      note.childNoteIds.map((id) => this.getNote(id))
    );
    return children;
  }

  /**
   * Create a new note
   */
  async createNote(params: CreateNoteParams): Promise<CreateNoteResponse> {
    return this.request<CreateNoteResponse>('POST', '/create-note', {
      parentNoteId: params.parentNoteId,
      title: params.title,
      type: params.type,
      content: params.content,
      mime: params.mime,
    });
  }

  /**
   * Update a note's title
   */
  async updateNoteTitle(noteId: string, title: string): Promise<Note> {
    return this.request<Note>('PATCH', `/notes/${noteId}`, { title });
  }

  /**
   * Update a note's content
   */
  async updateNoteContent(noteId: string, content: string): Promise<void> {
    const url = `${this.baseUrl}/etapi/notes/${noteId}/content`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: this.token,
        'Content-Type': 'text/plain',
      },
      body: content,
    });

    if (!response.ok) {
      throw new Error(`Failed to update note content: ${response.statusText}`);
    }
  }

  /**
   * Create an attribute on a note
   */
  async createAttribute(noteId: string, attr: AttributeInput): Promise<Attribute> {
    return this.request<Attribute>('POST', '/attributes', {
      noteId,
      type: attr.type,
      name: attr.name,
      value: attr.value,
      isInheritable: attr.isInheritable ?? false,
    });
  }

  /**
   * Update an existing attribute
   */
  async updateAttribute(attributeId: string, value: string): Promise<Attribute> {
    return this.request<Attribute>('PATCH', `/attributes/${attributeId}`, { value });
  }

  /**
   * Delete a note
   */
  async deleteNote(noteId: string): Promise<void> {
    await this.request<void>('DELETE', `/notes/${noteId}`);
  }
}
