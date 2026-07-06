import React, { useState, useEffect } from 'react';
import { ZampaEdition, ZampaProject, ZampaPhoto, User } from '../types';
import { t } from '../lib/translations';
import { Plus, Trash2, Edit2, Upload, Camera, ListOrdered, Award, ArrowUp, ArrowDown, Check, ArrowRightLeft, Sparkles } from 'lucide-react';
import { compressImage, uploadToCloudinary } from '../lib/cloudinary';
import ConfirmModal from './ConfirmModal';
import FullscreenViewer from './FullscreenViewer';
import { replicateZampaFromTestToNormal, getCurrentMode, analyzeZampaReplication, ReplicationAnalysis } from '../lib/supabaseClient';

interface ZampaAdminProps {
  currentEdition: ZampaEdition | null;
  projects: ZampaProject[];
  onUpdateEdition: (status: ZampaEdition['status'], winnerAdult?: string | null) => Promise<boolean>;
  onInitEdition: (year: number) => Promise<boolean>;
  onSaveProject: (project: Partial<ZampaProject>) => Promise<boolean>;
  onDeleteProject: (projectId: string) => Promise<boolean>;
  onSavePhoto: (photo: Partial<ZampaPhoto>) => Promise<boolean>;
  onDeletePhoto: (photoId: string) => Promise<boolean>;
  onSavePopularRanks: (ranks: Record<string, number>) => Promise<boolean>;
  onGenerateFakeVotes?: () => Promise<void>;
  onDeleteFakeVotes?: () => Promise<void>;
  onGenerateFakeResults?: () => Promise<void>;
  onDeleteFakeResults?: () => Promise<void>;
  lang: 'ca' | 'es';
  users: User[];
  userRanks: any[];
  currentUser?: User | null;
}

export default function ZampaAdmin({
  currentEdition,
  projects,
  onUpdateEdition,
  onInitEdition,
  onSaveProject,
  onDeleteProject,
  onSavePhoto,
  onDeletePhoto,
  onSavePopularRanks,
  onGenerateFakeVotes,
  onDeleteFakeVotes,
  onGenerateFakeResults,
  onDeleteFakeResults,
  lang,
  users,
  userRanks,
  currentUser,
}: ZampaAdminProps) {
  const isSuperAdmin = currentUser?.role === 'admin';
  const [initYear, setInitYear] = useState<number>(new Date().getFullYear());
  const [showAddProjectModal, setShowAddProjectModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Partial<ZampaProject> | null>(null);
  
  // States for selected project details & photo uploads
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState('');
  const [savingPhotoId, setSavingPhotoId] = useState<string | null>(null);
  const [reorderingInProgress, setReorderingInProgress] = useState<string | null>(null);

  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    cancelText?: string;
    isDanger?: boolean;
    isWarning?: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const triggerConfirm = (config: Omit<typeof confirmConfig, 'isOpen'>) => {
    setConfirmConfig({ ...config, isOpen: true });
  };

  const closeConfirm = () => {
    setConfirmConfig(prev => ({ ...prev, isOpen: false }));
  };

  // Lightbox viewer states
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState('');
  const [lightboxPhotos, setLightboxPhotos] = useState<{ url: string; fileName?: string }[]>([]);
  const [lightboxStartIdx, setLightboxStartIdx] = useState(0);
  
  // Results inputs
  const [officialWinnerAdult, setOfficialWinnerAdult] = useState('');
  const [popularRanks, setPopularRanks] = useState<Record<string, number>>({});

  useEffect(() => {
    if (currentEdition) {
      setOfficialWinnerAdult(currentEdition.official_winner_adult || '');
    }
  }, [currentEdition]);

  useEffect(() => {
    const initialRanks: Record<string, number> = {};
    projects.forEach(p => {
      if (p.popular_rank_position) {
        initialRanks[p.id] = p.popular_rank_position;
      }
    });
    setPopularRanks(initialRanks);
  }, [projects]);

  const activeProject = projects.find(p => p.id === selectedProjectId);

  const handleCreateEdition = async () => {
    if (!initYear) return;
    await onInitEdition(initYear);
  };

  const handleSaveProj = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject?.author_name || !editingProject?.project_title) return;
    
    const projectToSave: Partial<ZampaProject> = {
      ...editingProject,
      edition_year: currentEdition?.id,
    };
    
    const ok = await onSaveProject(projectToSave);
    if (ok) {
      setShowAddProjectModal(false);
      setEditingProject(null);
    }
  };

  const fileDropHandler = async (e: React.DragEvent, projId: string) => {
    e.preventDefault();
    const files = e.dataTransfer.files ? Array.from(e.dataTransfer.files) as File[] : [];
    if (files.length > 0) await uploadPhotosForProject(projId, files);
  };

  const fileSelectHandler = async (e: React.ChangeEvent<HTMLInputElement>, projId: string) => {
    const files = e.target?.files ? Array.from(e.target.files) as File[] : [];
    if (files.length > 0) await uploadPhotosForProject(projId, files);
  };

  const uploadPhotosForProject = async (projId: string, files: File[]) => {
    if (uploadProgress || files.length === 0) return;
    setUploadProgress(true);
    let successCount = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgressText(`Pujant: imatge ${i + 1} de ${files.length} ("${file.name}")...`);
        const compressed = await compressImage(file);
        const folder = `Zampa/${currentEdition?.id}/${projId}`;
        const url = await uploadToCloudinary(compressed, folder);
        
        const nextIndex = ((activeProject as any)?.photos?.length || 0) + successCount;
        await onSavePhoto({
          id: 'zp_' + (Date.now() + i),
          project_id: projId,
          file_url: url,
          file_name: file.name,
          order_index: nextIndex,
        });
        successCount++;
      }
    } catch (err: any) {
      alert(`Error en pujar imatges: ${err.message}`);
    } finally {
      setUploadProgress(false);
      setUploadProgressText('');
    }
  };

  const handleInlineSave = async (photo: ZampaPhoto, field: 'photo_title' | 'description', val: string) => {
    const originalValue = field === 'photo_title' ? photo.photo_title : photo.description;
    if (val === (originalValue || '')) return;
    
    setSavingPhotoId(`${photo.id}_${field}`);
    try {
      await onSavePhoto({ ...photo, [field]: val });
    } catch (err) {
      console.error(err);
    } finally {
      setTimeout(() => {
        setSavingPhotoId((prev) => prev === `${photo.id}_${field}` ? null : prev);
      }, 1500);
    }
  };

  const movePhoto = async (photo: ZampaPhoto, direction: 'prev' | 'next') => {
    if (reorderingInProgress) return;
    const photos = [...((activeProject as any).photos || [])].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
    const idx = photos.findIndex(p => p.id === photo.id);
    if (idx === -1) return;
    
    let targetIndex = -1;
    if (direction === 'prev' && idx > 0) {
      targetIndex = idx - 1;
    } else if (direction === 'next' && idx < photos.length - 1) {
      targetIndex = idx + 1;
    }

    if (targetIndex !== -1) {
      setReorderingInProgress(photo.id);
      try {
        const targetPhoto = photos[targetIndex];
        const currentOrder = photo.order_index ?? 0;
        const targetOrder = targetPhoto.order_index ?? 0;
        
        await onSavePhoto({ ...photo, order_index: targetOrder });
        await onSavePhoto({ ...targetPhoto, order_index: currentOrder });
      } catch (err) {
        console.error("Error al reordenar la foto:", err);
      } finally {
        setReorderingInProgress(null);
      }
    }
  };

  const [isReplicating, setIsReplicating] = useState(false);
  const [showReplicateModal, setShowReplicateModal] = useState(false);
  const [replicationAnalysis, setReplicationAnalysis] = useState<ReplicationAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [copyMissingUsersOpt, setCopyMissingUsersOpt] = useState(true);
  const [understoodImpact, setUnderstoodImpact] = useState(false);
  const currentMode = getCurrentMode();

  const handleReplicateToReal = async () => {
    setIsAnalyzing(true);
    try {
      const res = await analyzeZampaReplication();
      setReplicationAnalysis(res);
      setCopyMissingUsersOpt(true);
      setUnderstoodImpact(false);
      setShowReplicateModal(true);
    } catch (err: any) {
      alert(`Error analitzant les dades de la base de dades: ${err.message || err}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const executeReplication = async () => {
    if (!understoodImpact) return;
    setIsReplicating(true);
    try {
      const res = await replicateZampaFromTestToNormal(copyMissingUsersOpt);
      setShowReplicateModal(false);
      triggerConfirm({
        title: res.success ? "🎉 Rèplica Completada amb Èxit" : "❌ Error de Rèplica",
        message: res.message,
        confirmText: "D'acord",
        cancelText: "Tanca",
        isDanger: !res.success,
        onConfirm: () => { closeConfirm(); },
      });
    } catch (err: any) {
      triggerConfirm({
        title: "❌ Error Inesperat",
        message: `S'ha produït un error inesperat durant el procés de volcat:\n${err?.message || err}`,
        confirmText: "Entesos",
        cancelText: "Tanca",
        isDanger: true,
        onConfirm: () => { closeConfirm(); },
      });
    } finally {
      setIsReplicating(false);
    }
  };

  const submitResults = () => {
    if (!currentEdition) return;
    triggerConfirm({
      title: "Publicar Resultats i Finalitzar Edició?",
      message: "Estàs a punt de publicar els veredictes oficials i el rànquing del Zampa d'aquesta edició. Això tancarà formalment la fase de càrrega de resultats i permetrà als socis veure la classificació popular real enfront de les seves prediccions. Vols continuar?",
      confirmText: "Sí, guardar i finalitzar",
      onConfirm: async () => {
        const ok = await onUpdateEdition('finished', officialWinnerAdult || null);
        if (ok) {
          await onSavePopularRanks(popularRanks);
        }
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* 1. Header / Status banner */}
      <div className="bg-surface1 border border-brand-border rounded-2xl p-6 backdrop-blur-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-brand-border pb-4 mb-4">
          <div>
            <h2 className="text-3xl font-display tracking-widest text-brand-text mb-1">
              GESTIÓ PREMIS ZAMPA
            </h2>
            <p className="text-xs text-brand-text-muted font-mono uppercase tracking-wider">
              Entorn actual: <span className={`font-bold ${currentMode === 'normal' ? 'text-emerald-400' : currentMode === 'test' ? 'text-amber-400' : 'text-purple-400'}`}>{currentMode === 'normal' ? 'PRODUCCIÓ (REAL)' : currentMode === 'test' ? 'TEST (PROVES)' : 'PRÒPIA / CUSTOM'}</span>
            </p>
          </div>
          {isSuperAdmin && currentMode === 'test' && (
            <button
              onClick={handleReplicateToReal}
              disabled={isReplicating || isAnalyzing}
              className="bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-amber-500/10 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" /> {isAnalyzing ? 'Analitzant...' : isReplicating ? 'Replicant...' : 'Passar a real (Rèplica a Producció)'}
            </button>
          )}
        </div>

        
        {!currentEdition ? (
          <div className="space-y-4">
            <p className="text-brand-text-muted text-sm">
              No hi ha cap edició dels Premis Zampa creada per a aquest any. {isSuperAdmin ? "Inicialitza una nova edició per començar." : "Demana al super-administrador de la FEM que inicialitzi l'edició de Zampa d'aquest any."}
            </p>
            {isSuperAdmin && (
              <div className="flex gap-4 items-center">
                <input
                  type="number"
                  value={initYear}
                  onChange={(e) => setInitYear(parseInt(e.target.value))}
                  className="bg-bg1/60 border border-brand-border-high text-brand-text px-4 py-2.5 rounded-lg font-mono focus:outline-none focus:border-brand-accent max-w-[120px]"
                />
                <button
                  className="bg-brand-accent hover:opacity-90 active:scale-95 text-white font-semibold px-6 py-2.5 rounded-lg flex items-center gap-2 cursor-pointer shadow-lg shadow-brand-accent-glow"
                  onClick={handleCreateEdition}
                >
                  <Plus size={18} /> Inicialitzar Edició Zampa
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <span className="text-xl font-bold font-mono text-brand-accent">
                  ZAMPA Edició {currentEdition.id}
                </span>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${
                  currentEdition.status === 'open' ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/30' :
                  currentEdition.status === 'vote' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30' :
                  currentEdition.status === 'closed' ? 'bg-indigo-500/10 text-indigo-500 border border-indigo-500/30' :
                  'bg-brand-text-muted/10 text-brand-text-muted border border-brand-border'
                }`}>
                  Estat: {currentEdition.status}
                </span>
              </div>
              <p className="text-xs text-brand-text-muted">
                {currentEdition.status === 'open' && "Admins configuren projectes i fotos. Socis no veuen res."}
                {currentEdition.status === 'vote' && "S'ha obert el visionat i classificació per als socis."}
                {currentEdition.status === 'closed' && "S'han tancat els vots de socis. Admin carrega veredictes reals."}
                {currentEdition.status === 'finished' && "Edició arxivada. Comparativa general i rànquings visibles."}
              </p>
            </div>

            {isSuperAdmin && (
              <div className="flex flex-wrap gap-2">
                {currentEdition.status === 'open' && (
                  <button
                    onClick={() => onUpdateEdition('vote')}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-5 py-2 rounded-lg cursor-pointer transition-colors text-sm"
                  >
                    🚀 Obrir Fase Votació
                  </button>
                )}
                {currentEdition.status === 'vote' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        triggerConfirm({
                          title: "Tornar a Fase de Càrrega?",
                          message: "Atenció: segur que vols tornar a la fase de càrrega per afegir/modificar fotografies? Això impedirà temporalment que os socis puguin votar.",
                          onConfirm: () => onUpdateEdition('open'),
                          isWarning: true,
                          confirmText: "Sí, reobrir càrrega",
                        });
                      }}
                      className="bg-yellow-600 hover:bg-yellow-500 text-white font-semibold px-4 py-2 rounded-lg cursor-pointer transition-colors text-sm"
                    >
                      ↩ Tornar a Càrrega (Estat Open)
                    </button>
                    <button
                      onClick={() => {
                        triggerConfirm({
                          title: "Tancar Votacions Socis?",
                          message: "Segur que vols tancar les votacions de socis o membres?",
                          onConfirm: () => onUpdateEdition('closed'),
                          confirmText: "Sí, tancar votacions",
                        });
                      }}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-5 py-2 rounded-lg cursor-pointer transition-colors text-sm"
                    >
                      🔒 Tancar Votacions Socis
                    </button>
                  </div>
                )}
                {currentEdition.status === 'closed' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        triggerConfirm({
                          title: "Tornar a Fase de Càrrega?",
                          message: "Atenció: segur que vols tornar a la fase de càrrega per afegir/modificar fotografies? Això podria alterar l'ordre dels formularis establerts. Vols reobrir la Càrrega?",
                          onConfirm: () => onUpdateEdition('open'),
                          isWarning: true,
                          confirmText: "Sí, reobrir",
                        });
                      }}
                      className="bg-yellow-600/40 hover:bg-yellow-500 text-white font-semibold px-4 py-2 rounded-lg cursor-pointer transition-colors text-sm border border-yellow-500/30"
                    >
                      ↩ Tornar a Càrrega (Estat Open)
                    </button>
                    <button
                      onClick={() => onUpdateEdition('vote')}
                      className="bg-yellow-600 hover:bg-yellow-500 text-white font-semibold px-4 py-2 rounded-lg cursor-pointer transition-colors text-sm"
                    >
                      ↩ Reobrir Votació
                    </button>
                  </div>
                )}
                {currentEdition.status === 'finished' && (
                  <button
                    onClick={() => {
                      triggerConfirm({
                        title: "Reobrir Formulari?",
                        message: "Segur que vols reobrir la gestió de resultats d'aquesta edició?",
                        onConfirm: () => onUpdateEdition('closed'),
                        confirmText: "Sí, reobrir",
                      });
                    }}
                    className="bg-brand-border hover:bg-surface3 text-brand-text font-semibold px-5 py-2 rounded-lg cursor-pointer transition-colors text-sm border border-brand-border-high"
                  >
                    ↩ Reobrir Formulari Resultats
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 🧪 PANEL DE SIMULACIÓ / PROVES DE FUNCIONALITATS */}
      {currentEdition && isSuperAdmin && (
        <div className="bg-amber-500/5 border border-amber-500/15 rounded-2xl p-5 text-left space-y-4">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="space-y-1">
              <h4 className="text-amber-400 font-bold font-mono tracking-wider text-xs uppercase flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '4s' }} />
                <span>🧪 PANELS DE SIMULACIÓ (Ales i entorn de proves de la FEM)</span>
              </h4>
              <p className="text-[11px] text-brand-text-muted leading-relaxed max-w-2xl">
                Interfície d'automatització instantània per verificar ràpidament el comportament i algoritmes consesuats de la bústia Zampa sense necessitar d'altres usuaris reals o votacions manuals de prova.
              </p>
            </div>
            
            <div className="flex flex-wrap md:flex-nowrap gap-3 shrink-0">
              {/* Vots Ficticis */}
              <div className="bg-surface2/40 border border-brand-border/60 rounded-xl p-3 flex flex-col gap-2 min-w-[220px]">
                <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-brand-text-muted border-b border-brand-border/40 pb-1 flex items-center justify-between">
                  <span>1. SIMULACIÓ DE SOCIS</span>
                  <span className="text-amber-500/60 font-medium">10 + TU</span>
                </span>
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={onGenerateFakeVotes}
                    className="w-full bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-500/50 text-amber-300 font-bold text-[10px] py-1.5 px-3 rounded-lg uppercase cursor-pointer tracking-wider select-none transition-all duration-200"
                  >
                    🎲 Generar 10 Votacions
                  </button>
                  <button
                    onClick={onDeleteFakeVotes}
                    className="w-full bg-red-950/10 hover:bg-red-950/30 border border-red-500/20 text-red-300 hover:text-red-200 font-semibold text-[10px] py-1.5 px-3 rounded-lg uppercase cursor-pointer tracking-wider select-none transition-all duration-200"
                  >
                    🗑️ Netejar Vots Ficticis
                  </button>
                </div>
              </div>

              {/* Resultats Ficticis */}
              <div className="bg-surface2/40 border border-brand-border/60 rounded-xl p-3 flex flex-col gap-2 min-w-[220px]">
                <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-brand-text-muted border-b border-brand-border/40 pb-1 flex items-center justify-between">
                  <span>2. FINAL DE FESTA ZAMPA</span>
                  <span className="text-purple-400 font-medium font-mono">REALS</span>
                </span>
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={onGenerateFakeResults}
                    className="w-full bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 hover:border-purple-500/50 text-purple-300 font-bold text-[10px] py-1.5 px-3 rounded-lg uppercase cursor-pointer tracking-wider select-none transition-all duration-200"
                  >
                    🏆 Inserir Resultats Reals
                  </button>
                  <button
                    onClick={onDeleteFakeResults}
                    className="w-full bg-red-950/10 hover:bg-red-950/30 border border-red-500/20 text-red-300 hover:text-red-200 font-semibold text-[10px] py-1.5 px-3 rounded-lg uppercase cursor-pointer tracking-wider select-none transition-all duration-200"
                  >
                    🗑️ Netejar Resultats Reals
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {currentEdition && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LLISTAT DE PROJECTES */}
          <div className="lg:col-span-4 bg-surface1 border border-brand-border rounded-2xl p-5 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-brand-border">
              <h3 className="font-display text-xl tracking-wider text-brand-text">
                Autors i Projectes
              </h3>
              {currentEdition.status === 'open' && (
                <button
                  onClick={() => {
                    setEditingProject({ category: 'adult' });
                    setShowAddProjectModal(true);
                  }}
                  className="bg-brand-accent hover:opacity-95 text-white rounded-lg p-1.5 cursor-pointer"
                  title={t('zampa_new_project', lang)}
                >
                  <Plus size={16} />
                </button>
              )}
            </div>

            {projects.length === 0 ? (
              <p className="text-brand-text-muted text-xs text-center py-6">
                No hi ha projectes d'autors creats per a aquesta edició.
              </p>
            ) : (
              <div className="space-y-2 max-h-[450px] overflow-y-auto pr-1">
                {projects.map((proj) => (
                  <div
                    key={proj.id}
                    onClick={() => setSelectedProjectId(proj.id)}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      selectedProjectId === proj.id
                        ? 'bg-surface3 border-brand-accent text-brand-text'
                        : 'bg-surface2/40 border-brand-border hover:border-brand-border-high text-brand-text-muted'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-1">
                      <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-brand-accent/25 text-brand-accent">
                        Zampa
                      </span>
                      {currentEdition.status === 'open' && (
                        <div className="flex gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingProject(proj);
                              setShowAddProjectModal(true);
                            }}
                            className="p-1 hover:text-brand-text text-brand-text-muted"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              triggerConfirm({
                                title: "Eliminar Projecte?",
                                message: `Segur que vols eliminar definitivament el projecte de ${proj.author_name} d'aquesta edició?`,
                                onConfirm: () => {
                                  onDeleteProject(proj.id);
                                  if (selectedProjectId === proj.id) setSelectedProjectId(null);
                                },
                                isDanger: true,
                                confirmText: "Sí, eliminar",
                              });
                            }}
                            className="p-1 hover:text-red-500 text-brand-text-muted"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="font-semibold text-sm text-brand-text mt-1">
                      {proj.author_name}
                    </div>
                    <div className="text-xs italic truncate">
                      {proj.project_title}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* DETALLI DE PROJECTE I MOSAIC DE FOTOS */}
          <div className="lg:col-span-8 bg-surface1 border border-brand-border rounded-2xl p-5 space-y-6">
            {!activeProject ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center text-brand-text-muted border border-dashed border-brand-border rounded-xl">
                <Camera size={44} className="mb-3 opacity-30" />
                <p className="text-sm font-medium">Selecciona un projecte del panell esquerre per gestionar el seu mosaic fotogràfic.</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="border-b border-brand-border pb-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-2xl font-bold font-mono text-brand-text">
                      {activeProject.author_name}
                    </h3>
                    <span className="text-xs bg-bg1 px-2.5 py-1 rounded border border-brand-border font-mono text-brand-text-muted uppercase">
                      Zampa
                    </span>
                  </div>
                  <p className="text-xs text-brand-accent font-medium italic mt-0.5">
                    "{activeProject.project_title}"
                  </p>
                  {activeProject.description && (
                    <p className="text-xs text-brand-text-muted mt-2 max-w-2xl bg-bg1/40 p-2.5 rounded-lg">
                      {activeProject.description}
                    </p>
                  )}
                </div>

                {/* Zona de Drop para carga */}
                {currentEdition.status === 'open' && (
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => fileDropHandler(e, activeProject.id)}
                    className="border-2 border-dashed border-brand-border-high hover:border-brand-accent rounded-xl p-6 text-center cursor-pointer transition-colors bg-bg1/20 relative animate-pulse"
                  >
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => fileSelectHandler(e, activeProject.id)}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                      disabled={uploadProgress}
                    />
                    {uploadProgress ? (
                      <div className="flex flex-col items-center gap-3">
                        <span className="loader" />
                        <span className="text-xs text-brand-text font-semibold">{uploadProgressText || 'Comprimint i pujant imatges a Cloudinary...'}</span>
                      </div>
                    ) : (
                      <>
                        <Upload size={28} className="mx-auto text-brand-accent mb-2" />
                        <span className="text-sm font-semibold block text-brand-text">
                          Pujar o arrossegar un conjunt de fotos
                        </span>
                        <span className="text-[11px] text-brand-text-muted block mt-1">
                          Pots seleccionar moltes fotos alhora, arrossegar-les o fer clic per obrir l'explorador
                        </span>
                      </>
                    )}
                  </div>
                )}

                {/* Mosaic de Manteniment */}
                <div className="space-y-3">
                  <h4 className="text-xs uppercase tracking-wider font-semibold text-brand-text-muted">
                    Miniatures del mosaic ({ (activeProject as any).photos?.length || 0 } fotos)
                  </h4>

                  {!(activeProject as any).photos || (activeProject as any).photos.length === 0 ? (
                    <p className="text-xs text-brand-text-muted italic py-6 text-center bg-bg1/10 rounded-xl">
                      Aquest projecte encara no té cap foto. Puja'n per començar el mosaic.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {(() => {
                        const sortedPhotos = [...((activeProject as any).photos || [])].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
                        return sortedPhotos.map((photo: ZampaPhoto, idx: number) => (
                          <div
                            key={photo.id}
                            className="bg-bg1/40 border border-brand-border rounded-xl overflow-hidden relative group"
                          >
                            <img
                              src={photo.file_url}
                              alt={photo.file_name || `Photo ${idx}`}
                              className="w-full aspect-[4/3] object-cover bg-bg1 cursor-zoom-in group-hover:scale-[1.03] transition-transform duration-200"
                              onClick={() => {
                                const fullList = sortedPhotos.map((pt: any) => ({
                                  url: pt.file_url,
                                  fileName: pt.file_name || 'foto.jpg',
                                }));
                                setLightboxPhotos(fullList);
                                setLightboxStartIdx(idx);
                                setLightboxUrl(photo.file_url);
                                setLightboxOpen(true);
                              }}
                            />
                            
                            {/* Reordering Controls (top-left) */}
                            <div className="absolute top-2 left-2 flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity bg-black/60 p-1 rounded backdrop-blur">
                              {currentEdition.status === 'open' && (
                                <>
                                  <button
                                    onClick={() => movePhoto(photo, 'prev')}
                                    disabled={idx === 0 || reorderingInProgress != null}
                                    className="text-white hover:text-brand-accent disabled:opacity-35 p-1 cursor-pointer transition-colors"
                                    title="Moure enrere (Anterior)"
                                  >
                                    <ArrowUp size={14} className="-rotate-90 md:rotate-0" />
                                  </button>
                                  <button
                                    onClick={() => movePhoto(photo, 'next')}
                                    disabled={idx === sortedPhotos.length - 1 || reorderingInProgress != null}
                                    className="text-white hover:text-brand-accent disabled:opacity-35 p-1 cursor-pointer transition-colors"
                                    title="Moure endavant (Següent)"
                                  >
                                    <ArrowDown size={14} className="-rotate-90 md:rotate-0" />
                                  </button>
                                </>
                              )}
                            </div>

                            {/* Delete Button (top-right) */}
                            <div className="absolute top-2 right-2 flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity bg-black/60 p-1 rounded backdrop-blur">
                              {currentEdition.status === 'open' && (
                                <button
                                  onClick={() => {
                                    triggerConfirm({
                                      title: "Eliminar Imatge del Mosaic?",
                                      message: "Vols eliminar de forma permanent aquesta fotografia del mosaic del projecte?",
                                      onConfirm: () => onDeletePhoto(photo.id),
                                      isDanger: true,
                                      confirmText: "Sí, eliminar",
                                    });
                                  }}
                                  className="text-red-400 hover:text-red-300 p-1 cursor-pointer"
                                  title="Eliminar imatge"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                            
                            <div className="p-2 space-y-1">
                              {/* Inline inputs */}
                              <div className="relative flex items-center">
                                <input
                                  type="text"
                                  defaultValue={photo.photo_title || ''}
                                  placeholder="Títol opcional"
                                  disabled={currentEdition.status !== 'open'}
                                  onBlur={(e) => handleInlineSave(photo, 'photo_title', e.target.value.trim())}
                                  className="w-full bg-bg1/80 border border-brand-border rounded pl-1.5 pr-6 py-0.5 text-xs text-brand-text focus:outline-none focus:border-brand-accent"
                                />
                                {savingPhotoId === `${photo.id}_photo_title` && (
                                  <span className="absolute right-1.5 text-emerald-400 animate-pulse" title="Desat!">
                                    <Check size={12} />
                                  </span>
                                )}
                              </div>
                              <div className="relative flex items-center">
                                <input
                                  type="text"
                                  defaultValue={photo.description || ''}
                                  placeholder="Descripció opcional"
                                  disabled={currentEdition.status !== 'open'}
                                  onBlur={(e) => handleInlineSave(photo, 'description', e.target.value.trim())}
                                  className="w-full bg-bg1/80 border border-brand-border rounded pl-1.5 pr-6 py-0.5 text-[10px] text-brand-text-muted focus:outline-none focus:border-brand-accent"
                                />
                                {savingPhotoId === `${photo.id}_description` && (
                                  <span className="absolute right-1.5 text-emerald-400 animate-pulse" title="Desat!">
                                    <Check size={10} />
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAULELL D'EDICIÓ DE RESULTATS REALS: Visible només quan l'edició està 'closed' */}
      {currentEdition && currentEdition.status === 'closed' && isSuperAdmin && (
        <div className="bg-surface1 border border-brand-border rounded-2xl p-6 space-y-6">
          <div className="flex items-center gap-3 border-b border-brand-border pb-3">
            <Award className="text-brand-accent" size={24} />
            <h3 className="text-xl font-bold text-brand-text font-display tracking-wider">
              ENREGISTRAMENT DE VEREDICTES DE LA SALA
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Jurat Oficial */}
            <div className="space-y-4">
              <h4 className="text-xs uppercase font-bold text-brand-accent tracking-wider">
                Veredicte oficial del tribunal Fem
              </h4>

              <div className="space-y-3 bg-bg1/30 p-4 border border-brand-border rounded-xl">
                <div>
                  <label className="text-xs text-brand-text-muted block mb-1">
                    Guanyador Zampa
                  </label>
                  <select
                    value={officialWinnerAdult}
                    onChange={(e) => setOfficialWinnerAdult(e.target.value)}
                    className="w-full bg-bg1 border border-brand-border-high text-brand-text px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-brand-accent"
                  >
                    <option value="">Selecciona projecte Zampa...</option>
                    {projects.filter(p => p.category === 'adult').map(p => (
                      <option key={p.id} value={p.id}>{p.author_name} - {p.project_title}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Vot Popular (Zampa) i Opció B en un sol contenidor vertical */}
            <div className="space-y-6">
              {/* Option A */}
              <div className="space-y-4">
                <h4 className="text-xs uppercase font-bold text-brand-accent tracking-wider">
                  Classificació Votació Popular de la Sala (Zampa)
                </h4>

                {/* SUGERÈNCIA TRAVESSA DE LA FEM / CONSENS */}
                {(() => {
                  const adultProjs = projects.filter(p => p.category === 'adult');
                  const hasUserRanks = userRanks.some(r => r.category === 'adult');
                  if (!hasUserRanks) return null;

                  return (
                    <div className="bg-brand-accent/10 border border-brand-accent/20 rounded-xl p-3 text-left space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[11px] font-bold text-brand-text flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4 text-brand-accent" />
                          {lang === 'es' ? 'La Quiniela de la FEM (Consenso)' : 'La Travessa de la FEM (Consens)'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            // Calculate consensus positions
                            const consensus = adultProjs.map(proj => {
                              const ranks = userRanks.filter(r => r.project_id === proj.id && r.category === 'adult');
                              const count = ranks.length;
                              const sum = ranks.reduce((acc, r) => acc + r.assigned_position, 0);
                              const avg = count > 0 ? sum / count : 999;
                              const firsts = ranks.filter(r => r.assigned_position === 1).length;
                              return { id: proj.id, avg, sum, firsts, author: proj.author_name };
                            }).sort((a, b) => {
                              if (a.avg !== b.avg) return a.avg - b.avg;
                              if (a.firsts !== b.firsts) return b.firsts - a.firsts;
                              if (a.sum !== b.sum) return a.sum - b.sum;
                              return a.author.localeCompare(b.author);
                            });

                            const newRanks: Record<string, number> = {};
                            consensus.forEach((item, idx) => {
                              newRanks[item.id] = idx + 1;
                            });
                            setPopularRanks(newRanks);
                          }}
                          className="bg-brand-accent hover:opacity-90 active:scale-95 text-white font-mono font-bold text-[10px] px-2.5 py-1 rounded transition-all cursor-pointer shadow-md"
                        >
                          ⚡ {lang === 'es' ? 'Autocompletar' : 'Pre-omplir'}
                        </button>
                      </div>
                      <p className="text-[10px] text-brand-text-muted leading-relaxed">
                        {lang === 'es' 
                          ? 'Puedes pre-rellenar la votación popular basándote en la media de las clasificaciones hechas por los socios.'
                          : 'Pots pre-omplir directament la votació popular de la sala a partir de la posició mitjana consensuada pels socis.'}
                      </p>
                    </div>
                  );
                })()}

                <div className="bg-bg1/30 p-4 border border-brand-border rounded-xl space-y-3 max-h-[220px] overflow-y-auto font-sans">
                  <p className="text-[11px] text-brand-text-muted">
                    Selecciona la posició de cada projecte segons el recompte de vots populars de la sala:
                  </p>
                  {(() => {
                    const adultProjs = projects.filter(p => p.category === 'adult');
                    const count = adultProjs.length;

                    const getOrdinalCat = (n: number) => {
                      if (n === 1) return '1r';
                      if (n === 2) return '2n';
                      if (n === 3) return '3r';
                      if (n === 4) return '4t';
                      return `${n}è`;
                    };

                    return adultProjs.map((proj) => (
                      <div key={proj.id} className="flex justify-between items-center bg-bg1/60 p-2 rounded-lg border border-brand-border gap-3">
                        <span className="text-xs font-medium text-brand-text truncate max-w-[220px]" title={`${proj.author_name} - ${proj.project_title}`}>
                          {proj.author_name} - <span className="text-brand-text-muted italic">{proj.project_title}</span>
                        </span>
                        <select
                          value={popularRanks[proj.id] || ''}
                          onChange={(e) => {
                            const val = e.target.value ? parseInt(e.target.value) : 0;
                            setPopularRanks(prev => ({ ...prev, [proj.id]: val }));
                          }}
                          className="bg-bg1 border border-brand-border-high text-brand-text px-2.5 py-1.5 rounded-lg text-xs focus:outline-none focus:border-brand-accent min-w-[100px]"
                        >
                          <option value="">Triar...</option>
                          {Array.from({ length: count }, (_, idx) => idx + 1).map((pos) => (
                            <option key={pos} value={pos}>
                              {getOrdinalCat(pos)}
                            </option>
                          ))}
                        </select>
                      </div>
                    ));
                  })()}
                </div>
              </div>

              {/* Vot Popular - Opció B (Posicions ordenades i desplegables de projectes) */}
              <div className="space-y-4">
                <h4 className="text-xs uppercase font-bold text-brand-accent tracking-wider">
                  Classificació Votació Popular de la Sala (Opció B: Posició Fixa)
                </h4>

                <div className="bg-bg1/30 p-4 border border-brand-border rounded-xl space-y-3 max-h-[220px] overflow-y-auto font-sans">
                  <p className="text-[11px] text-brand-text-muted">
                    Selecciona el projecte que correspon a cada lloc. Els que ja s'han triat s'oculten dinàmicament d'altres files:
                  </p>
                  {(() => {
                    const adultProjs = projects.filter(p => p.category === 'adult');
                    const count = adultProjs.length;

                    const getOrdinalCat = (n: number) => {
                      if (n === 1) return '1r';
                      if (n === 2) return '2n';
                      if (n === 3) return '3r';
                      if (n === 4) return '4t';
                      return `${n}è`;
                    };

                    // Gather current assigned project IDs to filter them out of other rows
                    const assignedIds = new Set(
                      Object.keys(popularRanks).filter((id) => {
                        const pos = popularRanks[id];
                        return typeof pos === 'number' && pos > 0;
                      })
                    );

                    return Array.from({ length: count }, (_, idx) => {
                      const pos = idx + 1;
                      const assignedProjId = Object.keys(popularRanks).find(key => popularRanks[key] === pos) || '';

                      // Projects we can select on this row are unassigned ones, plus the one currently assigned here
                      const eligible = adultProjs.filter(p => !assignedIds.has(p.id) || p.id === assignedProjId);

                      return (
                        <div key={pos} className="flex justify-between items-center bg-bg1/60 p-2 rounded-lg border border-brand-border gap-3">
                          <span className="text-xs font-bold text-brand-text flex items-center min-w-[50px]">
                            <span className="bg-brand-accent/20 text-brand-accent px-2 py-0.5 rounded text-[10px]">
                              {getOrdinalCat(pos)}
                            </span>
                          </span>
                          <select
                            value={assignedProjId}
                            onChange={(e) => {
                              const newProjId = e.target.value;
                              setPopularRanks(prev => {
                                const next = { ...prev };
                                // Clear previous project assigned to this position
                                Object.keys(next).forEach(key => {
                                  if (next[key] === pos) {
                                    delete next[key];
                                  }
                                });
                                // Assign new project
                                if (newProjId) {
                                  next[newProjId] = pos;
                                }
                                return next;
                              });
                            }}
                            className="bg-bg1 border border-brand-border-high text-brand-text px-2.5 py-1.5 rounded-lg text-xs focus:outline-none focus:border-brand-accent flex-1"
                          >
                            <option value="">-- Escull un projecte Zampa --</option>
                            {eligible.map((proj) => (
                              <option key={proj.id} value={proj.id}>
                                {proj.author_name} - {proj.project_title}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-brand-border flex justify-end">
            {(() => {
              const isAdultFilled = !!officialWinnerAdult;
              const isSubmitDisabled = !isAdultFilled;

              return (
                <button
                  onClick={submitResults}
                  disabled={isSubmitDisabled}
                  className="bg-brand-accent hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-8 py-3 rounded-xl cursor-pointer shadow-lg shadow-brand-accent-glow flex items-center gap-2 transition-all"
                >
                  🎉 Publicar Resultats i Tancar Edició
                </button>
              );
            })()}
          </div>
        </div>
      )}

      {/* DIÀLEG MODAL PER CREAR/EDITAR UN PROJECTE */}
      {showAddProjectModal && (
        <div className="fixed inset-0 bg-black/60 z-[1000] flex items-center justify-center p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSaveProj}
            className="bg-surface1 border border-brand-border rounded-2xl p-6 max-w-md w-full space-y-4"
          >
            <h3 className="font-display text-2xl tracking-widest text-brand-text">
              {editingProject?.id ? t('zampa_edit_project', lang) : t('zampa_new_project', lang)}
            </h3>

            <div className="space-y-1 text-left">
              <label className="text-xs text-brand-text-muted block font-semibold uppercase tracking-wider">
                {t('zampa_author_name', lang)}
              </label>
              <input
                type="text"
                required
                value={editingProject?.author_name || ''}
                onChange={(e) => setEditingProject((prev: any) => ({ ...prev, author_name: e.target.value }))}
                className="w-full bg-bg1 border border-brand-border text-brand-text px-4 py-2 rounded-lg text-sm focus:outline-none focus:border-brand-accent"
              />
            </div>

            <div className="space-y-1 text-left">
              <label className="text-xs text-brand-text-muted block font-semibold uppercase tracking-wider">
                {t('zampa_project_title', lang)}
              </label>
              <input
                type="text"
                required
                value={editingProject?.project_title || ''}
                onChange={(e) => setEditingProject((prev: any) => ({ ...prev, project_title: e.target.value }))}
                className="w-full bg-bg1 border border-brand-border text-brand-text px-4 py-2 rounded-lg text-sm focus:outline-none focus:border-brand-accent"
              />
            </div>

            <div className="space-y-1 text-left">
              <label className="text-xs text-brand-text-muted block font-semibold uppercase tracking-wider">
                {t('zampa_project_desc', lang)}
              </label>
              <textarea
                value={editingProject?.description || ''}
                onChange={(e) => setEditingProject((prev: any) => ({ ...prev, description: e.target.value }))}
                rows={3}
                className="w-full bg-bg1 border border-brand-border text-brand-text px-4 py-2 rounded-lg text-sm focus:outline-none focus:border-brand-accent resize-none"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                className="flex-1 bg-surface2 hover:bg-surface3 text-brand-text font-semibold px-4 py-2.5 rounded-xl cursor-pointer border border-brand-border transition-colors text-sm"
                onClick={() => {
                  setShowAddProjectModal(false);
                  setEditingProject(null);
                }}
              >
                {t('cancel_btn', lang)}
              </button>
              <button
                type="submit"
                className="flex-1 bg-brand-accent hover:opacity-90 text-white font-semibold px-4 py-2.5 rounded-xl cursor-pointer text-sm shadow-md"
              >
                {t('save_btn', lang)}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL DE RÈPLICA COMPLETA I ANÀLISI D'IMPACTE */}
      {showReplicateModal && replicationAnalysis && (
        <div className="fixed inset-0 bg-black/75 z-[1000] flex items-center justify-center p-4 backdrop-blur-md overflow-y-auto">
          <div className="bg-surface1 border border-brand-border rounded-2xl p-6 max-w-2xl w-full my-8 space-y-6 shadow-2xl relative text-left">
            <div>
              <h3 className="font-display text-2xl tracking-widest text-brand-text mb-1 flex items-center gap-2">
                <Sparkles className="text-amber-400 w-6 h-6" /> VOLCAT DE DADES A BASE DE DADES REAL
              </h3>
              <p className="text-xs text-brand-text-muted font-mono uppercase tracking-wider">
                Anàlisi d'impacte previ a l'escriptura en producció
              </p>
            </div>

            {/* GRID RESUM DADES */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-surface2/60 border border-brand-border/80 rounded-xl p-3.5 text-center">
                <div className="text-2xl font-bold font-mono text-brand-text">
                  {replicationAnalysis.editions.length}
                </div>
                <div className="text-[10px] text-brand-text-muted font-mono uppercase tracking-wider">Edicions</div>
              </div>
              <div className="bg-surface2/60 border border-brand-border/80 rounded-xl p-3.5 text-center">
                <div className="text-2xl font-bold font-mono text-brand-text">
                  {replicationAnalysis.projectsCount}
                </div>
                <div className="text-[10px] text-brand-text-muted font-mono uppercase tracking-wider">Projectes</div>
              </div>
              <div className="bg-surface2/60 border border-brand-border/80 rounded-xl p-3.5 text-center">
                <div className="text-2xl font-bold font-mono text-brand-text">
                  {replicationAnalysis.photosCount}
                </div>
                <div className="text-[10px] text-brand-text-muted font-mono uppercase tracking-wider">Imatges</div>
              </div>
              <div className="bg-surface2/60 border border-brand-border/80 rounded-xl p-3.5 text-center">
                <div className="text-2xl font-bold font-mono text-amber-400">
                  {replicationAnalysis.votesCount}
                </div>
                <div className="text-[10px] text-brand-text-muted font-mono uppercase tracking-wider">Votacions / Podis</div>
              </div>
            </div>

            {/* SECCIÓ DETALL EDICIONS */}
            <div className="space-y-2">
              <h4 className="text-xs text-brand-text-muted font-mono uppercase tracking-wider font-semibold">
                Edicions implicades i estat a Real:
              </h4>
              <div className="bg-bg1/60 rounded-xl p-3 border border-brand-border/40 space-y-1.5 max-h-[120px] overflow-y-auto font-sans">
                {replicationAnalysis.editions.map((e: any) => (
                  <div key={e.id} className="flex justify-between items-center text-sm font-mono py-0.5 border-b border-brand-border/20 last:border-0">
                    <span className="text-brand-text font-bold">ZAMPA {e.id} (Estat: {e.status})</span>
                    {e.existsInReal ? (
                      <span className="text-xs text-red-400 font-semibold bg-red-400/10 px-2 py-0.5 rounded">Sobreescriurà dades</span>
                    ) : (
                      <span className="text-xs text-emerald-400 font-semibold bg-emerald-400/10 px-2 py-0.5 rounded">Es crearà nova</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* SECCIÓ GESTIÓ USUARIS */}
            <div className="space-y-3 bg-surface2/40 border border-brand-border/60 rounded-xl p-4 font-sans">
              <div className="flex justify-between items-start gap-4">
                <div>
                  <h4 className="text-xs text-brand-text-muted font-mono uppercase tracking-wider font-semibold mb-1">
                    Gestió d'Usuaris Votants (Travesses):
                  </h4>
                  <p className="text-xs text-brand-text-muted">
                    S'han trobat <span className="text-brand-text font-bold font-mono">{replicationAnalysis.usersAnalysis.totalVoters}</span> socis únics amb votacions en test.
                  </p>
                </div>
                <div className="text-right font-mono">
                  <div className="text-xs text-brand-text-muted">Existents a Real: <span className="text-emerald-400 font-bold">{replicationAnalysis.usersAnalysis.existingVotersInReal}</span></div>
                  <div className="text-xs text-brand-text-muted">No existents (Nous): <span className="text-amber-400 font-bold">{replicationAnalysis.usersAnalysis.missingVoters.length}</span></div>
                </div>
              </div>

              {replicationAnalysis.usersAnalysis.missingVoters.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-brand-border/30">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-brand-text">Comptes que es crearan a Real:</span>
                    <label className="flex items-center gap-1.5 text-xs text-brand-accent cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={copyMissingUsersOpt}
                        onChange={(e) => setCopyMissingUsersOpt(e.target.checked)}
                        className="rounded border-brand-border text-brand-accent focus:ring-brand-accent/30 bg-bg1"
                      />
                      Donar d'alta automàticament
                    </label>
                  </div>
                  <div className="bg-bg1/60 rounded-lg border border-brand-border/40 p-2 max-h-[140px] overflow-y-auto space-y-1.5">
                    {replicationAnalysis.usersAnalysis.missingVoters.map((u: any) => (
                      <div key={u.id} className="flex justify-between items-center text-xs font-mono py-1 border-b border-brand-border/10 last:border-0">
                        <span className="text-brand-text font-medium">{u.display_name}</span>
                        <span className="text-brand-text-muted font-mono text-[10px]">{u.email}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-brand-text-muted italic leading-relaxed">
                    * Seguretat: Els usuaris existents a Real no es modificaran mai. Només es registraran els nous socis per donar-los accés i enllaçar els seus vots.
                  </p>
                </div>
              )}
            </div>

            {/* ADVERTIMENT CRÍTIC */}
            <div className="border border-red-500/20 bg-red-500/5 rounded-xl p-4 space-y-3 font-sans">
              <h5 className="text-xs text-red-400 font-semibold uppercase tracking-wider font-mono flex items-center gap-1.5">
                ⚠ AVÍS IMPORTANT DE SEGURETAT DE DADES:
              </h5>
              <ul className="text-xs text-brand-text-muted space-y-1 list-disc pl-4 leading-relaxed">
                <li>Aquest procés és **totalment irreversible** i es fa directament contra el servidor de producció.</li>
                <li>S'esborraran les edicions i projectes coincidents del Zampa a Real, substituint-los pels de test de forma completa.</li>
                <li>Es traslladaran tots els **{replicationAnalysis.votesCount} vots i travesses de socis** registrats.</li>
                <li>La secció mensual de "Reptes" i les seves fotos/vots **NO seran alterades en cap cas**.</li>
              </ul>
              <label className="flex items-start gap-2 pt-1.5 text-xs text-brand-text cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={understoodImpact}
                  onChange={(e) => setUnderstoodImpact(e.target.checked)}
                  className="rounded border-brand-border text-brand-accent focus:ring-brand-accent/30 bg-bg1 mt-0.5"
                />
                <span>Confirmo que he revisat l'impacte i vull procedir amb el volcat total de dades del Zampa.</span>
              </label>
            </div>

            {/* BOTONS D'ACCIÓ */}
            <div className="flex gap-3 pt-2 font-sans">
              <button
                type="button"
                disabled={isReplicating}
                className="flex-1 bg-surface2 hover:bg-surface3 disabled:opacity-50 text-brand-text font-semibold px-4 py-3 rounded-xl cursor-pointer border border-brand-border transition-colors text-sm text-center"
                onClick={() => {
                  setShowReplicateModal(false);
                  setReplicationAnalysis(null);
                }}
              >
                Cancel·lar
              </button>
              <button
                type="button"
                disabled={!understoodImpact || isReplicating}
                className="flex-1 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:from-gray-700 disabled:to-gray-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-4 py-3 rounded-xl cursor-pointer text-sm shadow-lg shadow-amber-500/10 flex items-center justify-center gap-2 transition-all"
                onClick={executeReplication}
              >
                {isReplicating ? 'Copiant dades...' : 'Executar Volcat a Real'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        onConfirm={() => {
          confirmConfig.onConfirm();
          closeConfirm();
        }}
        onCancel={closeConfirm}
        confirmText={confirmConfig.confirmText}
        cancelText={confirmConfig.cancelText}
        isDanger={confirmConfig.isDanger}
        isWarning={confirmConfig.isWarning}
      />

      {/* LIGHTBOX DE PANTALLA COMPLETA */}
      {lightboxOpen && (
        <FullscreenViewer
          isOpen={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          url={lightboxUrl}
          photosList={lightboxPhotos}
          startIndex={lightboxStartIdx}
          showDownload
        />
      )}
    </div>
  );
}
