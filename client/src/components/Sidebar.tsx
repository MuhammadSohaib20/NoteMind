import React from 'react';
import { Collection, GENERAL_COLLECTION_FILTER, Tag, ViewMode } from '../types';
import { ThemeToggle } from './ThemeToggle';
import { UserProfileMenu } from './UserProfileMenu';
import {
  Brain,
  Home,
  FileText,
  Folder,
  Sparkles,
  Trash2,
  Plus,
  Settings,
  Tag as TagIcon,
  Edit2,
  X,
} from 'lucide-react';
import { getCollectionColorStyles } from './collectionStyles';

interface SidebarProps {
  collections: Collection[];
  tags: Tag[];
  activeView: ViewMode;
  selectedCollectionId: string | null;
  selectedTagName: string | null;
  onNavigate: (view: ViewMode) => void;
  onSelectCollection: (id: string | null) => void;
  onSelectTag: (name: string | null) => void;
  onOpenCollectionModal: (collectionToEdit?: Collection) => void;
  onDeleteCollection: (id: string) => void;
  onOpenTagModal: (tagToEdit?: Tag) => void;
  onDeleteTag: (id: string) => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  collections,
  tags,
  activeView,
  selectedCollectionId,
  selectedTagName,
  onNavigate,
  onSelectCollection,
  onSelectTag,
  onOpenCollectionModal,
  onDeleteCollection,
  onOpenTagModal,
  onDeleteTag,
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const navItems: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Home', icon: <Home className="w-4 h-4" /> },
    { id: 'notes', label: 'My Notes', icon: <FileText className="w-4 h-4" /> },
    { id: 'collections', label: 'Collections', icon: <Folder className="w-4 h-4" /> },
    { id: 'ask-ai', label: 'Ask My Notes', icon: <Sparkles className="w-4 h-4" /> },
    { id: 'trash', label: 'Trash', icon: <Trash2 className="w-4 h-4" /> },
  ];

  const sidebarContent = (
    <aside className="w-64 bg-white dark:bg-[#0F172A] text-slate-700 dark:text-slate-200 flex flex-col h-full shrink-0 select-none border-r border-slate-200/80 dark:border-slate-800/90 transition-colors">
      {/* Brand Logo & Theme Toggle */}
      <div className="px-5 py-5 flex items-center justify-between">
        <div
          onClick={() => {
            onNavigate('dashboard');
            onCloseMobile?.();
          }}
          className="flex items-center gap-3 cursor-pointer group"
        >
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 via-sky-500 to-cyan-400 flex items-center justify-center text-white shadow-md shadow-blue-500/25 group-hover:scale-105 transition-transform">
            <Brain className="w-4 h-4" />
          </div>
          <span className="font-bold text-slate-900 dark:text-white text-lg tracking-tight">NoteMind</span>
        </div>
        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="md:hidden text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Main Navigation Links */}
      <nav className="px-3 space-y-1">
        {navItems.map((item) => {
          const isActive =
            activeView === item.id ||
            (item.id === 'notes' &&
              (activeView === 'create-note' || activeView === 'note-detail') &&
              !selectedCollectionId);

          return (
            <button
              key={item.id}
              onClick={() => {
                if (item.id === 'notes') {
                  onSelectCollection(null);
                  onSelectTag(null);
                }
                onNavigate(item.id);
                onCloseMobile?.();
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-blue-600 via-sky-600 to-cyan-600 text-white shadow-md shadow-blue-600/20 font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-800/60'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Divider */}
      <div className="my-4 mx-4 border-t border-slate-200/80 dark:border-slate-800/80" />

      {/* Scrollable Recent Collections & Tags */}
      <div className="flex-1 overflow-y-auto px-3 space-y-5 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
        {/* Recent Collections */}
        <div>
          <div className="flex items-center justify-between px-2 mb-2">
            <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Recent Collections
            </span>
            <button
              onClick={() => onOpenCollectionModal()}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              title="New Collection"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-1">
            <div
              onClick={() => {
                onSelectCollection(GENERAL_COLLECTION_FILTER);
                onSelectTag(null);
                onNavigate('notes');
                onCloseMobile?.();
              }}
              className={`flex items-center justify-between px-2.5 py-2 rounded-xl text-xs cursor-pointer transition ${
                selectedCollectionId === GENERAL_COLLECTION_FILTER && activeView === 'notes'
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-semibold border border-slate-300 dark:border-slate-700'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-center gap-2.5 truncate">
                <span className="w-5 h-5 rounded-md border border-slate-500/30 bg-slate-500/15 text-slate-500 dark:text-slate-400 flex items-center justify-center shrink-0">
                  <Folder className="w-3 h-3" />
                </span>
                <span className="truncate">General</span>
              </div>
            </div>

            {collections.map((col) => {
              const colorStyle = getCollectionColorStyles(col.colorIndex ?? col.color_index);
              const isSelected = selectedCollectionId === col.id && activeView === 'notes';

              return (
                <div
                  key={col.id}
                  onClick={() => {
                    onSelectCollection(col.id);
                    onSelectTag(null);
                    onNavigate('notes');
                  }}
                  className={`group flex items-center justify-between px-2.5 py-2 rounded-xl text-xs cursor-pointer transition ${
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-cyan-300 font-semibold border border-blue-200 dark:border-blue-800/70'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <span
                      style={colorStyle.sidebar}
                      className="w-5 h-5 rounded-md border flex items-center justify-center shrink-0 text-[10px] font-bold"
                    >
                      {col.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="truncate">{col.name}</span>
                  </div>

                  <div className="hidden group-hover:flex items-center gap-0.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenCollectionModal(col);
                      }}
                      className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-cyan-400"
                      title="Rename"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete collection "${col.name}"?`)) {
                          onDeleteCollection(col.id);
                        }
                      }}
                      className="p-1 text-slate-400 hover:text-red-500"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}

            <button
              onClick={() => onOpenCollectionModal()}
              className="w-full flex items-center gap-2 px-2.5 py-2 text-xs font-medium text-blue-600 dark:text-cyan-400 hover:underline transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Collection</span>
            </button>
          </div>
        </div>

        {/* Tags Quick Filter Section */}
        <div>
          <div className="flex items-center justify-between px-2 mb-2">
            <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Memory &amp; Search Tags
            </span>
            <button
              onClick={() => onOpenTagModal()}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              title="New Tag"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-1 px-1">
            {tags.length === 0 ? (
              <span className="text-[11px] text-slate-400 dark:text-slate-500 italic px-1">No tags yet</span>
            ) : (
              tags.map((tag) => {
                const isSelected =
                  selectedTagName !== null &&
                  selectedTagName.toLowerCase() === tag.name.toLowerCase() &&
                  activeView === 'notes';
                const count = tag.noteCount ?? tag.note_count ?? 0;

                return (
                  <div
                    key={tag.id}
                    onClick={() => {
                      if (isSelected) {
                        onSelectTag(null);
                      } else {
                        onSelectTag(tag.name);
                        onSelectCollection(null);
                        onNavigate('notes');
                      }
                    }}
                    className={`group flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs cursor-pointer transition ${
                      isSelected
                        ? 'bg-blue-600 text-white font-semibold shadow-sm'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <TagIcon
                        className={`w-3 h-3 shrink-0 ${
                          isSelected ? 'text-white' : 'text-blue-500 dark:text-cyan-400'
                        }`}
                      />
                      <span className="truncate">#{tag.name}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                          isSelected
                            ? 'bg-blue-700 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {count}
                      </span>
                    </div>

                    <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenTagModal(tag);
                        }}
                        className={`p-1 ${
                          isSelected
                            ? 'text-blue-100 hover:text-white'
                            : 'text-slate-400 hover:text-blue-600 dark:hover:text-cyan-400'
                        }`}
                        title="Rename Tag"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete tag "#${tag.name}"?`)) {
                            onDeleteTag(tag.id);
                          }
                        }}
                        className={`p-1 ${
                          isSelected
                            ? 'text-blue-100 hover:text-red-200'
                            : 'text-slate-400 hover:text-red-500'
                        }`}
                        title="Delete Tag"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Bottom Settings Link */}
      <div className="p-3 border-t border-slate-200/80 dark:border-slate-800/80">
        <button
          onClick={() => {
            onNavigate('settings');
            onCloseMobile?.();
          }}
          className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
            activeView === 'settings'
              ? 'bg-gradient-to-r from-blue-600 via-sky-600 to-cyan-600 text-white shadow-md shadow-blue-600/20 font-semibold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-800/60'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <div className="hidden md:flex h-screen shrink-0">{sidebarContent}</div>

      {/* Mobile Backdrop & Drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="relative z-10 w-64 h-full shadow-2xl animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
