/**
 * Shared types for trilium-bolt
 */

export interface Note {
  noteId: string;
  title: string;
  type: string;
  mime: string;
  isProtected: boolean;
  dateCreated: string;
  dateModified: string;
  utcDateCreated: string;
  utcDateModified: string;
  parentNoteIds: string[];
  childNoteIds: string[];
  parentBranchIds: string[];
  childBranchIds: string[];
  attributes: Attribute[];
}

export interface NoteWithContent extends Note {
  content: string;
}

export interface Attribute {
  attributeId: string;
  noteId: string;
  type: 'label' | 'relation';
  name: string;
  value: string;
  position: number;
  isInheritable: boolean;
}

export interface Branch {
  branchId: string;
  noteId: string;
  parentNoteId: string;
  notePosition: number;
  prefix: string | null;
  isExpanded: boolean;
}

export interface SearchResult {
  noteId: string;
  title: string;
  type: string;
  isProtected: boolean;
}

export interface AttributeInput {
  type: 'label' | 'relation';
  name: string;
  value: string;
  isInheritable?: boolean;
}

export interface CreateNoteParams {
  parentNoteId: string;
  title: string;
  type: 'text' | 'code' | 'file' | 'image' | 'search' | 'book' | 'relationMap' | 'render';
  content: string;
  mime?: string;
}

export interface CreateNoteResponse {
  note: Note;
  branch: Branch;
}

export interface TriliumError {
  status: number;
  code: string;
  message: string;
}
