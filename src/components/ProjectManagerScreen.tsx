import React, { useState, useEffect, useRef } from 'react';
import {
  FolderPlus,
  FolderOpen,
  Clock,
  Sparkles,
  Play,
  Box,
  Layers,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Trash2,
  ArrowRight,
  FileJson,
  ShieldCheck,
  Terminal,
  Copy,
  HardDrive,
  Search,
  MapPin,
} from 'lucide-react';

export interface ProjectSummary {
  uuid: string;
  name: string;
  folderName?: string;
  path: string;
  projectFile: string;
  type: 'user' | 'demo';
  engineVersion: string;
  coreVersion?: string;
  coreVersionMismatch?: boolean;
  mainSceneUuid?: string | null;
  mainSceneRelativePath?: string;
  lastModified?: string;
  lastOpenedAt?: string;
  available?: boolean;
  statusMessage?: string | null;
  trusted?: boolean;
}

export interface ProjectManagerOverview {
  engineName: string;
  engineVersion: string;
  defaultProjectsDir: string;
  installationRoot: string;
  myProjects: ProjectSummary[];
  recentProjects: ProjectSummary[];
  demoProjects: ProjectSummary[];
  activeProjectContext: any | null;
}

interface ProjectManagerScreenProps {
  overview: ProjectManagerOverview | null;
  loading: boolean;
  errorMsg: string | null;
  onRefreshOverview: () => void;
  onCreateProject: (payload: {
    name: string;
    folderName: string;
    baseDir: string;
    template: 'standard_3d' | 'empty' | 'geometric_demo';
  }) => Promise<void>;
  onOpenProject: (payload: {
    projectPath?: string;
    projectUuid?: string;
    folderName?: string;
    autoMigrateLegacy?: boolean;
  }) => Promise<void>;
  onMigrateLegacyProject: (projectPath: string) => Promise<void>;
  onRelocateRecentProject: (oldPathOrUuid: string, newPath: string) => Promise<void>;
  onRemoveRecentProject: (pathOrUuid: string) => Promise<void>;
  onUpdateProjectCore: (projectPath: string) => Promise<void>;
  onRunEngineValidation: () => void;
  isValidatingEngine: boolean;
}

export const ProjectManagerScreen: React.FC<ProjectManagerScreenProps> = ({
  overview,
  loading,
  errorMsg,
  onRefreshOverview,
  onCreateProject,
  onOpenProject,
  onMigrateLegacyProject,
  onRelocateRecentProject,
  onRemoveRecentProject,
  onUpdateProjectCore,
  onRunEngineValidation,
  isValidatingEngine,
}) => {
  const [activeTab, setActiveTab] = useState<'my_projects' | 'recent' | 'demos'>('my_projects');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal: Novo Projeto
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('Meu Jogo 3D');
  const [newFolderName, setNewFolderName] = useState('meu-jogo-3d');
  const [folderManuallyEdited, setFolderManuallyEdited] = useState(false);
  const [newBaseDir, setNewBaseDir] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<'standard_3d' | 'empty' | 'geometric_demo'>('standard_3d');
  const [creating, setCreating] = useState(false);

  // Modal: Abrir Projeto Existente
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [manualOpenPath, setManualOpenPath] = useState('');
  const [selectedManifestInfo, setSelectedManifestInfo] = useState<{
    fileName: string;
    uuid?: string;
    name?: string;
    engine?: string;
    isLegacy?: boolean;
  } | null>(null);
  const [autoMigrateOnOpen, setAutoMigrateOnOpen] = useState(true);
  const [opening, setOpening] = useState(false);

  // Modal: Relocar Projeto Movido
  const [relocateTarget, setRelocateTarget] = useState<ProjectSummary | null>(null);
  const [relocateNewPath, setRelocateNewPath] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (overview?.defaultProjectsDir && !newBaseDir) {
      setNewBaseDir(overview.defaultProjectsDir);
    }
  }, [overview, newBaseDir]);

  // Sugerir automaticamente o nome da pasta física quando o usuário digita o nome do projeto
  useEffect(() => {
    if (folderManuallyEdited) return;
    const sanitized =
      newProjectName
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'novo-projeto';
    setNewFolderName(sanitized);
  }, [newProjectName, folderManuallyEdited]);

  const handleOpenCreateModal = (presetTemplate: 'standard_3d' | 'empty' | 'geometric_demo' = 'standard_3d', presetName = 'Meu Jogo 3D') => {
    setSelectedTemplate(presetTemplate);
    setNewProjectName(presetName);
    setFolderManuallyEdited(false);
    if (overview?.defaultProjectsDir) {
      setNewBaseDir(overview.defaultProjectsDir);
    }
    setShowCreateModal(true);
  };

  const handleConfirmCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim() || !newFolderName.trim()) return;
    setCreating(true);
    try {
      await onCreateProject({
        name: newProjectName.trim(),
        folderName: newFolderName.trim(),
        baseDir: newBaseDir.trim() || overview?.defaultProjectsDir || 'projects',
        template: selectedTemplate,
      });
      setShowCreateModal(false);
    } finally {
      setCreating(false);
    }
  };

  const handleNativeManifestSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const isLegacy =
        file.name === 'project.core3d' ||
        file.name === 'project.maxros' ||
        parsed.engine === 'CoreStudio' ||
        parsed.engine === 'Core3D Studio';

      setSelectedManifestInfo({
        fileName: file.name,
        uuid: parsed.uuid,
        name: parsed.name,
        engine: parsed.engine || (isLegacy ? 'Core3D Studio (Legado)' : 'Maxros Engine'),
        isLegacy,
      });

      // Tentar preencher automaticamente o caminho se o projeto estiver listado no overview
      if (parsed.uuid && overview) {
        const allKnown = [
          ...overview.myProjects,
          ...overview.demoProjects,
          ...overview.recentProjects,
        ];
        const found = allKnown.find((p) => p.uuid === String(parsed.uuid).toLowerCase());
        if (found?.path) {
          setManualOpenPath(found.path);
        }
      } else if (parsed.name && overview?.defaultProjectsDir) {
        const slug = String(parsed.name)
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9_-]+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');
        if (!manualOpenPath) {
          setManualOpenPath(`${overview.defaultProjectsDir}/${slug}`);
        }
      }
    } catch {
      setSelectedManifestInfo({
        fileName: file.name,
        name: 'Arquivo JSON inválido ou corrompido',
      });
    }
  };

  const handleConfirmOpen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualOpenPath.trim() && !selectedManifestInfo?.uuid) return;
    setOpening(true);
    try {
      await onOpenProject({
        projectPath: manualOpenPath.trim() || undefined,
        projectUuid: selectedManifestInfo?.uuid,
        autoMigrateLegacy: autoMigrateOnOpen,
      });
      setShowOpenModal(false);
    } finally {
      setOpening(false);
    }
  };

  const handleConfirmRelocate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!relocateTarget || !relocateNewPath.trim()) return;
    await onRelocateRecentProject(relocateTarget.uuid || relocateTarget.path, relocateNewPath.trim());
    setRelocateTarget(null);
    setRelocateNewPath('');
  };

  const myProjects = overview?.myProjects || [];
  const recentProjects = overview?.recentProjects || [];
  const demoProjects = overview?.demoProjects || [];

  const filterList = (list: ProjectSummary[]) => {
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.path.toLowerCase().includes(q) ||
        (item.uuid && item.uuid.toLowerCase().includes(q))
    );
  };

  const filteredMyProjects = filterList(myProjects);
  const filteredRecentProjects = filterList(recentProjects);
  const filteredDemoProjects = filterList(demoProjects);

  return (
    <div className="min-h-screen w-full bg-[#0B0E14] text-[#F1F5F9] flex flex-col font-sans select-none">
      {/* Top Header Bar */}
      <header className="h-14 px-6 bg-[#121721] border-b border-[#222B3B] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3.5">
          <div className="w-8 h-8 rounded-md bg-sky-500/15 border border-sky-500/40 flex items-center justify-center text-sky-400 shadow-inner">
            <Box className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-bold tracking-tight text-slate-100">
                Maxros Engine
              </span>
              <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider bg-sky-500/15 text-sky-300 border border-sky-500/30 rounded">
                v{overview?.engineVersion || '1.0.0'}
              </span>
              <span className="text-xs text-slate-400 border-l border-[#222B3B] pl-2.5">
                Gerenciador de Projetos
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onRunEngineValidation}
            disabled={isValidatingEngine}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-[#181F2C] hover:bg-[#1E2738] text-slate-200 border border-[#222B3B] flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            title="Executar bateria automatizada de validação da arquitetura Maxros Engine"
          >
            <Terminal className="w-3.5 h-3.5 text-emerald-400" />
            <span>{isValidatingEngine ? 'Validando Engine...' : 'Validar Arquitetura'}</span>
          </button>

          <button
            type="button"
            onClick={onRefreshOverview}
            disabled={loading}
            className="p-1.5 rounded-md bg-[#181F2C] hover:bg-[#1E2738] text-slate-300 border border-[#222B3B] transition-colors cursor-pointer"
            title="Atualizar lista de projetos"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-sky-400' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedManifestInfo(null);
              setManualOpenPath('');
              setShowOpenModal(true);
            }}
            className="px-3.5 py-1.5 rounded-md text-xs font-semibold bg-[#181F2C] hover:bg-[#222B3B] text-slate-100 border border-[#2D3A4F] flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <FolderOpen className="w-3.5 h-3.5 text-sky-400" />
            <span>Abrir Projeto</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenCreateModal('standard_3d', 'Meu Jogo 3D')}
            className="px-3.5 py-1.5 rounded-md text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>Novo Projeto</span>
          </button>
        </div>
      </header>

      {/* Main Content Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Navigation Sidebar */}
        <aside className="w-64 bg-[#121721] border-r border-[#222B3B] p-4 flex flex-col justify-between shrink-0">
          <div className="space-y-1.5">
            <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-400">
              Categorias de Projetos
            </div>

            <button
              type="button"
              onClick={() => setActiveTab('my_projects')}
              className={`w-full px-3 py-2.5 rounded-md text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                activeTab === 'my_projects'
                  ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                  : 'text-slate-300 hover:bg-[#181F2C] border border-transparent'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Layers className="w-4 h-4 text-sky-400" />
                <span>Meus Projetos</span>
              </span>
              <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-[#0B0E14] text-slate-300 border border-[#222B3B]">
                {myProjects.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('recent')}
              className={`w-full px-3 py-2.5 rounded-md text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                activeTab === 'recent'
                  ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                  : 'text-slate-300 hover:bg-[#181F2C] border border-transparent'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>Projetos Recentes</span>
              </span>
              <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-[#0B0E14] text-slate-300 border border-[#222B3B]">
                {recentProjects.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('demos')}
              className={`w-full px-3 py-2.5 rounded-md text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                activeTab === 'demos'
                  ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                  : 'text-slate-300 hover:bg-[#181F2C] border border-transparent'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span>Demonstrações e Exemplos</span>
              </span>
              <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-[#0B0E14] text-slate-300 border border-[#222B3B]">
                {demoProjects.length}
              </span>
            </button>
          </div>

          {/* Architecture & Root Info Card */}
          <div className="p-3 rounded-md bg-[#0B0E14] border border-[#222B3B] space-y-2 text-[11px]">
            <div className="flex items-center gap-1.5 text-slate-200 font-semibold">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Identidade & UUIDs</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              Cada projeto possui seu <code className="text-sky-300 font-mono">maxros.project.json</code>, runtime isolado em <code className="text-sky-300 font-mono">core/</code> e raiz dinâmica <code className="text-emerald-300 font-mono">project://</code>.
            </p>
            <div className="pt-1 border-t border-[#222B3B] font-mono text-[10px] text-slate-400 truncate" title={overview?.defaultProjectsDir}>
              Pasta padrão: {overview?.defaultProjectsDir || 'projects/'}
            </div>
          </div>
        </aside>

        {/* Right Project Workspace List */}
        <main className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Error Banner if any */}
          {errorMsg && (
            <div className="p-3.5 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-rose-300">Atenção na operação do projeto</div>
                  <div className="mt-0.5 text-rose-200/90">{errorMsg}</div>
                </div>
              </div>
            </div>
          )}

          {/* Search & Section Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#222B3B] pb-4">
            <div>
              <h1 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                {activeTab === 'my_projects' && (
                  <>
                    <Layers className="w-5 h-5 text-sky-400" />
                    <span>Meus Projetos</span>
                  </>
                )}
                {activeTab === 'recent' && (
                  <>
                    <Clock className="w-5 h-5 text-amber-400" />
                    <span>Projetos Recentes</span>
                  </>
                )}
                {activeTab === 'demos' && (
                  <>
                    <Sparkles className="w-5 h-5 text-emerald-400" />
                    <span>Demonstrações e Exemplos Oficiais</span>
                  </>
                )}
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                {activeTab === 'my_projects' &&
                  'Projetos criados ou importados pelo usuário com raiz project:// independente e recursos identificados por UUID.'}
                {activeTab === 'recent' &&
                  'Histórico real de projetos abertos pelo usuário. Projetos movidos ou renomeados podem ser relocados.'}
                {activeTab === 'demos' &&
                  'Projetos demonstrativos pré-instalados para estudo da engine ou clonagem como template independente.'}
              </p>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filtrar por nome, pasta ou UUID..."
                className="w-full pl-8 pr-3 py-1.5 rounded-md bg-[#121721] border border-[#222B3B] focus:border-sky-500 text-xs text-slate-100 placeholder-slate-500 outline-none"
              />
            </div>
          </div>

          {/* TAB 1: MEUS PROJETOS */}
          {activeTab === 'my_projects' && (
            <div className="space-y-3">
              {filteredMyProjects.length === 0 ? (
                <div className="p-8 rounded-lg bg-[#121721] border border-[#222B3B] text-center space-y-4">
                  <div className="w-10 h-10 rounded-md bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 mx-auto">
                    <FolderPlus className="w-5 h-5" />
                  </div>
                  <div className="max-w-md mx-auto space-y-1">
                    <h3 className="text-sm font-semibold text-slate-100">
                      Nenhum projeto de usuário encontrado
                    </h3>
                    <p className="text-xs text-slate-400">
                      Crie um novo projeto com cena 3D padrão, cena vazia ou a partir do template da Demo Geométrica, ou abra uma pasta existente contendo <code className="text-sky-300 font-mono">maxros.project.json</code>.
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => handleOpenCreateModal('standard_3d', 'Meu Jogo 3D')}
                      className="px-4 py-2 rounded-md text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 flex items-center gap-1.5 cursor-pointer"
                    >
                      <FolderPlus className="w-3.5 h-3.5" />
                      <span>Criar Novo Projeto</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('demos')}
                      className="px-4 py-2 rounded-md text-xs font-medium bg-[#181F2C] hover:bg-[#222B3B] text-slate-200 border border-[#222B3B] flex items-center gap-1.5 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Ver Demonstrações</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {filteredMyProjects.map((proj) => (
                    <div
                      key={proj.uuid || proj.path}
                      className="p-4 rounded-md bg-[#121721] hover:bg-[#151B26] border border-[#222B3B] hover:border-[#2D3A4F] flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors"
                    >
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="text-sm font-bold text-slate-100 truncate">
                            {proj.name}
                          </span>
                          <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-sky-500/15 text-sky-300 border border-sky-500/30">
                            PROJETO DO USUÁRIO
                          </span>
                          <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-[#0B0E14] text-slate-300 border border-[#222B3B]">
                            Engine v{proj.engineVersion}
                          </span>
                          {proj.coreVersionMismatch && (
                            <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              Core v{proj.coreVersion} (Atualização disponível)
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-slate-400">
                          <span title="Raiz física correspondente a project://">
                            project:// → {proj.path}
                          </span>
                          <span>UUID: {proj.uuid}</span>
                          {proj.mainSceneRelativePath && (
                            <span className="text-emerald-400/90">
                              Cena Principal: {proj.mainSceneRelativePath}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {proj.coreVersionMismatch && (
                          <button
                            type="button"
                            onClick={() => onUpdateProjectCore(proj.path)}
                            className="px-2.5 py-1.5 rounded-md text-xs font-medium bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-500/30 flex items-center gap-1.5 cursor-pointer"
                            title="Atualizar explicitamente a cópia do runtime core/ deste projeto"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Atualizar Core</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onOpenProject({ projectPath: proj.path })}
                          className="px-3.5 py-1.5 rounded-md text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 flex items-center gap-1.5 cursor-pointer"
                        >
                          <span>Abrir no Editor</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PROJETOS RECENTES */}
          {activeTab === 'recent' && (
            <div className="space-y-3">
              {filteredRecentProjects.length === 0 ? (
                <div className="p-8 rounded-lg bg-[#121721] border border-[#222B3B] text-center space-y-2">
                  <Clock className="w-6 h-6 text-amber-400 mx-auto" />
                  <h3 className="text-sm font-semibold text-slate-100">
                    Nenhum projeto aberto recentemente
                  </h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    Esta lista registra exclusivamente projetos que você abriu ou criou. Demonstrações pré-instaladas não entram aqui até serem abertas.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {filteredRecentProjects.map((item) => (
                    <div
                      key={item.uuid || item.path}
                      className={`p-4 rounded-md bg-[#121721] border flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                        item.available
                          ? 'border-[#222B3B] hover:border-[#2D3A4F]'
                          : 'border-amber-500/40 bg-amber-500/5'
                      }`}
                    >
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="text-sm font-bold text-slate-100 truncate">
                            {item.name}
                          </span>
                          {item.available ? (
                            <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>DISPONÍVEL</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              <span>PASTA MOVIDA OU INDISPONÍVEL</span>
                            </span>
                          )}
                          <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-[#0B0E14] text-slate-400 border border-[#222B3B]">
                            {item.type === 'demo' ? 'DEMO' : 'USER'}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-slate-400">
                          <span>Caminho: {item.path}</span>
                          {item.uuid && <span>UUID: {item.uuid}</span>}
                          {item.lastOpenedAt && (
                            <span>
                              Última abertura: {new Date(item.lastOpenedAt).toLocaleString('pt-BR')}
                            </span>
                          )}
                        </div>

                        {!item.available && item.statusMessage && (
                          <div className="text-xs text-amber-300/90 mt-1">
                            {item.statusMessage}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {!item.available ? (
                          <button
                            type="button"
                            onClick={() => {
                              setRelocateTarget(item);
                              setRelocateNewPath(item.path);
                            }}
                            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1.5 cursor-pointer"
                          >
                            <MapPin className="w-3.5 h-3.5" />
                            <span>Localizar Nova Pasta</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onOpenProject({ projectPath: item.path })}
                            className="px-3.5 py-1.5 rounded-md text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 flex items-center gap-1.5 cursor-pointer"
                          >
                            <span>Abrir</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => onRemoveRecentProject(item.uuid || item.path)}
                          className="p-1.5 rounded-md bg-[#181F2C] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-[#222B3B] transition-colors cursor-pointer"
                          title="Remover do histórico de Projetos Recentes"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: DEMONSTRAÇÕES E EXEMPLOS */}
          {activeTab === 'demos' && (
            <div className="grid grid-cols-1 gap-4">
              {filteredDemoProjects.map((demo) => (
                <div
                  key={demo.uuid || demo.path}
                  className="p-5 rounded-lg bg-[#121721] border border-[#222B3B] flex flex-col lg:flex-row lg:items-center justify-between gap-5"
                >
                  <div className="space-y-2 max-w-2xl">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="px-2 py-0.5 text-[10px] font-mono font-semibold uppercase rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        DEMONSTRAÇÃO OFICIAL
                      </span>
                      <h3 className="text-base font-bold text-slate-100">
                        {demo.name}
                      </h3>
                      <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-[#0B0E14] text-slate-300 border border-[#222B3B]">
                        v{demo.engineVersion}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">
                      Mini-jogo demonstrativo completo construído com formas geométricas, câmera em 3ª pessoa, física <code className="text-sky-300 font-mono">cannon-es</code>, patrulha de drone, cristais animados por script <code className="text-sky-300 font-mono">.script.js</code> e referências estruturadas por UUID.
                    </p>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-slate-400">
                      <span>Raiz: {demo.path}</span>
                      <span>UUID: {demo.uuid}</span>
                      <span className="text-emerald-400">Cena: {demo.mainSceneRelativePath || 'scenes/main.scene.json'}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        handleOpenCreateModal(
                          'geometric_demo',
                          'Minha Arena dos Cristais'
                        )
                      }
                      className="px-3.5 py-2 rounded-md text-xs font-semibold bg-[#181F2C] hover:bg-[#222B3B] text-slate-100 border border-[#2D3A4F] flex items-center gap-1.5 cursor-pointer"
                      title="Cria um novo projeto independente (type: user) com novos UUIDs baseado nesta demonstração"
                    >
                      <Copy className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Usar como Template (Novo Projeto)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenProject({ projectPath: demo.path })}
                      className="px-4 py-2 rounded-md text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Abrir Demonstração</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* ============================================================================
          MODAL: CRIAR NOVO PROJETO
         ============================================================================ */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-lg bg-[#121721] border border-[#2D3A4F] shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-[#181F2C] border-b border-[#222B3B] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <FolderPlus className="w-4 h-4 text-sky-400" />
                <h2 className="text-sm font-bold text-slate-100">
                  Criar Novo Projeto — Maxros Engine
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                Fechar
              </button>
            </div>

            <form onSubmit={handleConfirmCreate} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1">
                    Nome do Projeto (Exibição)
                  </label>
                  <input
                    type="text"
                    required
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="Ex.: Meu Jogo 3D"
                    className="w-full px-3 py-2 rounded-md bg-[#0B0E14] border border-[#222B3B] focus:border-sky-500 text-xs text-slate-100 outline-none"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Gravado em <code className="font-mono text-sky-300">maxros.project.json</code> (aceita espaços e acentos).
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1">
                    Nome da Pasta Física
                  </label>
                  <input
                    type="text"
                    required
                    value={newFolderName}
                    onChange={(e) => {
                      setFolderManuallyEdited(true);
                      setNewFolderName(e.target.value);
                    }}
                    placeholder="Ex.: meu-jogo-3d"
                    className="w-full px-3 py-2 rounded-md bg-[#0B0E14] border border-[#222B3B] focus:border-sky-500 text-xs font-mono text-slate-100 outline-none"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Diretório raiz para <code className="font-mono text-emerald-300">project://</code>.
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1">
                  Diretório Pai dos Projetos
                </label>
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    value={newBaseDir}
                    onChange={(e) => setNewBaseDir(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-md bg-[#0B0E14] border border-[#222B3B] focus:border-sky-500 text-xs font-mono text-slate-200 outline-none"
                  />
                </div>
                <div className="text-[10px] font-mono text-slate-400 mt-1">
                  Raiz física final (<code className="text-emerald-300">project://</code>):{' '}
                  <span className="text-slate-200">
                    {(newBaseDir || overview?.defaultProjectsDir || 'projects').replace(/\/+$/, '')}/{newFolderName || 'novo-projeto'}
                  </span>
                </div>
              </div>

              {/* Seleção de Cena Inicial / Template */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-200">
                  Opção de Cena Inicial (<code className="font-mono text-sky-300">scenes/main.scene.json</code>)
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setSelectedTemplate('standard_3d')}
                    className={`p-3 rounded-md border text-left transition-all cursor-pointer ${
                      selectedTemplate === 'standard_3d'
                        ? 'bg-sky-500/15 border-sky-500 text-slate-100'
                        : 'bg-[#0B0E14] border-[#222B3B] text-slate-300 hover:border-[#2D3A4F]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">Cena 3D Padrão</span>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300">
                        Padrão
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1.5 leading-snug">
                      Inclui Camera3D, iluminação direcional/ambiente e plano de chão simples, pronta para trabalhar.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedTemplate('empty')}
                    className={`p-3 rounded-md border text-left transition-all cursor-pointer ${
                      selectedTemplate === 'empty'
                        ? 'bg-sky-500/15 border-sky-500 text-slate-100'
                        : 'bg-[#0B0E14] border-[#222B3B] text-slate-300 hover:border-[#2D3A4F]'
                    }`}
                  >
                    <div className="text-xs font-bold">Cena Vazia</div>
                    <p className="text-[11px] text-slate-400 mt-1.5 leading-snug">
                      Apenas o nó raiz da cena, sem câmera, luzes ou objetos iniciais pré-criados.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedTemplate('geometric_demo')}
                    className={`p-3 rounded-md border text-left transition-all cursor-pointer ${
                      selectedTemplate === 'geometric_demo'
                        ? 'bg-emerald-500/15 border-emerald-500 text-slate-100'
                        : 'bg-[#0B0E14] border-[#222B3B] text-slate-300 hover:border-[#2D3A4F]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">Demo Geométrica</span>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                        Template
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1.5 leading-snug">
                      Clona o Guardião Geométrico como projeto independente (<code className="font-mono">user</code>) com novos UUIDs.
                    </p>
                  </button>
                </div>
              </div>

              <div className="pt-3 border-t border-[#222B3B] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3.5 py-2 rounded-md text-xs font-medium bg-[#181F2C] hover:bg-[#222B3B] text-slate-300 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 rounded-md text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span>{creating ? 'Provisionando Projeto & Core...' : 'Criar e Abrir Projeto'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================================
          MODAL: ABRIR PROJETO EXISTENTE (Seletor Nativo do SO + Caminho Manual)
         ============================================================================ */}
      {showOpenModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-lg bg-[#121721] border border-[#2D3A4F] shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-[#181F2C] border-b border-[#222B3B] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <FolderOpen className="w-4 h-4 text-sky-400" />
                <h2 className="text-sm font-bold text-slate-100">
                  Abrir Projeto Existente
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowOpenModal(false)}
                className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                Fechar
              </button>
            </div>

            <form onSubmit={handleConfirmOpen} className="p-5 space-y-4">
              {/* Opção 1: Seletor Nativo de Arquivo do Sistema Operacional */}
              <div className="p-3.5 rounded-md bg-[#0B0E14] border border-[#222B3B] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <FileJson className="w-4 h-4 text-sky-400" />
                    <span>1. Selecionar arquivo maxros.project.json (Seletor Nativo)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1 rounded text-xs font-medium bg-[#181F2C] hover:bg-[#222B3B] text-sky-300 border border-sky-500/30 cursor-pointer"
                  >
                    Escolher Arquivo...
                  </button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.maxros,.core3d"
                  onChange={handleNativeManifestSelect}
                  className="hidden"
                />

                {selectedManifestInfo ? (
                  <div className="p-2.5 rounded bg-[#121721] border border-[#222B3B] text-[11px] font-mono space-y-1">
                    <div className="text-slate-200 font-semibold">
                      Arquivo lido: {selectedManifestInfo.fileName}
                    </div>
                    {selectedManifestInfo.name && (
                      <div className="text-sky-300">Projeto: {selectedManifestInfo.name}</div>
                    )}
                    {selectedManifestInfo.uuid && (
                      <div className="text-slate-400">UUID: {selectedManifestInfo.uuid}</div>
                    )}
                    {selectedManifestInfo.isLegacy && (
                      <div className="text-amber-300">
                        Formato legado detectado — será migrado de forma segura para maxros.project.json.
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400">
                    Selecione o manifesto <code className="font-mono text-sky-300">maxros.project.json</code> (ou legado <code className="font-mono">project.core3d</code>) através do diálogo nativo do seu sistema.
                  </p>
                )}
              </div>

              {/* Opção 2: Caminho Manual Validado */}
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1">
                  2. Caminho da Pasta do Projeto ou do Arquivo Manifesto
                </label>
                <input
                  type="text"
                  value={manualOpenPath}
                  onChange={(e) => setManualOpenPath(e.target.value)}
                  placeholder="Ex.: projects/guardiao-geometrico-demo ou caminho absoluto"
                  className="w-full px-3 py-2 rounded-md bg-[#0B0E14] border border-[#222B3B] focus:border-sky-500 text-xs font-mono text-slate-100 outline-none"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  A raiz dinâmica <code className="font-mono text-emerald-300">project://</code> será vinculada ao diretório onde está localizado o <code className="font-mono text-sky-300">maxros.project.json</code>.
                </span>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoMigrateOnOpen}
                  onChange={(e) => setAutoMigrateOnOpen(e.target.checked)}
                  className="rounded border-[#222B3B] bg-[#0B0E14] text-sky-500"
                />
                <span>
                  Migrar automaticamente caso seja um projeto legado (<code className="font-mono text-[11px]">project.core3d</code> / <code className="font-mono text-[11px]">.scene</code>)
                </span>
              </label>

              <div className="pt-3 border-t border-[#222B3B] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowOpenModal(false)}
                  className="px-3.5 py-2 rounded-md text-xs font-medium bg-[#181F2C] hover:bg-[#222B3B] text-slate-300 cursor-pointer"
                >
                  Cancelar
                </button>
                {manualOpenPath.trim() && (
                  <button
                    type="button"
                    onClick={async () => {
                      await onMigrateLegacyProject(manualOpenPath.trim());
                      setShowOpenModal(false);
                    }}
                    className="px-3 py-2 rounded-md text-xs font-medium bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 cursor-pointer"
                  >
                    Migrar Legado
                  </button>
                )}
                <button
                  type="submit"
                  disabled={opening || (!manualOpenPath.trim() && !selectedManifestInfo?.uuid)}
                  className="px-4 py-2 rounded-md text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>{opening ? 'Abrindo...' : 'Validar e Abrir Projeto'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================================
          MODAL: RELOCAR PROJETO MOVIDO / RENOMEADO
         ============================================================================ */}
      {relocateTarget && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-lg bg-[#121721] border border-[#2D3A4F] shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-[#181F2C] border-b border-[#222B3B] flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-100">
                Localizar Nova Pasta do Projeto — {relocateTarget.name}
              </h2>
              <button
                type="button"
                onClick={() => setRelocateTarget(null)}
                className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                Fechar
              </button>
            </div>

            <form onSubmit={handleConfirmRelocate} className="p-5 space-y-4">
              <div className="text-xs text-slate-300 space-y-1">
                <div>
                  Caminho anterior: <code className="font-mono text-amber-300">{relocateTarget.path}</code>
                </div>
                <div>
                  Informe o novo caminho onde a pasta do projeto foi movida ou renomeada:
                </div>
              </div>

              <input
                type="text"
                required
                value={relocateNewPath}
                onChange={(e) => setRelocateNewPath(e.target.value)}
                placeholder="Novo caminho da pasta contendo maxros.project.json"
                className="w-full px-3 py-2 rounded-md bg-[#0B0E14] border border-[#222B3B] focus:border-sky-500 text-xs font-mono text-slate-100 outline-none"
              />

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setRelocateTarget(null)}
                  className="px-3.5 py-1.5 rounded-md text-xs bg-[#181F2C] text-slate-300 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-md text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer"
                >
                  Atualizar Localização
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
