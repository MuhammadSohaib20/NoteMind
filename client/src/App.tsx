import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { NoteList } from './components/NoteList';
import { NoteEditor } from './components/NoteEditor';
import { NoteView } from './components/NoteView';
import { RagView } from './components/RagView';
import { CollectionsView } from './components/CollectionsView';
import { SettingsView } from './components/SettingsView';
import { AuthModal } from './components/AuthModal';
import { CollectionModal } from './components/CollectionModal';
import { TagModal } from './components/TagModal';
import { UploadModal } from './components/UploadModal';
import { useNotes } from './hooks/useNotes';
import { useCollections } from './hooks/useCollections';
import { useTags } from './hooks/useTags';
import { Note, Collection, Tag, ViewMode, GENERAL_COLLECTION_FILTER } from './types';
import { Trash2, RotateCcw, Menu, Brain } from 'lucide-react';
import { ThemeToggle } from './components/ThemeToggle';
import { UserProfileMenu } from './components/UserProfileMenu';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

// Build version — bump on every client build so stale tabs can be detected.
// Shown in the footer so you can tell at a glance whether your tab is current.
const BUILD_VERSION = '2';

const WorkspaceApp: React.FC = () => {
  const { isAuthenticated, user } = useAuth();

  // Current active view matching the 7 screens
  const [activeView, setActiveView] = useState<ViewMode>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Filtering & Selection State
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [selectedTagName, setSelectedTagName] = useState<string | null>(null);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Reset state when user changes
  React.useEffect(() => {
    setSelectedCollectionId(null);
    setSelectedTagName(null);
    setSelectedNote(null);
    setSearchQuery('');
    setActiveView('dashboard');
  }, [user?.id]);

  // Version guard: in dev the server is restarted to pick up backend changes,
  // and an already-open tab would silently keep running older frontend code
  // (e.g. the pre-streaming chat UI). Poll the server's boot stamp and reload
  // once when it changes, so the page can never be paired with a server build
  // it does not match. A restart mid-offline is recovered by the next poll.
  React.useEffect(() => {
    let lastStamp: string | null = null;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch('/health');
        if (!res.ok) return;
        const body = await res.json();
        const stamp = body?.startedAt != null ? String(body.startedAt) : '';
        if (!stamp) return;
        if (lastStamp === null) {
          lastStamp = stamp;
          return;
        }
        if (stamp !== lastStamp && !cancelled) {
          console.log('[notemind] server restarted — reloading to pick up the matching build');
          window.location.reload();
        }
      } catch {
        /* server briefly unreachable mid-restart; the next poll recovers */
      }
    };
    poll();
    const id = window.setInterval(poll, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // Modals State
  const [isCollectionModalOpen, setIsCollectionModalOpen] = useState(false);
  const [collectionToEdit, setCollectionToEdit] = useState<Collection | null>(null);

  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [tagToEdit, setTagToEdit] = useState<Tag | null>(null);

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  // API Hooks
  const { collections, createCollection, updateCollection, deleteCollection } = useCollections();
  const { tags, createTag, updateTag, deleteTag } = useTags();
  const {
    notes,
    isLoading: isNotesLoading,
    createNote,
    uploadNote,
    updateNote,
    deleteNote,
    trashedNotes,
    isTrashLoading,
    isTrashError,
    refetchTrash,
    restoreNote,
    permanentlyDeleteNote,
    indexNotes,
  } = useNotes(
    selectedCollectionId || undefined,
    selectedTagName || undefined,
    searchQuery || undefined
  );

  // Also fetch all notes unfiltered for Dashboard & Ask My Notes
  const { notes: allNotes } = useNotes();

  if (!isAuthenticated) {
    return <AuthModal key="auth-modal-unauthenticated" />;
  }

  // Open Create New Note Screen (Screen 3)
  const handleCreateNewNote = () => {
    setSelectedNote({
      id: '',
      title: '',
      content: '',
      collectionId: selectedCollectionId === GENERAL_COLLECTION_FILTER ? null : selectedCollectionId,
      collection_id: selectedCollectionId === GENERAL_COLLECTION_FILTER ? null : selectedCollectionId,
      tags: selectedTagName ? [selectedTagName] : [],
    });
    setActiveView('create-note');
  };

  // Open Edit Note Screen (Screen 3)
  const handleEditNote = (note: Note) => {
    setSelectedNote(note);
    setActiveView('create-note');
  };

  // Open Note Read View (Screen 6)
  const handleOpenNoteView = (note: Note) => {
    setSelectedNote(note);
    setActiveView('note-detail');
  };

  // Save Note Action
  const handleSaveNote = async (payload: {
    id?: string;
    title: string;
    content: string;
    collectionId?: string;
    tags?: string[];
  }) => {
    if (payload.id && payload.id.trim() !== '') {
      const updated = await updateNote({ id: payload.id, ...payload });
      if (updated) {
        setSelectedNote(updated);
        setActiveView('note-detail');
      }
    } else {
      const created = await createNote(payload);
      if (created) {
        setSelectedNote(created);
        setActiveView('note-detail');
      }
    }
  };

  // Upload File Action from NoteEditor
  const handleUploadFileFromEditor = async (payload: {
    file: File;
    collectionId?: string;
    tags?: string[];
  }) => {
    const created = await uploadNote(payload);
    if (created) {
      setSelectedNote(created);
      setActiveView('note-detail');
    }
    return created;
  };

  // Move a note to Trash.
  const handleDeleteNote = async (id: string) => {
    await deleteNote(id);
    if (selectedNote?.id === id) {
      setSelectedNote(null);
      setActiveView('notes');
    }
  };

  // Restore a note without recreating it so its file and metadata remain intact.
  const handleRestoreNote = async (note: Note) => {
    await restoreNote(note.id);
    setSelectedNote(note);
    setActiveView('note-detail');
  };

  // Collection Modal Actions
  const handleOpenCollectionModal = (col?: Collection) => {
    setCollectionToEdit(col || null);
    setIsCollectionModalOpen(true);
  };

  const handleSaveCollection = async (name: string, id?: string) => {
    if (id) {
      await updateCollection({ id, name });
    } else {
      await createCollection({ name });
    }
  };

  // Tag Modal Actions
  const handleOpenTagModal = (t?: Tag) => {
    setTagToEdit(t || null);
    setIsTagModalOpen(true);
  };

  const handleDeleteTag = async (tagId: string) => {
    const targetTag = tags.find((t) => t.id === tagId);
    await deleteTag(tagId);
    if (
      targetTag &&
      selectedTagName &&
      selectedTagName.toLowerCase() === targetTag.name.toLowerCase()
    ) {
      setSelectedTagName(null);
    }
  };

  // Update tags on a specific note inline (from NoteView or NoteList)
  const handleUpdateNoteTags = async (noteId: string, updatedTags: string[]) => {
    const updated = await updateNote({ id: noteId, tags: updatedTags });
    if (updated && selectedNote?.id === noteId) {
      setSelectedNote(updated);
    }
  };

  // Filter by Tag and switch to My Notes
  const handleSelectTagFilter = (tagName: string) => {
    setSelectedTagName(tagName);
    setSelectedCollectionId(null);
    setActiveView('notes');
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#F8FAFC] dark:bg-[#0F172A] font-sans text-slate-900 dark:text-slate-100 transition-colors">
      {/* Shared Left Sidebar */}
      <Sidebar
        collections={collections}
        tags={tags}
        activeView={activeView}
        selectedCollectionId={selectedCollectionId}
        selectedTagName={selectedTagName}
        onNavigate={(view) => setActiveView(view)}
        onSelectCollection={setSelectedCollectionId}
        onSelectTag={setSelectedTagName}
        onOpenCollectionModal={handleOpenCollectionModal}
        onDeleteCollection={deleteCollection}
        onOpenTagModal={handleOpenTagModal}
        onDeleteTag={handleDeleteTag}
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Fixed Global Top Bar across EVERY page */}
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 px-4 sm:px-8 py-3 flex items-center justify-between shrink-0 z-20">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-xs md:hidden">
                <Brain className="w-3.5 h-3.5" />
              </div>
              <span className="font-bold text-slate-900 dark:text-white text-base tracking-tight">
                {activeView === 'dashboard'
                  ? 'Home'
                  : activeView === 'notes'
                  ? 'My Notes'
                  : activeView === 'create-note'
                  ? selectedNote?.id ? 'Edit Note' : 'Create Note'
                  : activeView === 'note-detail'
                  ? 'Note Reader'
                  : activeView === 'ask-ai'
                  ? 'Ask My Notes'
                  : activeView === 'collections'
                  ? 'Collections'
                  : activeView === 'settings'
                  ? 'Settings'
                  : activeView === 'trash'
                  ? 'Trash'
                  : 'NoteMind'}
              </span>
            </div>
          </div>

          {/* Top Right: Night Mode Button + User Account DP & Name Button */}
          <div className="flex items-center gap-3">
            <ThemeToggle variant="button" />
            <UserProfileMenu onNavigate={setActiveView} />
          </div>
        </header>

        {/* View Content Wrapper */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">

      {/* Screen 2: Dashboard (Home) */}
      {activeView === 'dashboard' && (
        <DashboardView
          notes={allNotes}
          tags={tags}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onNavigate={setActiveView}
          onCreateNewNote={handleCreateNewNote}
          onOpenUploadModal={() => setIsUploadModalOpen(true)}
          onSelectTagFilter={handleSelectTagFilter}
        />
      )}

      {/* My Notes / Manage Notes & Tag Search View */}
      {activeView === 'notes' && (
        <NoteList
          notes={notes}
          allNotes={allNotes}
          collections={collections}
          tags={tags}
          selectedCollectionId={selectedCollectionId}
          selectedTagName={selectedTagName}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSelectCollection={setSelectedCollectionId}
          onSelectTag={setSelectedTagName}
          onSelectNote={handleOpenNoteView}
          onEditNote={handleEditNote}
          onDeleteNote={handleDeleteNote}
          onCreateNewNote={handleCreateNewNote}
          onOpenUploadModal={() => setIsUploadModalOpen(true)}
          onOpenTagModal={() => handleOpenTagModal()}
          onUpdateNoteTags={handleUpdateNoteTags}
          onIndexNote={async (noteId) => {
            try {
              await indexNotes({ noteIds: [noteId] });
            } catch (error) {
              console.error('Failed to index note:', error);
            }
          }}
          onIndexNotes={async (noteIds) => {
            try {
              await indexNotes({ noteIds });
            } catch (error) {
              console.error('Failed to index notes:', error);
            }
          }}
          isLoading={isNotesLoading}
        />
      )}

      {/* Screen 3: Create / Edit Note */}
      {activeView === 'create-note' && (
        <NoteEditor
          activeNote={selectedNote}
          collections={collections}
          availableTags={tags}
          onSave={handleSaveNote}
          onUploadFile={handleUploadFileFromEditor}
          onCancel={() => {
            if (selectedNote?.id) {
              setActiveView('note-detail');
            } else {
              setActiveView('dashboard');
            }
          }}
          onOpenNewCollection={() => handleOpenCollectionModal()}
        />
      )}

      {/* Screen 6: Note View (Manual Reader Mode) */}
      {activeView === 'note-detail' && selectedNote && (
        <NoteView
          note={
            allNotes.find((n) => n.id === selectedNote.id) ||
            notes.find((n) => n.id === selectedNote.id) ||
            selectedNote
          }
          allNotes={notes.length > 0 ? notes : allNotes}
          availableTags={tags}
          onBack={() => setActiveView('notes')}
          onSelectNote={handleOpenNoteView}
          onEdit={handleEditNote}
          onDelete={handleDeleteNote}
          onClickTag={handleSelectTagFilter}
          onUpdateNoteTags={handleUpdateNoteTags}
          onUpdateNote={async (payload) => {
            const updated = await updateNote(payload);
            if (updated && selectedNote?.id === payload.id) {
              setSelectedNote(updated);
            }
          }}
        />
      )}

      {/* Screen 4: Ask My Notes (AI Chat) */}
      {activeView === 'ask-ai' && (
        <RagView
          notes={allNotes}
          collections={collections}
          onSelectNote={handleOpenNoteView}
        />
      )}

      {/* Screen 5: Collections */}
      {activeView === 'collections' && (
        <CollectionsView
          collections={collections}
          onOpenNewCollection={() => handleOpenCollectionModal()}
          onEditCollection={(col) => handleOpenCollectionModal(col)}
          onDeleteCollection={deleteCollection}
          onSelectCollectionView={(colId) => {
            setSelectedCollectionId(colId);
            setSelectedTagName(null);
            setActiveView('notes');
          }}
        />
      )}

      {/* Screen 7: Settings / Profile */}
      {activeView === 'settings' && <SettingsView />}

      {/* Trash View */}
      {activeView === 'trash' && (
        <div className="flex-1 bg-[#F8FAFC] dark:bg-[#0B1120] flex flex-col h-screen overflow-y-auto">
          <div className="max-w-4xl w-full mx-auto py-8 px-4 sm:px-8 space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Trash</h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                Deleted notes stay here until you restore or permanently delete them.
              </p>
            </div>

            {isTrashLoading ? (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center text-sm text-slate-500 dark:text-slate-400">
                Loading trash...
              </div>
            ) : isTrashError ? (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-red-200 dark:border-red-900 p-8 text-center space-y-3">
                <p className="text-sm text-red-600 dark:text-red-400">Unable to load Trash.</p>
                <button
                  type="button"
                  onClick={() => void refetchTrash()}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  Try again
                </button>
              </div>
            ) : trashedNotes.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center mx-auto">
                  <Trash2 className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">Trash is empty</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Deleted notes will appear here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {trashedNotes.map((note) => (
                  <div
                    key={note.id}
                    className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{note.title}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">{note.content}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleRestoreNote(note)}
                        className="px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 text-xs font-semibold flex items-center gap-1.5 transition"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Restore</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Permanently delete "${note.title}"? This cannot be undone.`)) {
                            void permanentlyDeleteNote(note.id);
                          }
                        }}
                        className="px-3 py-1.5 rounded-xl bg-red-50 dark:bg-red-950/50 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 text-xs font-semibold transition"
                      >
                        Delete permanently
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

        </div>
      </div>

      {/* Collection Modal */}
      <CollectionModal
        isOpen={isCollectionModalOpen}
        onClose={() => {
          setIsCollectionModalOpen(false);
          setCollectionToEdit(null);
        }}
        collectionToEdit={collectionToEdit}
        onSubmit={handleSaveCollection}
      />

      {/* Tag Modal */}
      <TagModal
        isOpen={isTagModalOpen}
        onClose={() => {
          setIsTagModalOpen(false);
          setTagToEdit(null);
        }}
        tagToEdit={tagToEdit}
        onCreateTag={createTag}
        onUpdateTag={updateTag}
      />

      {/* Upload File Modal */}
      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        collections={collections}
        onUpload={uploadNote}
        onSuccessSelect={(note) => {
          setSelectedNote(note);
          setActiveView('note-detail');
        }}
      />

      {/* Build version badge — visible so you can tell at a glance whether this
          tab is running the current code. Old tabs won't show this. */}
      <div className="fixed bottom-1 right-1 text-[10px] text-slate-400 dark:text-slate-500 bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-full px-2.5 py-0.5 z-50">
        build {BUILD_VERSION}
      </div>
    </div>
  );
};

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <WorkspaceApp />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
