import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ScrollText,
  FolderPlus,
  Plus,
  Save,
  Trash2,
  Edit3,
  Search,
  AlertTriangle,
  CheckCircle2,
  X,
  ArrowLeft,
  Folder,
  FileCode2,
  RefreshCw,
  Link2,
} from 'lucide-react';
import {
  ScriptClassLoader,
  EXTENDABLE_NODE_CLASSES,
  generateMinimalNodeScriptTemplate,
  toValidClassName,
  Input,
} from '../engine/index.js';

export interface ScriptFileEntry {
  uuid: string;
  name: string;
  relativePath: string;
  sourceCode: string;
  mtimeMs?: number;
  extendsClass?: string | null;
  className?: string | null;
}

export interface OpenScriptTab {
  uuid: string;
  name: string;
  relativePath: string;
  content: string;
  savedContent: string;
  mtimeMs?: number;
  syntaxError?: {
    valid: boolean;
    file: string;
    line: number;
    column: number;
    message: string;
  } | null;
  externalConflict?: {
    diskContent: string;
    diskMtimeMs: number;
  } | null;
}

interface ScriptsEditorWorkspaceProps {
  scriptsList: ScriptFileEntry[];
  foldersList: string[];
  openTabs: OpenScriptTab[];
  activeTabUuid: string | null;
  selectedNodeInfo: {
    uuid: string;
    name: string;
    type: string;
    scriptUuid?: string | null;
  } | null;
  onSelectTab: (uuid: string) => void;
  onCloseTab: (uuid: string) => void;
  onUpdateTabContent: (uuid: string, newContent: string) => void;
  onSaveTab: (uuid: string, forceOverwrite?: boolean) => Promise<void>;
  onReloadTabFromDisk: (uuid: string, diskContent: string, diskMtimeMs: number) => void;
  onCreateNewScript: (scriptName: string, baseClassName: string, folderPath: string, bindToSelectedNode: boolean) => Promise<void>;
  onCreateFolder: (folderPath: string) => Promise<void>;
  onRenameScript: (script: ScriptFileEntry, newName: string) => Promise<void>;
  onDeleteScript: (script: ScriptFileEntry, force?: boolean) => Promise<{
    requiresConfirmation?: boolean;
    dependentNodes?: Array<{ sceneFile: string; nodeName: string; nodeUuid: string }>;
  }>;
  onOpenScriptFile: (script: ScriptFileEntry) => void;
  onBindActiveScriptToSelectedNode: (scriptUuid: string) => void;
  onReturnTo3DViewport: () => void;
  onRefreshScripts: () => Promise<void>;
}

export const ScriptsEditorWorkspace: React.FC<ScriptsEditorWorkspaceProps> = ({
  scriptsList,
  foldersList,
  openTabs,
  activeTabUuid,
  selectedNodeInfo,
  onSelectTab,
  onCloseTab,
  onUpdateTabContent,
  onSaveTab,
  onReloadTabFromDisk,
  onCreateNewScript,
  onCreateFolder,
  onRenameScript,
  onDeleteScript,
  onOpenScriptFile,
  onBindActiveScriptToSelectedNode,
  onReturnTo3DViewport,
  onRefreshScripts,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [codeSearchQuery, setCodeSearchQuery] = useState('');
  const [showCodeSearch, setShowCodeSearch] = useState(false);

  // Modal state for creating a new script
  const [showNewScriptModal, setShowNewScriptModal] = useState(false);
  const [newScriptName, setNewScriptName] = useState('PlayerController');
  const [newScriptBaseClass, setNewScriptBaseClass] = useState(
    selectedNodeInfo?.type?.replace('3DNode', '3D') || 'Node3D'
  );
  const [newScriptFolder, setNewScriptFolder] = useState('scripts');
  const [bindNewToSelected, setBindNewToSelected] = useState(Boolean(selectedNodeInfo));

  // Modal state for new folder
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('scripts/actors');

  // Rename state
  const [renamingScript, setRenamingScript] = useState<ScriptFileEntry | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Delete confirmation with dependent nodes
  const [deleteConfirmState, setDeleteConfirmState] = useState<{
    script: ScriptFileEntry;
    dependentNodes: Array<{ sceneFile: string; nodeName: string; nodeUuid: string }>;
  } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lineNumbersRef = useRef<HTMLDivElement | null>(null);
  const [cursorLineCol, setCursorLineCol] = useState<{ line: number; col: number }>({
    line: 1,
    col: 1,
  });

  const activeTab = openTabs.find((t) => t.uuid === activeTabUuid) || null;

  useEffect(() => {
    if (selectedNodeInfo) {
      const normalizedType = EXTENDABLE_NODE_CLASSES[selectedNodeInfo.type]
        ? selectedNodeInfo.type
        : selectedNodeInfo.type.replace('3DNode', '3D');
      if (EXTENDABLE_NODE_CLASSES[normalizedType]) {
        setNewScriptBaseClass(normalizedType);
      }
    }
  }, [selectedNodeInfo]);

  const handleScrollSync = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const updateCursorPosition = () => {
    const el = textareaRef.current;
    if (!el || !activeTab) return;
    const pos = el.selectionStart || 0;
    const upToCursor = activeTab.content.slice(0, pos);
    const lines = upToCursor.split('\n');
    setCursorLineCol({
      line: lines.length,
      col: (lines[lines.length - 1]?.length || 0) + 1,
    });
  };

  const handleEditorKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!activeTab) return;
      const isMod = e.ctrlKey || e.metaKey;
      if (isMod && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        e.stopPropagation();
        onSaveTab(activeTab.uuid);
        return;
      }
      if (isMod && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        e.stopPropagation();
        setShowCodeSearch((prev) => !prev);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const el = e.currentTarget;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const next =
          activeTab.content.substring(0, start) + '  ' + activeTab.content.substring(end);
        onUpdateTabContent(activeTab.uuid, next);
        setTimeout(() => {
          el.selectionStart = el.selectionEnd = start + 2;
          updateCursorPosition();
        }, 0);
      }
    },
    [activeTab, onSaveTab, onUpdateTabContent]
  );

  const filteredScripts = scriptsList.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.relativePath.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const linesArray = activeTab ? activeTab.content.split('\n') : [''];

  const compatibilityWithSelectedNode = (() => {
    if (!activeTab || !selectedNodeInfo) return null;
    const compiled = ScriptClassLoader.compileScriptClass(activeTab.content, activeTab.name);
    if (!compiled.ok) return null;
    return ScriptClassLoader.validateCompatibility(compiled.extendsClass, selectedNodeInfo.type);
  })();

  return (
    <div className="flex-1 flex min-h-0 bg-[#0b0f17] text-slate-200 select-none overflow-hidden">
      {/* LEFT EXPLORER: Pastas e Arquivos .js */}
      <aside className="w-68 shrink-0 bg-[#111622] border-r border-[#1e2636] flex flex-col">
        <div className="px-3 py-2.5 border-b border-[#1e2636] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-semibold text-slate-100">Explorador de Scripts</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                if (selectedNodeInfo) {
                  setNewScriptName(`${toValidClassName(selectedNodeInfo.name)}`);
                  setBindNewToSelected(true);
                }
                setShowNewScriptModal(true);
              }}
              title="Criar Novo Script (.js)"
              className="p-1.5 rounded bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setShowNewFolderModal(true)}
              title="Criar Nova Pasta em scripts/"
              className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onRefreshScripts}
              title="Atualizar Lista de Scripts"
              className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Filtro de busca de scripts */}
        <div className="p-2 border-b border-[#1e2636]">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filtrar scripts (.js)..."
              onFocus={() => Input.setEditorFocusBlocked(true)}
              onBlur={() => Input.setEditorFocusBlocked(false)}
              className="w-full pl-8 pr-2.5 py-1.5 rounded bg-[#0b0f17] border border-[#1e2636] text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>
        </div>

        {/* Lista de Pastas e Scripts (.js) */}
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {/* Pastas */}
          <div className="space-y-0.5">
            <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-500">
              Diretórios (project://)
            </div>
            {(foldersList.length > 0 ? foldersList : ['scripts']).map((folder) => (
              <div
                key={folder}
                className="px-2 py-1 rounded text-xs text-slate-400 flex items-center gap-1.5"
              >
                <Folder className="w-3.5 h-3.5 text-sky-400/80 shrink-0" />
                <span className="font-mono text-[11px] truncate">{folder}/</span>
              </div>
            ))}
          </div>

          {/* Arquivos .js */}
          <div className="space-y-0.5 pt-1 border-t border-[#1e2636]">
            <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-500 flex items-center justify-between">
              <span>Classes Node (.js)</span>
              <span>{filteredScripts.length}</span>
            </div>

            {filteredScripts.length === 0 ? (
              <div className="p-3 rounded-lg bg-[#0b0f17] border border-[#1e2636] text-center space-y-2">
                <p className="text-[11px] text-slate-400">
                  Nenhum script `.js` encontrado neste filtro.
                </p>
                <button
                  type="button"
                  onClick={() => setShowNewScriptModal(true)}
                  className="px-2.5 py-1 rounded bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs cursor-pointer"
                >
                  + Criar Primeiro Script
                </button>
              </div>
            ) : (
              filteredScripts.map((script) => {
                const isActive = activeTabUuid === script.uuid;
                const openTab = openTabs.find((t) => t.uuid === script.uuid);
                const isDirty = openTab ? openTab.content !== openTab.savedContent : false;
                const isBoundToSelected = selectedNodeInfo?.scriptUuid === script.uuid;

                return (
                  <div
                    key={script.uuid}
                    onClick={() => onOpenScriptFile(script)}
                    className={`group px-2.5 py-1.5 rounded-md text-xs flex items-center justify-between gap-1.5 cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 font-semibold'
                        : 'text-slate-300 hover:bg-slate-800/70 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <ScrollText
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isBoundToSelected ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate">{script.name}</span>
                          {isDirty && (
                            <span
                              title="Alterações não salvas"
                              className="w-2 h-2 rounded-full bg-amber-400 shrink-0"
                            />
                          )}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500 truncate">
                          {script.extendsClass ? `extends ${script.extendsClass}` : script.relativePath}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenamingScript(script);
                          setRenameValue(script.name.replace(/\.js$/i, ''));
                        }}
                        title="Renomear Script (preserva .uuid)"
                        className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white cursor-pointer"
                      >
                        <Edit3 className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          const res = await onDeleteScript(script, false);
                          if (res?.requiresConfirmation && res.dependentNodes) {
                            setDeleteConfirmState({
                              script,
                              dependentNodes: res.dependentNodes,
                            });
                          }
                        }}
                        title="Excluir Script (.js)"
                        className="p-1 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 cursor-pointer"
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

        {/* Rodapé do Explorador com retorno rápido ao Viewport 3D */}
        <div className="p-2.5 border-t border-[#1e2636] flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onReturnTo3DViewport}
            className="w-full px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-sky-400" />
            <span>Voltar ao Viewport 3D</span>
          </button>
        </div>
      </aside>

      {/* CENTER EDITOR: Abas de Scripts + Editor com Numeração de Linhas e Diagnóstico */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0b0f17]">
        {/* Barra Superior de Abas de Scripts Abertos */}
        <div className="h-9 bg-[#111622] border-b border-[#1e2636] flex items-center justify-between px-2 gap-2 overflow-x-auto">
          <div className="flex items-center gap-1 min-w-0 overflow-x-auto">
            {openTabs.map((tab) => {
              const isTabActive = tab.uuid === activeTabUuid;
              const isTabDirty = tab.content !== tab.savedContent;
              const hasErr = tab.syntaxError && !tab.syntaxError.valid;

              return (
                <div
                  key={tab.uuid}
                  onClick={() => onSelectTab(tab.uuid)}
                  className={`h-7 px-2.5 rounded-t-md text-xs flex items-center gap-2 border-t border-x cursor-pointer transition-colors shrink-0 ${
                    isTabActive
                      ? 'bg-[#0b0f17] text-sky-300 border-[#283246] font-semibold'
                      : 'bg-[#151b29] text-slate-400 border-transparent hover:text-slate-200'
                  }`}
                >
                  <ScrollText
                    className={`w-3.5 h-3.5 ${
                      hasErr ? 'text-rose-400' : isTabActive ? 'text-amber-400' : 'text-slate-500'
                    }`}
                  />
                  <span>{tab.name}</span>
                  {isTabDirty && (
                    <span
                      title="Modificado (Ctrl+S para salvar)"
                      className="w-2 h-2 rounded-full bg-sky-400"
                    />
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(tab.uuid);
                    }}
                    className="p-0.5 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-200 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}

            <button
              type="button"
              onClick={() => setShowNewScriptModal(true)}
              title="Novo Script (.js)"
              className="h-7 px-2 rounded text-slate-400 hover:text-white hover:bg-slate-800 flex items-center gap-1 text-xs cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Ações do Script Ativo */}
          {activeTab && (
            <div className="flex items-center gap-1.5 shrink-0">
              {selectedNodeInfo && (
                <button
                  type="button"
                  onClick={() => onBindActiveScriptToSelectedNode(activeTab.uuid)}
                  disabled={
                    Boolean(compatibilityWithSelectedNode && !compatibilityWithSelectedNode.compatible)
                  }
                  title={
                    compatibilityWithSelectedNode && !compatibilityWithSelectedNode.compatible
                      ? compatibilityWithSelectedNode.reason
                      : `Vincular "${activeTab.name}" ao Node selecionado "${selectedNodeInfo.name}" (${selectedNodeInfo.type})`
                  }
                  className={`px-2.5 py-1 rounded text-[11px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 ${
                    selectedNodeInfo.scriptUuid === activeTab.uuid
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                  }`}
                >
                  <Link2 className="w-3 h-3" />
                  <span>
                    {selectedNodeInfo.scriptUuid === activeTab.uuid
                      ? `Vinculado a ${selectedNodeInfo.name}`
                      : `Vincular a ${selectedNodeInfo.name}`}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowCodeSearch((prev) => !prev)}
                title="Buscar no Código (Ctrl+F)"
                className={`p-1.5 rounded text-xs transition-colors cursor-pointer ${
                  showCodeSearch
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                <Search className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => onSaveTab(activeTab.uuid)}
                className="px-3 py-1 rounded bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Salvar (Ctrl+S)</span>
              </button>
            </div>
          )}
        </div>

        {/* Barra de Busca Interna no Código (Ctrl+F) */}
        {showCodeSearch && activeTab && (
          <div className="px-4 py-1.5 bg-[#141b29] border-b border-[#1e2636] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <Search className="w-3.5 h-3.5 text-sky-400" />
              <input
                type="text"
                value={codeSearchQuery}
                onChange={(e) => setCodeSearchQuery(e.target.value)}
                placeholder="Localizar texto no script ativo..."
                onFocus={() => Input.setEditorFocusBlocked(true)}
                onBlur={() => Input.setEditorFocusBlocked(false)}
                className="w-full px-2.5 py-1 rounded bg-[#0b0f17] border border-[#283246] text-xs text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowCodeSearch(false)}
              className="text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Banner de Conflito de Edição Externa */}
        {activeTab?.externalConflict && (
          <div className="px-4 py-2 bg-amber-500/15 border-b border-amber-500/40 text-amber-200 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Alteração Externa Detectada:</strong> O arquivo{' '}
                <code className="font-mono">{activeTab.relativePath}</code> foi modificado no disco fora do editor.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() =>
                  onReloadTabFromDisk(
                    activeTab.uuid,
                    activeTab.externalConflict!.diskContent,
                    activeTab.externalConflict!.diskMtimeMs
                  )
                }
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium cursor-pointer"
              >
                Recarregar do Disco
              </button>
              <button
                type="button"
                onClick={() => onSaveTab(activeTab.uuid, true)}
                className="px-2.5 py-1 rounded bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold cursor-pointer"
              >
                Sobrescrever Disco
              </button>
            </div>
          </div>
        )}

        {/* Área Principal de Código com Numeração de Linhas */}
        {activeTab ? (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 flex min-h-0 relative font-mono text-xs">
              {/* Coluna de Números de Linha */}
              <div
                ref={lineNumbersRef}
                className="w-12 py-3 bg-[#0e131f] border-r border-[#1e2636] text-right pr-3 select-none overflow-hidden text-slate-500 leading-6"
              >
                {linesArray.map((_, idx) => {
                  const lineNum = idx + 1;
                  const isErrorLine =
                    activeTab.syntaxError &&
                    !activeTab.syntaxError.valid &&
                    activeTab.syntaxError.line === lineNum;
                  const isActiveLine = cursorLineCol.line === lineNum;
                  return (
                    <div
                      key={lineNum}
                      className={`${
                        isErrorLine
                          ? 'text-rose-400 font-bold bg-rose-500/20 -mr-3 pr-3'
                          : isActiveLine
                          ? 'text-sky-300 font-semibold'
                          : ''
                      }`}
                    >
                      {lineNum}
                    </div>
                  );
                })}
              </div>

              {/* Textarea de Edição de Código JavaScript */}
              <textarea
                ref={textareaRef}
                value={activeTab.content}
                onChange={(e) => {
                  onUpdateTabContent(activeTab.uuid, e.target.value);
                  updateCursorPosition();
                }}
                onScroll={handleScrollSync}
                onKeyUp={updateCursorPosition}
                onClick={updateCursorPosition}
                onKeyDown={handleEditorKeyDown}
                onFocus={() => Input.setEditorFocusBlocked(true)}
                onBlur={() => Input.setEditorFocusBlocked(false)}
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                className="flex-1 p-3 bg-[#0b0f17] text-slate-100 leading-6 resize-none focus:outline-none overflow-auto selection:bg-sky-500/30 select-text"
              />
            </div>

            {/* Barra de Diagnóstico de Sintaxe e Status do Editor */}
            <div className="px-4 py-2 bg-[#111622] border-t border-[#1e2636] flex items-center justify-between gap-4 text-xs font-mono">
              <div className="flex items-center gap-2 min-w-0">
                {activeTab.syntaxError && !activeTab.syntaxError.valid ? (
                  <div className="flex items-center gap-2 text-rose-400 truncate">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span className="truncate">
                      Erro de Sintaxe em {activeTab.syntaxError.file} (Linha{' '}
                      {activeTab.syntaxError.line}, Col {activeTab.syntaxError.column}):{' '}
                      {activeTab.syntaxError.message}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-emerald-400 truncate">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span className="truncate">
                      Sintaxe JavaScript válida · Ciclo de vida nativo (start, input, update, onDestroy) + Física unificada
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 text-slate-400 shrink-0">
                <span>
                  Ln {cursorLineCol.line}, Col {cursorLineCol.col}
                </span>
                <span>UTF-8</span>
                <span className="text-sky-400">{activeTab.relativePath}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center">
              <FileCode2 className="w-6 h-6 text-amber-400" />
            </div>
            <div className="space-y-1 max-w-md">
              <h3 className="text-sm font-bold text-slate-100">
                Editor Integrado de Classes JavaScript (Nodes)
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Selecione um arquivo <code className="font-mono text-amber-300">.js</code> no explorador à esquerda ou crie uma nova classe estendendo diretamente{' '}
                <code className="font-mono text-sky-300">Node3D</code>,{' '}
                <code className="font-mono text-sky-300">Mesh3D</code> ou{' '}
                <code className="font-mono text-sky-300">Camera3D</code>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNewScriptModal(true)}
              className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs cursor-pointer"
            >
              + Criar Novo Script (.js)
            </button>
          </div>
        )}
      </div>

      {/* MODAL: CRIAR NOVO SCRIPT (.JS) COM TEMPLATE MÍNIMO */}
      {showNewScriptModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl bg-[#111622] border border-[#283246] shadow-2xl p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-[#1e2636] pb-3">
              <div className="flex items-center gap-2">
                <ScrollText className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-slate-100">
                  Criar Nova Classe JavaScript de Node
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNewScriptModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="block text-slate-300 font-medium">Nome da Classe / Arquivo</label>
                <input
                  type="text"
                  value={newScriptName}
                  onChange={(e) => setNewScriptName(e.target.value)}
                  onFocus={() => Input.setEditorFocusBlocked(true)}
                  onBlur={() => Input.setEditorFocusBlocked(false)}
                  placeholder="Ex: PlayerController"
                  className="w-full px-3 py-1.5 rounded bg-[#0b0f17] border border-[#283246] text-slate-100 font-mono focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-300 font-medium">
                  Classe Base do Node (extends)
                </label>
                <select
                  value={newScriptBaseClass}
                  onChange={(e) => setNewScriptBaseClass(e.target.value)}
                  className="w-full px-3 py-1.5 rounded bg-[#0b0f17] border border-[#283246] text-slate-100 font-mono focus:outline-none focus:border-sky-500"
                >
                  {Object.keys(EXTENDABLE_NODE_CLASSES).map((clsName) => (
                    <option key={clsName} value={clsName}>
                      {clsName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-slate-300 font-medium">Pasta de Destino</label>
                <select
                  value={newScriptFolder}
                  onChange={(e) => setNewScriptFolder(e.target.value)}
                  className="w-full px-3 py-1.5 rounded bg-[#0b0f17] border border-[#283246] text-slate-100 font-mono"
                >
                  {(foldersList.length > 0 ? foldersList : ['scripts']).map((f) => (
                    <option key={f} value={f}>
                      {f}/
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-2.5 rounded bg-[#0b0f17] border border-[#1e2636] space-y-1">
                <span className="text-[10px] font-mono uppercase text-slate-500">
                  Prévia do Template Inicial Mínimo:
                </span>
                <pre className="font-mono text-[11px] text-emerald-300 overflow-x-auto">
                  {generateMinimalNodeScriptTemplate(newScriptName, newScriptBaseClass)}
                </pre>
              </div>

              {selectedNodeInfo && (
                <label className="flex items-center gap-2 text-slate-300 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={bindNewToSelected}
                    onChange={(e) => setBindNewToSelected(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-sky-500"
                  />
                  <span>
                    Vincular imediatamente ao Node selecionado ({selectedNodeInfo.name})
                  </span>
                </label>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1e2636]">
              <button
                type="button"
                onClick={() => setShowNewScriptModal(false)}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  await onCreateNewScript(
                    newScriptName,
                    newScriptBaseClass,
                    newScriptFolder,
                    bindNewToSelected
                  );
                  setShowNewScriptModal(false);
                }}
                className="px-4 py-1.5 rounded bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold cursor-pointer"
              >
                Criar e Abrir Script
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: NOVA PASTA */}
      {showNewFolderModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-xl bg-[#111622] border border-[#283246] shadow-2xl p-5 space-y-4 text-xs">
            <h3 className="text-sm font-bold text-slate-100">Criar Nova Pasta de Scripts</h3>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onFocus={() => Input.setEditorFocusBlocked(true)}
              onBlur={() => Input.setEditorFocusBlocked(false)}
              placeholder="scripts/inimigos"
              className="w-full px-3 py-1.5 rounded bg-[#0b0f17] border border-[#283246] text-slate-100 font-mono"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewFolderModal(false)}
                className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  await onCreateFolder(newFolderName);
                  setShowNewFolderModal(false);
                }}
                className="px-3 py-1.5 rounded bg-sky-500 text-slate-950 font-bold cursor-pointer"
              >
                Criar Pasta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RENOMEAR SCRIPT */}
      {renamingScript && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-xl bg-[#111622] border border-[#283246] shadow-2xl p-5 space-y-4 text-xs">
            <h3 className="text-sm font-bold text-slate-100">
              Renomear {renamingScript.name} (Preserva UUID)
            </h3>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onFocus={() => Input.setEditorFocusBlocked(true)}
              onBlur={() => Input.setEditorFocusBlocked(false)}
              className="w-full px-3 py-1.5 rounded bg-[#0b0f17] border border-[#283246] text-slate-100 font-mono"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenamingScript(null)}
                className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  await onRenameScript(renamingScript, renameValue);
                  setRenamingScript(null);
                }}
                className="px-3 py-1.5 rounded bg-sky-500 text-slate-950 font-bold cursor-pointer"
              >
                Renomear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAÇÃO DE EXCLUSÃO DE SCRIPT COM NODES DEPENDENTES */}
      {deleteConfirmState && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl bg-[#111622] border border-rose-500/40 shadow-2xl p-5 space-y-4 text-xs">
            <div className="flex items-center gap-2 text-rose-400">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-bold">
                Script em uso por {deleteConfirmState.dependentNodes.length} Node(s)
              </h3>
            </div>
            <p className="text-slate-300 leading-relaxed">
              O script <code className="font-mono text-amber-300">{deleteConfirmState.script.name}</code> está vinculado aos seguintes Nodes:
            </p>
            <div className="max-h-36 overflow-y-auto p-2 rounded bg-[#0b0f17] border border-[#1e2636] space-y-1 font-mono text-[11px]">
              {deleteConfirmState.dependentNodes.map((dep, i) => (
                <div key={i} className="text-slate-300">
                  • {dep.nodeName} <span className="text-slate-500">({dep.sceneFile})</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmState(null)}
                className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  await onDeleteScript(deleteConfirmState.script, true);
                  setDeleteConfirmState(null);
                }}
                className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold cursor-pointer"
              >
                Forçar Exclusão
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
