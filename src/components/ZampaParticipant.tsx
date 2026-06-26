import React, { useState, useEffect } from 'react';
import { ZampaEdition, ZampaProject, ZampaPhoto, ZampaUserRank, User } from '../types';
import { t } from '../lib/translations';
import { Award, ArrowUp, ArrowDown, Sparkles, Check, Lock, Trophy, ListOrdered } from 'lucide-react';
import FullscreenViewer from './FullscreenViewer';
import ConfirmModal from './ConfirmModal';

interface ZampaParticipantProps {
  currentEdition: ZampaEdition;
  projects: ZampaProject[];
  userRanks: ZampaUserRank[];
  currentUser: User;
  onSaveRating: (ranks: ZampaUserRank[]) => Promise<boolean>;
  lang: 'ca' | 'es';
  users: User[];
}

export default function ZampaParticipant({
  currentEdition,
  projects,
  userRanks,
  currentUser,
  onSaveRating,
  lang,
  users,
}: ZampaParticipantProps) {
  const activeTab = 'adult';
  
  // Sorted list for user ordering in "vote" mode
  const [orderedProjects, setOrderedProjects] = useState<ZampaProject[]>([]);
  const [submittingRating, setSubmittingRating] = useState(false);

  // Smooth scrolling / tracking state on move
  const [lastMovedId, setLastMovedId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  useEffect(() => {
    if (lastMovedId) {
      const element = document.getElementById(`project-card-${lastMovedId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      setHighlightId(lastMovedId);
      const timer = setTimeout(() => {
        setHighlightId(null);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [lastMovedId, orderedProjects]);

  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    cancelText?: string;
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

  // Sorting criteria for Section C
  const [sectionCSort, setSectionCSort] = useState<'popular' | 'consensus' | 'my_vote'>('popular');

  // Is current category locked?
  const isVoted = userRanks.some((r) => r.category === activeTab && r.user_id === currentUser.id);

  // Initialize order on focus/category change
  useEffect(() => {
    const subset = projects.filter((p) => p.category === activeTab);
    
    // Check if there are already saved ratings for the user
    const existingRanks = userRanks.filter((r) => r.category === activeTab && r.user_id === currentUser.id);

    if (existingRanks.length > 0) {
      // Sort subset using assigned position
      const sorted = [...subset].sort((a, b) => {
        const rankA = existingRanks.find((r) => r.project_id === a.id)?.assigned_position ?? 999;
        const rankB = existingRanks.find((r) => r.project_id === b.id)?.assigned_position ?? 999;
        return rankA - rankB;
      });
      setOrderedProjects(sorted);
    } else {
      setOrderedProjects(subset);
    }
  }, [activeTab, projects, userRanks]);

  // Handle shift up in the list
  const shiftUp = (index: number) => {
    if (index === 0) return;
    const nextList = [...orderedProjects];
    const item = nextList[index];
    nextList[index] = nextList[index - 1];
    nextList[index - 1] = item;
    setOrderedProjects(nextList);
    setLastMovedId(item.id);
  };

  // Handle shift down in the list
  const shiftDown = (index: number) => {
    if (index === orderedProjects.length - 1) return;
    const nextList = [...orderedProjects];
    const item = nextList[index];
    nextList[index] = nextList[index + 1];
    nextList[index + 1] = item;
    setOrderedProjects(nextList);
    setLastMovedId(item.id);
  };

  // Handle moving to a specific 0-based index position and shifting other projects
  const moveToPosition = (currentIndex: number, targetIndex: number) => {
    if (currentIndex === targetIndex) return;
    if (targetIndex < 0 || targetIndex >= orderedProjects.length) return;
    
    const nextList = [...orderedProjects];
    const [item] = nextList.splice(currentIndex, 1);
    nextList.splice(targetIndex, 0, item);
    setOrderedProjects(nextList);
    setLastMovedId(item.id);
  };

  const submitRatingDirectly = async () => {
    setSubmittingRating(true);
    try {
      const payload: ZampaUserRank[] = orderedProjects.map((proj, idx) => ({
        user_id: currentUser.id,
        project_id: proj.id,
        edition_year: currentEdition.id,
        category: activeTab,
        assigned_position: idx + 1,
      }));

      await onSaveRating(payload);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingRating(false);
    }
  };

  // Submit traveler predictions for the active category
  const handleSubmitRating = () => {
    triggerConfirm({
      title: "Enviar Valoració?",
      message: t('zampa_confirm_rating', lang) || "Vols enviar la teva valoració ara? No la podràs modificar fins que es tanquin les votacions.",
      onConfirm: submitRatingDirectly,
      confirmText: "Sí, enviar",
    });
  };

  // --- CALCULATION FOR 'FINISHED' METHOD ---

  // Get official winner details
  const winnerId = currentEdition.official_winner_adult;
  const officialWinnerObj = projects.find((p) => p.id === winnerId);

  // Compute the consensus ranking position of the official winner project
  let winnerConsensusRank: number | null = null;
  if (officialWinnerObj) {
    const categoryProjects = projects.filter(p => p.category === activeTab);
    const calculatedConsensusList = categoryProjects.map(proj => {
      const ranks = userRanks.filter(r => r.project_id === proj.id && r.category === activeTab);
      const count = ranks.length;
      const sum = ranks.reduce((acc, r) => acc + r.assigned_position, 0);
      const avg = count > 0 ? sum / count : 999;
      const firsts = ranks.filter(r => r.assigned_position === 1).length;
      return {
        id: proj.id,
        author_name: proj.author_name,
        avg,
        sum,
        firsts
      };
    });

    // Sort to determine consensusRank
    calculatedConsensusList.sort((a, b) => {
      if (a.avg !== b.avg) return a.avg - b.avg;
      if (a.firsts !== b.firsts) return b.firsts - a.firsts;
      if (a.sum !== b.sum) return a.sum - b.sum;
      return a.author_name.localeCompare(b.author_name);
    });

    const winIdx = calculatedConsensusList.findIndex(item => item.id === winnerId);
    if (winIdx !== -1) {
      winnerConsensusRank = winIdx + 1;
    }
  }

  // A) Partners' proximity list for the winner
  const allPartners = users;
  
  const partnerProximityList = allPartners
    .map((partner) => {
      // Find what position this partner assigned to the winning project
      const partnerRank = userRanks.find(
        (r) => r.user_id === partner.id && r.project_id === winnerId && r.category === activeTab
      );
      return {
        partner,
        pos: partnerRank ? partnerRank.assigned_position : null,
      };
    })
    .filter((entry) => entry.pos !== null)
    .sort((a, b) => (a.pos || 99) - (b.pos || 99));

  // B) Manhattan deviation affinity list (only for adult category)
  const popularAffinityList = allPartners
    .map((partner) => {
      // Filter partner ranks in this edition & category
      const partnerRanks = userRanks.filter((r) => r.user_id === partner.id && r.category === 'adult');
      if (partnerRanks.length === 0) return { partner, deviation: null };

      let sumDeviation = 0;
      let ratedCount = 0;

      partnerRanks.forEach((rank) => {
        const proj = projects.find((p) => p.id === rank.project_id);
        const popularRank = proj?.popular_rank_position;
        if (popularRank != null) {
          sumDeviation += Math.abs(rank.assigned_position - popularRank);
          ratedCount++;
        }
      });

      return {
        partner,
        deviation: ratedCount > 0 ? sumDeviation : null,
      };
    })
    .filter((entry) => entry.deviation !== null)
    .sort((a, b) => (a.deviation || 99) - (b.deviation || 99));

  return (
    <div className="space-y-6">
      {/* Dynamic Title and header */}
      <div className="text-center space-y-2">
        <h1 className="text-4xl md:text-5xl font-display tracking-widest text-[#e8f0ff] uppercase">
          {t('zampa_title', lang)}
        </h1>
        <p className="text-xs tracking-wider text-brand-text-muted font-mono uppercase">
          EDICIÓ {currentEdition.id} · SOCIS
        </p>
      </div>

      {/* ELECCIÓ DE VISIBILITATS SEGONS ESTATS */}

      {/* 1. ESTAT "OPEN" (Edició en creació o preparació) */}
      {currentEdition.status === 'open' && (
        <div className="space-y-6 max-w-xl mx-auto py-10">
          <div className="bg-surface1 border border-brand-border rounded-2xl p-8 text-center space-y-4 shadow-lg shadow-black/10">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-yellow-500/10 text-yellow-500 mb-2">
              <Sparkles size={28} className="animate-pulse" />
            </div>
            <h3 className="text-xl font-bold text-[#e1e7f0] uppercase tracking-wider font-display">
              {lang === 'es' ? 'EDICIÓN EN CREACIÓN' : 'EDICIÓ EN CREACIÓ'}
            </h3>
            <p className="text-xs text-brand-text-muted leading-relaxed font-sans">
              {lang === 'es'
                ? `La edición de Zampa ${currentEdition.id} se encuentra actualmente en fase de preparación. S'están configurando las propuestas y las portfolios de imágenes de cada participante por parte del equipo editorial.`
                : `L'edició de Zampa ${currentEdition.id} es troba actualment en fase de preparació i creació. S'estan configurant els projectes i els portfolis d'imatges d'autor per part de l'equip de disseny i edició.`}
            </p>
            <div className="pt-2">
              <span className="inline-block text-[10px] uppercase font-bold tracking-widest bg-yellow-400/15 text-yellow-300 border border-yellow-400/20 px-3 py-1.5 rounded-full">
                {lang === 'es' ? 'Próximamente votación abierta' : 'Pròximament votació oberta'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 2. ESTAT "VOTE" (Participar / Ordenar) */}
      {currentEdition.status === 'vote' && (
        <div className="space-y-6 max-w-4xl mx-auto">
          {/* Banner d'avís */}
          <div className="bg-surface1 border border-brand-border p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left">
            <div className="space-y-1">
              <p className="text-xs text-brand-text-muted font-medium">
                {isVoted ? t('zampa_ranking_locked', lang) : t('zampa_vote_banner', lang)}
              </p>
              {!isVoted && (
                <p className="text-xs text-yellow-400 font-bold bg-yellow-400/5 py-1 px-2.5 rounded border border-yellow-400/10 inline-block animate-pulse">
                  ⚠️ {lang === 'es' 
                    ? 'Una vez finalizada la clasificación, debes enviar la valoración con el botón al final de la pantalla.' 
                    : 'Un cop finalitzada la classificació, cal enviar la valoració zampa amb el botó del final de la pantalla.'}
                </p>
              )}
            </div>
            <div className="flex-shrink-0">
              {isVoted ? (
                <span className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-500 text-xs px-3 py-1 rounded-full font-bold border border-emerald-500/20">
                  <Lock size={12} /> BLOQUEJAT
                </span>
              ) : (
                <span className="flex items-center gap-1.5 bg-yellow-500/10 text-yellow-500 text-xs px-3 py-1 rounded-full font-bold border border-yellow-500/20">
                  <Sparkles size={12} /> VOTACIÓ OBERTA
                </span>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {orderedProjects.map((proj, idx) => {
              const isHighlighted = highlightId === proj.id;
              return (
                <div
                  key={proj.id}
                  id={`project-card-${proj.id}`}
                  className={`bg-surface1 border rounded-2xl p-5 hover:border-brand-border-high flex flex-col md:flex-row gap-5 transition-all duration-500 ${
                    isHighlighted
                      ? 'border-brand-accent ring-2 ring-brand-accent-glow bg-surface2 shadow-[0_0_20px_rgba(79,143,255,0.3)] scale-[1.015]'
                      : 'border-brand-border'
                  }`}
                >
                {/* Ordre Badge / Controls */}
                <div className="flex md:flex-col items-center justify-between md:justify-center gap-3 md:border-r border-brand-border md:pr-5 min-w-[70px]">
                  <span className={`text-2xl font-mono font-black ${
                    idx === 0 ? 'text-yellow-400' :
                    idx === 1 ? 'text-gray-300' :
                    idx === 2 ? 'text-amber-600' :
                    'text-brand-text-muted/60'
                  }`}>
                    {idx + 1}r
                  </span>

                  {!isVoted && (
                    <div className="flex md:flex-col gap-1.5 items-center">
                      <button
                        onClick={() => shiftUp(idx)}
                        disabled={idx === 0}
                        className="bg-surface2 border border-brand-border hover:bg-surface3 disabled:opacity-20 text-brand-text p-2 rounded-lg cursor-pointer flex items-center justify-center transition-all"
                        title="Pujar de posició"
                      >
                        <ArrowUp size={16} />
                      </button>
                      
                      <select
                        value={idx}
                        onChange={(e) => moveToPosition(idx, parseInt(e.target.value))}
                        className="bg-surface2 border border-brand-border hover:border-brand-accent-glow text-brand-text font-mono font-bold text-center text-xs py-1.5 px-2.5 rounded-lg cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-accent transition-all min-w-[45px] h-9"
                        title="Canviar lloc directament"
                      >
                        {orderedProjects.map((_, pIdx) => (
                          <option key={pIdx} value={pIdx} className="bg-surface1 text-brand-text font-bold p-1">
                            {pIdx + 1}
                          </option>
                        ))}
                      </select>

                      <button
                        onClick={() => shiftDown(idx)}
                        disabled={idx === orderedProjects.length - 1}
                        className="bg-surface2 border border-brand-border hover:bg-surface3 disabled:opacity-20 text-brand-text p-2 rounded-lg cursor-pointer flex items-center justify-center transition-all"
                        title="Baixar de posició"
                      >
                        <ArrowDown size={16} />
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-4 text-left">
                  <div>
                    <h3 className="text-xl font-bold font-mono text-brand-text">{proj.author_name}</h3>
                    <p className="text-xs text-brand-accent font-semibold italic mt-0.5">"{proj.project_title}"</p>
                    {proj.description && (
                      <p className="text-xs text-brand-text-muted mt-2 max-w-2xl bg-bg1/20 p-2.5 rounded-lg leading-relaxed">
                        {proj.description}
                      </p>
                    )}
                  </div>

                  {/* Portfolio Mosaic Miniatures */}
                  {!(proj as any).photos || (proj as any).photos.length === 0 ? (
                    <p className="text-xs text-brand-text-muted italic">Aquest autor encara no té imatges al mosaic.</p>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                      {(() => {
                        const sortedPhotos = [...((proj as any).photos || [])].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
                        return sortedPhotos.map((photo: ZampaPhoto, pIdx: number) => (
                          <div
                            key={photo.id}
                            className="aspect-[4/3] rounded-lg overflow-hidden border border-brand-border/60 hover:border-brand-accent cursor-zoom-in transition-all relative group"
                            onClick={() => {
                              // Extract sorted full photo list for current project mosaic to carousel in viewer
                              const fullList = sortedPhotos.map((pt: any) => ({
                                url: pt.file_url,
                                fileName: pt.file_name || 'foto.jpg',
                              }));
                              setLightboxPhotos(fullList);
                              setLightboxStartIdx(pIdx);
                              setLightboxUrl(photo.file_url);
                              setLightboxOpen(true);
                            }}
                          >
                            <img
                              src={photo.file_url}
                              alt={photo.file_name || `Photo ${pIdx}`}
                              className="w-full h-full object-cover transition-transform group-hover:scale-105"
                            />
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          </div>

          {/* Botó desat de vots si no està d'acord amb format d'estat bloc passat */}
          {!isVoted && orderedProjects.length > 0 && (
            <div className="pt-4 flex justify-center">
              <button
                onClick={handleSubmitRating}
                disabled={submittingRating}
                className={`text-white font-bold px-8 py-3.5 rounded-xl cursor-pointer shadow-lg flex items-center gap-2.5 transition-all text-sm uppercase tracking-wider active:scale-95 ${
                  activeTab === 'adult'
                    ? 'bg-brand-accent hover:opacity-90 shadow-brand-accent-glow'
                    : 'bg-pink-600 hover:opacity-90 shadow-pink-500/20'
                }`}
              >
                {submittingRating ? (
                  <span className="loader" />
                ) : (
                  <>
                     <Check size={16} /> Enviar Valoració Zampa
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* 3. ESTAT `CLOSED` (Tancat abans dels resultats reals) - AMB LA TRAVESSA DE LA FEM I CLASSICACIÓ ASSOCIADA */}
      {currentEdition.status === 'closed' && (
        <div className="space-y-8 max-w-5xl mx-auto">
          {/* Banner de Tancat i Consens col·lectiu */}
          <div className="bg-surface1 border border-brand-border rounded-2xl p-6 text-center space-y-3 max-w-3xl mx-auto">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-indigo-500/10 text-indigo-400 mb-1">
              <Lock size={24} />
            </div>
            <h3 className="text-xl font-bold text-[#e1e7f0] uppercase tracking-wider">
              {lang === 'es' ? 'VOTACIÓN CERRADA - LA QUINIELA DE LA FEM' : 'VOTACIÓ TANCADA - LA TRAVESSA DE LA FEM'}
            </h3>
            <p className="text-xs text-brand-text-muted leading-relaxed max-w-xl mx-auto font-sans">
              {lang === 'es'
                ? 'Las valoraciones de todos los socios han sido registradas y cerradas de forma segura. A continuación, puedes consultar en primicia la Travessa de la FEM formada por el consenso del voto de todos los socios, y ver tu nivel de sintonía antes del veredicto oficial.'
                : 'Les valoracions de tots els socis han estat registrades i tancades de forma segura. A continuació, pots consultar en primícia la Travessa de la FEM de consens formada pel vot de tots els socis, i conèixer el teu nivell de sintonia abans del veredicte oficial.'}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* TRAVESSA DE LA FEM vs LA TEVA TRAVESSA */}
            <div className="lg:col-span-7 bg-surface1 border border-brand-border rounded-2xl p-5 md:p-6 space-y-4 text-left">
              <div className="flex items-center justify-between border-b border-brand-border pb-3">
                <div className="space-y-0.5">
                  <h4 className="font-bold text-sm tracking-wider uppercase text-brand-text">
                    {lang === 'es' ? 'La Quiniela de la FEM (Consenso)' : 'La Travessa de la FEM (Consens)'}
                  </h4>
                  <p className="text-[10px] text-brand-text-muted font-sans flex items-center gap-1.5 flex-wrap">
                    <span>{lang === 'es' ? 'Resultado de la clasificación media colectiva' : 'Resultat de la classificació mitjana col·lectiva'}</span>
                    <span id="consensus-voters-meta" className="text-brand-accent font-semibold font-mono before:content-['·'] before:mr-1.5"></span>
                  </p>
                </div>
                <span className="text-[10px] uppercase font-bold tracking-wider bg-[#81a2cc]/10 text-[#81a2cc] border border-[#81a2cc]/20 px-2.5 py-1 rounded">
                  {lang === 'es' ? 'Provisional' : 'Provisional'}
                </span>
              </div>

              {/* Capçaleres de columnes */}
              <div className="hidden sm:block space-y-2 pb-1">
                <div className="flex justify-between items-center text-[10px] font-mono font-bold tracking-wider text-brand-accent uppercase opacity-90 pb-2 border-b border-brand-border/40">
                  <span>{lang === 'es' ? 'La Quiniela de la FEM' : 'La Travessa de la FEM'}</span>
                  <span className="text-brand-text-muted/20 grow px-2 overflow-hidden whitespace-nowrap">⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯</span>
                  <span>{lang === 'es' ? 'Tu Quiniela' : 'La teva travessa'}</span>
                </div>
              </div>

              {(() => {
                const categoryProjects = projects.filter(p => p.category === activeTab);
                
                // Get the total voters supporting this active block
                const firstProj = categoryProjects.length > 0 ? categoryProjects[0] : null;
                const totalVoters = firstProj
                  ? userRanks.filter(r => r.project_id === firstProj.id && r.category === activeTab).length
                  : 0;

                const consensusList = categoryProjects.map(proj => {
                  const ranks = userRanks.filter(r => r.project_id === proj.id && r.category === activeTab);
                  const count = ranks.length;
                  const sum = ranks.reduce((acc, r) => acc + r.assigned_position, 0);
                  const avg = count > 0 ? sum / count : 999;
                  const firsts = ranks.filter(r => r.assigned_position === 1).length;
                  
                  // Mean Absolute Deviation (MAD) for consensus quality
                  const sumAbsoluteDeviations = ranks.reduce((acc, r) => acc + Math.abs(r.assigned_position - avg), 0);
                  const mad = count > 0 ? sumAbsoluteDeviations / count : 0;
                  
                  let consensusLabel = '';
                  let consensusRating = '';
                  if (mad < 0.6) {
                    consensusLabel = lang === 'es' ? 'Muy alto' : 'Molt alt';
                    consensusRating = 'Muy alto';
                  } else if (mad < 1.1) {
                    consensusLabel = lang === 'es' ? 'Alto' : 'Alt';
                    consensusRating = 'Alto';
                  } else if (mad < 1.7) {
                    consensusLabel = lang === 'es' ? 'Notable' : 'Notable';
                    consensusRating = 'Notable';
                  } else {
                    consensusLabel = lang === 'es' ? 'Moderado' : 'Moderat';
                    consensusRating = 'Moderado';
                  }

                  // Segona foto de miniatura (o primera si només en té una, per identificar millor el projecte)
                  const sortedPhotos = (proj as any).photos ? [...(proj as any).photos].sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0)) : [];
                  const firstPhotoUrl = sortedPhotos.length > 1 ? sortedPhotos[1].file_url : (sortedPhotos.length > 0 ? sortedPhotos[0].file_url : null);

                  return {
                    project: proj,
                    avg,
                    sum,
                    firsts,
                    count,
                    firstPhotoUrl,
                    sortedPhotos,
                    consensusLabel,
                    consensusRating
                  };
                }).sort((a, b) => {
                  if (a.avg !== b.avg) return a.avg - b.avg;
                  if (a.firsts !== b.firsts) return b.firsts - a.firsts;
                  if (a.sum !== b.sum) return a.sum - b.sum;
                  return a.project.author_name.localeCompare(b.project.author_name);
                });

                const hasVotes = consensusList.some(item => item.count > 0);

                if (!hasVotes) {
                  return (
                    <p className="text-xs text-brand-text-muted italic py-4 text-center">
                      {lang === 'es' ? 'No hay suficientes votaciones para mostrar el consenso.' : 'No hi ha prou votacions per poder mostrar el consens.'}
                    </p>
                  );
                }

                // Add voters count information inline to sub-headline
                const subHeadlineElement = document.getElementById('consensus-voters-meta');
                if (subHeadlineElement) {
                  subHeadlineElement.textContent = totalVoters > 0 
                    ? (lang === 'es' ? `Basado en los votos de ${totalVoters} socios` : `Basat en els vots de ${totalVoters} socis`)
                    : '';
                }

                return (
                  <div className="space-y-3 font-sans">
                    {consensusList.map((item, index) => {
                      if (item.count === 0) return null;
                      const userRatingObj = userRanks.find(
                        r => r.project_id === item.project.id && r.category === activeTab && r.user_id === currentUser.id
                      );
                      const myRank = userRatingObj ? userRatingObj.assigned_position : null;
                      const hasExactMatch = myRank === (index + 1);

                      return (
                        <div
                          key={item.project.id}
                          className="p-3 bg-bg1/40 hover:bg-bg1/70 border border-brand-border rounded-xl flex flex-col sm:grid sm:grid-cols-12 gap-3 items-center transition-all"
                        >
                          {/* Esquerra: Posició + Miniatura + Projecte */}
                          <div className="col-span-8 w-full flex items-center gap-3">
                            <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono font-black text-xs shrink-0 select-none ${
                                index === 0 ? 'bg-[#81a2cc]/20 text-[#81a2cc] border border-[#81a2cc]/30' :
                                index === 1 ? 'bg-slate-300/20 text-slate-300 border border-slate-300/20' :
                                index === 2 ? 'bg-slate-400/10 text-slate-400 border border-slate-400/20' :
                                'bg-bg2 border border-brand-border text-brand-text-muted'
                            }`}>
                              {index + 1}r
                            </span>
                            
                            {/* Miniatura segona foto (amb zoom i navegació) */}
                            {item.firstPhotoUrl ? (
                              <div 
                                className="w-10 h-10 rounded-lg overflow-hidden border border-brand-border hover:border-brand-accent shrink-0 bg-bg2 cursor-zoom-in transition-colors group/mini"
                                onClick={() => {
                                  const fullList = (item.sortedPhotos || []).map((pt: any) => ({
                                    url: pt.file_url,
                                    fileName: pt.file_name || 'foto.jpg',
                                  }));
                                  const startIdx = (item.sortedPhotos || []).length > 1 ? 1 : 0;
                                  setLightboxPhotos(fullList);
                                  setLightboxStartIdx(startIdx);
                                  setLightboxUrl(item.firstPhotoUrl || '');
                                  setLightboxOpen(true);
                                }}
                              >
                                <img
                                  src={item.firstPhotoUrl}
                                  alt="miniatura"
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover transition-transform group-hover/mini:scale-110 duration-200"
                                />
                              </div>
                            ) : (
                              <div className="w-10 h-10 rounded-lg border border-brand-border shrink-0 bg-bg2 flex items-center justify-center text-xs text-brand-text-muted font-bold">
                                📷
                              </div>
                            )}

                            <div className="truncate text-left min-w-0">
                              <h5 className="text-xs font-bold font-mono text-brand-text truncate leading-tight">
                                {item.project.author_name}
                              </h5>
                              <p className="text-[10px] text-brand-accent truncate mt-0.5 font-sans">
                                "{item.project.project_title}"
                              </p>
                              <div className="flex items-center gap-2 mt-1 text-[9px] text-brand-text-muted font-mono leading-none flex-wrap">
                                <span className="bg-bg2 px-1 py-0.5 rounded text-brand-text/95">
                                  {lang === 'es' ? 'Media' : 'Mitjana'}: {item.avg.toFixed(2)}
                                </span>
                                <span>·</span>
                                <span className="bg-[#81a2cc]/5 border border-[#81a2cc]/10 px-1 py-0.5 rounded flex items-center gap-1">
                                  <span className="opacity-70">{lang === 'es' ? 'Consenso' : 'Consens'}:</span>
                                  <span className={
                                    item.consensusRating === 'Muy alto' ? 'text-teal-400 font-bold' :
                                    item.consensusRating === 'Alto' ? 'text-emerald-400 font-bold' :
                                    item.consensusRating === 'Notable' ? 'text-[#81a2cc] font-bold' :
                                    'text-amber-400/80 font-semibold'
                                  }>
                                    {item.consensusLabel}
                                  </span>
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Dreta: La meva travessa */}
                          <div className="col-span-4 w-full sm:w-auto flex sm:justify-end items-center gap-2">
                            <span className="text-[10px] text-brand-text-muted font-mono sm:hidden">
                              {lang === 'es' ? 'Tu valoración:' : 'La teva valoració:'}
                            </span>
                            {myRank ? (
                              <div className={`text-xs font-mono font-bold px-2.5 py-1 rounded-lg flex items-center gap-1.5 shrink-0 ${
                                hasExactMatch
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-bg2 border border-brand-border text-brand-text'
                              }`}>
                                {hasExactMatch && <span className="text-[10px] text-emerald-400">✅</span>}
                                {myRank}r {lang === 'es' ? 'pos.' : 'lloc'}
                              </div>
                            ) : (
                              <span className="text-xs text-brand-text-muted italic px-2 font-mono">
                                No votat
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* CLASSIFICACIÓ DE SOCIS PER AFINITAT (MENOR DISPERSIÓ RESPECTE AL CONSENS) */}
            <div className="lg:col-span-5 bg-surface1 border border-brand-border rounded-2xl p-5 md:p-6 space-y-4 text-left">
              <div className="border-b border-brand-border pb-3">
                <h4 className="font-bold text-sm tracking-wider uppercase text-brand-text flex items-center gap-1.5">
                  <Sparkles size={16} className="text-[#81a2cc]" />
                  {lang === 'es' ? 'Sintonía con el Consenso' : 'Sintonia amb el Consens'}
                </h4>
                <p className="text-[10px] text-brand-text-muted mt-0.5 leading-relaxed font-sans">
                  {lang === 'es'
                    ? 'Socios que más se aproximan a la Travessa de la FEM. Se ordena por menor desviación acumulada respecto al consenso colectivo.'
                    : 'Socis que més s\'aproximen a la Travessa de la FEM. S\'ordena de menor a major dispersió/desviació acumulada respecte al consens col·lectiu.'}
                </p>
              </div>

              {(() => {
                const categoryProjects = projects.filter(p => p.category === activeTab);
                
                // 1) Calculem el consens actual
                const consensusList = categoryProjects.map(proj => {
                  const ranks = userRanks.filter(r => r.project_id === proj.id && r.category === activeTab);
                  const count = ranks.length;
                  const sum = ranks.reduce((acc, r) => acc + r.assigned_position, 0);
                  const avg = count > 0 ? sum / count : 999;
                  const firsts = ranks.filter(r => r.assigned_position === 1).length;
                  return { project: proj, avg, sum, firsts, count };
                }).sort((a, b) => {
                  if (a.avg !== b.avg) return a.avg - b.avg;
                  if (a.firsts !== b.firsts) return b.firsts - a.firsts;
                  if (a.sum !== b.sum) return a.sum - b.sum;
                  return a.project.author_name.localeCompare(b.project.author_name);
                });

                const hasVotes = consensusList.some(item => item.count > 0);
                if (!hasVotes) {
                  return (
                    <p className="text-xs text-brand-text-muted italic py-4 font-sans">
                      {lang === 'es' ? 'Sin datos de votaciones de socios.' : 'Sense dades de votacions dels socis.'}
                    </p>
                  );
                }

                // 2) Calculem la desviació per a cada soci
                const votingPartners = users.map(user => {
                  const partnerRanks = userRanks.filter(r => r.user_id === user.id && r.category === activeTab);
                  if (partnerRanks.length === 0) return { user, deviation: null, matchesCount: 0, count: 0 };

                  let totalDeviation = 0;
                  let matchesCount = 0;

                  partnerRanks.forEach(rank => {
                    const consensusIdx = consensusList.findIndex(item => item.project.id === rank.project_id);
                    if (consensusIdx !== -1) {
                      const consensusPos = consensusIdx + 1;
                      const userPos = rank.assigned_position;
                      totalDeviation += Math.abs(userPos - consensusPos);
                      if (userPos === consensusPos) {
                        matchesCount++;
                      }
                    }
                  });

                  return {
                    user,
                    deviation: totalDeviation,
                    matchesCount,
                    count: partnerRanks.length
                  };
                })
                .filter(entry => entry.count > 0)
                .sort((a, b) => {
                  if (a.deviation !== b.deviation) return (a.deviation ?? 999) - (b.deviation ?? 999);
                  if (b.matchesCount !== a.matchesCount) return b.matchesCount - a.matchesCount;
                  return a.user.display_name.localeCompare(b.user.display_name);
                });

                if (votingPartners.length === 0) {
                  return (
                    <p className="text-xs text-brand-text-muted italic py-4 font-sans">
                      {lang === 'es' ? 'Ningún socio ha votado todavía.' : 'Cap soci ha realitzat votació encara.'}
                    </p>
                  );
                }

                return (
                  <div className="space-y-2.5 max-h-[400px] overflow-y-auto pr-1">
                    {votingPartners.map((entry, index) => {
                      const isMe = entry.user.id === currentUser.id;
                      const badgeBg = 
                        index === 0 ? 'bg-yellow-400/20 text-yellow-300 border border-yellow-400/30' :
                        index === 1 ? 'bg-gray-300/20 text-gray-300 border border-gray-300/20' :
                        index === 2 ? 'bg-amber-600/20 text-amber-500 border border-amber-600/20' :
                        'bg-bg2 border border-brand-border text-brand-text-muted';

                      return (
                        <div
                          key={entry.user.id}
                          className={`p-3 rounded-xl border flex justify-between items-center transition-all ${
                            isMe
                              ? 'bg-purple-500/10 border-purple-500/40'
                              : 'bg-bg1/30 border-brand-border'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className={`w-6 h-6 rounded-md flex items-center justify-center font-mono font-bold text-[10px] shrink-0 ${badgeBg}`}>
                              #{index + 1}
                            </span>
                            <span className={`text-xs truncate font-sans ${isMe ? 'text-purple-300 font-bold' : 'text-brand-text'}`}>
                              {entry.user.display_name} {isMe && `(${lang === 'es' ? 'Tú' : 'Tu'})`}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 font-mono text-[10px]">
                            {entry.matchesCount > 0 && (
                              <span 
                                className="bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 font-bold px-1.5 py-0.5 rounded" 
                                title={lang === 'es' ? 'Nro. de coincidencias con el consenso' : 'Nro. de coincidències amb el consens'}
                              >
                                {entry.matchesCount}🎯
                              </span>
                            )}
                            <span 
                              className="bg-bg2 border border-brand-border text-brand-text font-bold px-2 py-0.5 rounded" 
                              title={lang === 'es' ? 'Dispersión/desviación acumulada respecto al consenso colectivo' : 'Dispersió/desviació acumulada respecte al consens col·lectiu'}
                            >
                              {lang === 'es' ? 'Dispersión' : 'Dispersió'}: ±{entry.deviation}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* 4. ESTAT `FINISHED` (Taulell Final de Comparatives i Dines) */}
      {currentEdition.status === 'finished' && (
        <div className="space-y-10 max-w-5xl mx-auto py-4">
          {/* Banner de Consolidat - Augmentat de tamany i contrast per a vista clarificadora */}
          <div className="bg-brand-accent/15 border-2 border-brand-accent/40 rounded-2xl p-5 text-center shadow-lg shadow-brand-accent/5 max-w-3xl mx-auto">
            <p className="text-sm sm:text-base text-[#f8fafc] font-bold tracking-wide flex items-center justify-center gap-2">
              🏆 <span className="uppercase tracking-wider">{t('zampa_finished_info', lang)}</span>
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* GUANYADOR OFICIAL BANNER - DISSENY GRAN I ALT CONTRAST EN TONS BLAUS */}
            <div className="lg:col-span-5 bg-surface1 border-2 border-brand-border-high rounded-2xl p-6 text-center space-y-6 shadow-xl ring-2 ring-brand-accent/10">
              <div className="flex justify-center flex-col items-center space-y-2">
                <div className="p-3 bg-[#81a2cc]/10 rounded-full border border-[#81a2cc]/30 animate-bounce">
                  <Trophy className="text-[#81a2cc]" size={54} />
                </div>
                <h3 className="font-display text-2xl sm:text-3xl font-extrabold tracking-wide text-[#e5eefe] uppercase">
                  {lang === 'es' ? `GANADOR ZAMPA EDICIÓN ${currentEdition.id}` : `GUANYADOR ZAMPA EDICIÓ ${currentEdition.id}`}
                </h3>
                <span className="text-xs sm:text-sm text-[#81a2cc] font-extrabold bg-surface2 px-3.5 py-1 rounded-full uppercase tracking-widest border border-brand-border-high/30">
                  {lang === 'es' ? 'Tribunal Oficial ZAMPA' : 'Tribunal Oficial ZAMPA'}
                </span>
              </div>

              {officialWinnerObj ? (
                <div className="bg-bg2 p-5 border-2 border-brand-border rounded-xl space-y-4 flex flex-col items-center shadow-inner">
                  {/* Miniatura de la 2a foto del guanyador amb clic per ampliar (A1) */}
                  {(() => {
                    const sortedPhotos = [...((officialWinnerObj as any).photos || [])].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
                    const mainPhoto = sortedPhotos.length > 1 ? sortedPhotos[1] : sortedPhotos[0];
                    if (!mainPhoto) return null;
                    return (
                      <div
                        className="aspect-[4/3] w-full rounded-xl overflow-hidden border-2 border-brand-border-high hover:border-amber-400 cursor-zoom-in transition-all relative group my-2 shadow-lg"
                        onClick={() => {
                          const fullList = sortedPhotos.map((pt: any) => ({
                            url: pt.file_url,
                            fileName: pt.file_name || 'foto.jpg',
                          }));
                          setLightboxPhotos(fullList);
                          setLightboxStartIdx(sortedPhotos.indexOf(mainPhoto));
                          setLightboxUrl(mainPhoto.file_url);
                          setLightboxOpen(true);
                        }}
                      >
                        <img
                          src={mainPhoto.file_url}
                          alt={mainPhoto.file_name || "Winner main photo"}
                          className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-300"
                        />
                        <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                          <span className="bg-black/75 text-xs text-white font-extrabold py-1.5 px-3.5 rounded-full border border-white/20 select-none opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            🔍 {lang === 'es' ? 'Ampliar foto' : 'Ampliar foto'}
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="text-center space-y-1">
                    <h4 className="text-lg sm:text-xl font-black text-white leading-tight tracking-wide">{officialWinnerObj.author_name}</h4>
                    <p className="text-sm sm:text-base italic text-[#81a2cc] font-extrabold">"{officialWinnerObj.project_title}"</p>
                  </div>
                  {officialWinnerObj.description && (
                    <p className="text-xs sm:text-sm text-brand-text leading-relaxed text-center font-medium line-clamp-4 border-t border-brand-border pt-2.5">
                      {officialWinnerObj.description}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-300 italic font-medium">{lang === 'es' ? 'No se ha definido el ganador real todavía.' : "No s'ha definit el guanyador real encara."}</p>
              )}

              {/* El meu veredicte personal del guanyador i posició oficial FEM (A2) */}
              {officialWinnerObj && (
                <div className="bg-bg2 p-4.5 rounded-xl border-2 border-brand-border-high text-sm space-y-3 text-left">
                  <span className="text-white font-bold block text-xs sm:text-sm uppercase tracking-wide border-b border-brand-border pb-1.5">
                    {lang === 'es' ? 'Veredicto de este proyecto:' : 'Veredicte d\'aquest projecte:'}
                  </span>
                  
                  {/* Posició atorgada per la FEM */}
                  <div className="flex justify-between items-center mt-1">
                    <span className="font-bold text-slate-300">{lang === 'es' ? 'Posición de la quiniela FEM:' : 'Posició de la travessa de la FEM:'}</span>
                    {(() => {
                      if (winnerConsensusRank == null) {
                        return (
                          <span className="font-mono text-xs font-black text-slate-400 bg-surface3/40 border border-brand-border/30 px-3 py-1 rounded-lg select-none">
                            -
                          </span>
                        );
                      }
                      const suffix = lang === 'es' 
                        ? `${winnerConsensusRank}º` 
                        : `${winnerConsensusRank}${winnerConsensusRank === 1 ? 'r' : winnerConsensusRank === 2 ? 'n' : winnerConsensusRank === 3 ? 'r' : 'è'}`;
                      
                      let badgeStyle = '';
                      if (winnerConsensusRank === 1) {
                        badgeStyle = 'text-amber-300 bg-amber-400/10 border-amber-400/40 shadow-[0_0_8px_rgba(251,191,36,0.15)]';
                      } else if (winnerConsensusRank === 2) {
                        badgeStyle = 'text-slate-200 bg-slate-300/10 border-slate-300/35 shadow-[0_0_8px_rgba(203,213,225,0.15)]';
                      } else if (winnerConsensusRank === 3) {
                        badgeStyle = 'text-[#f5a152] bg-[#cd7f32]/10 border-[#cd7f32]/35 shadow-[0_0_8px_rgba(205,127,50,0.15)]';
                      } else {
                        badgeStyle = 'text-brand-text/90 bg-surface3 border-brand-border';
                      }

                      return (
                        <span className={`font-mono text-xs font-black border px-3 py-1 rounded-lg select-none ${badgeStyle}`}>
                          {winnerConsensusRank === 1 ? '🥇 ' : winnerConsensusRank === 2 ? '🥈 ' : winnerConsensusRank === 3 ? '🥉 ' : ''}
                          {suffix}
                        </span>
                      );
                    })()}
                  </div>

                  {/* Posició on el vas col·locar tu */}
                  <div className="flex justify-between items-center border-t border-brand-border/40 pt-2.5">
                    <span className="font-bold text-white">{lang === 'es' ? 'Posición donde lo colocaste:' : 'Posició on el vas col·locar:'}</span>
                    {(() => {
                      const myPos = userRanks.find(r => r.project_id === officialWinnerObj.id && r.category === activeTab)?.assigned_position ?? 'N/A';
                      const formattedMyPos = myPos === 'N/A' ? 'N/A' : (lang === 'es' ? `${myPos}º` : `${myPos}${myPos === 1 ? 'r' : myPos === 2 ? 'n' : myPos === 3 ? 'r' : 'è'}`);
                      const badgeClasses = 
                        myPos === 1 ? 'bg-amber-400/15 text-amber-300 border border-amber-400/30' :
                        myPos === 2 ? 'bg-slate-300/15 text-slate-200 border border-slate-300/30' :
                        myPos === 3 ? 'bg-[#cd7f32]/15 text-[#f5a152] border-[#cd7f32]/30' :
                        'bg-surface3 border border-brand-border-high text-brand-text';
                      return (
                        <span className={`font-black px-3 py-1 rounded-lg text-xs sm:text-sm font-mono border ${badgeClasses}`}>
                          {formattedMyPos}
                        </span>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>

            {/* COMPARATIVA I AFINITATS */}
            <div className="lg:col-span-7 space-y-6">
              
              {/* LA DIANA DE ZAMPA (PROXIMITAT AL GUANYADOR) */}
              <div className="bg-surface1 border-2 border-brand-border-high rounded-2xl p-6 space-y-4 text-left shadow-lg">
                <div className="flex items-center gap-2 border-b border-brand-border/60 pb-3.5">
                  <Award size={24} className="text-[#81a2cc]" />
                  <h4 className="font-extrabold text-base sm:text-lg tracking-wider uppercase text-white">
                    {t('zampa_proximitat_jurat', lang)}
                  </h4>
                </div>

                <p className="text-xs sm:text-sm text-brand-text font-medium leading-relaxed">
                  A continuació es mostren els socis de l'agrupació ordenats segons qui va col·locar a dalt de tot de la seva llista el projecte guanyador del jurat comercial:
                </p>

                {partnerProximityList.length === 0 ? (
                  <p className="text-sm text-slate-300 italic py-4">No s'han rebut valoracions de socis per a aquest any.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-1">
                    {partnerProximityList.map((entry, index) => {
                      const isMe = entry.partner.id === currentUser.id;
                      const pos = entry.pos;
                      
                      const formattedText = lang === 'es' 
                        ? `Podi: ${pos}º` 
                        : `Podi: ${pos === 1 ? '1er' : pos === 2 ? '2on' : pos === 3 ? '3er' : `${pos}è`}`;

                      let badgeClass = '';
                      if (pos === 1) {
                        badgeClass = 'bg-amber-400/10 text-amber-300 border border-amber-400/40 shadow-[0_0_8px_rgba(251,191,36,0.1)]';
                      } else if (pos === 2) {
                        badgeClass = 'bg-slate-300/10 text-slate-200 border border-slate-300/35 shadow-[0_0_8px_rgba(203,213,225,0.1)]';
                      } else if (pos === 3) {
                        badgeClass = 'bg-[#cd7f32]/10 text-[#f5a152] border border-[#cd7f32]/35 shadow-[0_0_8px_rgba(205,127,50,0.1)]';
                      } else {
                        badgeClass = 'bg-surface3 text-brand-text/85 border border-brand-border';
                      }

                      // Gold, silver, bronze borders for partner cards (B1 size fixes)
                      let cardBorder = 'border-brand-border hover:border-brand-border-high bg-bg2';
                      if (isMe) {
                        cardBorder = 'bg-bg2 border-white shadow-md';
                      } else if (pos === 1) {
                        cardBorder = 'border-amber-400/20 shadow-[0_0_12px_rgba(251,191,36,0.02)] bg-amber-400/[0.01] hover:border-amber-400/30';
                      } else if (pos === 2) {
                        cardBorder = 'border-slate-300/20 shadow-[0_0_12px_rgba(203,213,225,0.02)] bg-slate-300/[0.01] hover:border-slate-300/30';
                      } else if (pos === 3) {
                        cardBorder = 'border-[#cd7f32]/25 shadow-[0_0_12px_rgba(205,127,50,0.02)] bg-[#cd7f32]/[0.01] hover:border-[#cd7f32]/30';
                      }

                      return (
                        <div
                          key={entry.partner.id}
                          className={`p-3.5 rounded-xl border-2 flex justify-between items-center transition-all ${cardBorder}`}
                        >
                          <div className="flex items-center gap-2.5 truncate">
                            <span className="text-sm font-black text-[#81a2cc]/80">{index + 1}.</span>
                            <span className={`text-sm tracking-wide truncate text-white font-bold`}>
                              {entry.partner.display_name} {isMe && `(${lang === 'es' ? 'Tú' : 'Tu'})`}
                            </span>
                          </div>
                          <span className={`font-mono text-xs font-black px-2.5 py-1 rounded-lg border text-center select-none shrink-0 whitespace-nowrap ${badgeClass}`}>
                            {formattedText}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>


              {/* LA TRAVESSA DE LA FEM (CONSENS DELS SOCIS) */}
              <div className="bg-surface1 border-2 border-brand-border-high rounded-2xl p-6 space-y-5 text-left shadow-lg">
                <div className="flex items-center gap-2.5 border-b border-brand-border/60 pb-3.5">
                  <ListOrdered size={24} className="text-[#81a2cc]" />
                  <h4 className="font-extrabold text-base sm:text-lg tracking-wider uppercase text-white">
                    {lang === 'es' ? 'La Quiniela de la FEM (Consenso de Socios)' : 'La Travessa de la FEM (Consens dels Socis)'}
                  </h4>
                </div>

                <p className="text-xs sm:text-sm text-brand-text font-medium leading-relaxed">
                  {lang === 'es'
                    ? 'Esta es la clasificación colectiva de los proyectos resultante de calcular la posición media asignada por todos los socios que han emitido su voto, ordenados por la clasificación general de la votación popular.'
                    : 'Aquesta és la classificació col·lectiva dels lliuraments resultant de calcular la posició mitjana assignada per tots els socis que han emès el seu veredicte, ordenats per la classificació general del vot popular.'}
                </p>

                {(() => {
                  const categoryProjects = projects.filter(p => p.category === activeTab);
                  const consensusList = categoryProjects.map(proj => {
                    const ranks = userRanks.filter(r => r.project_id === proj.id && r.category === activeTab);
                    const count = ranks.length;
                    const sum = ranks.reduce((acc, r) => acc + r.assigned_position, 0);
                    const avg = count > 0 ? sum / count : 999;
                    const firsts = ranks.filter(r => r.assigned_position === 1).length;

                    // My contribution rank (C3)
                    const myPos = userRanks.find(r => r.project_id === proj.id && r.user_id === currentUser.id && r.category === activeTab)?.assigned_position ?? 999;

                    return {
                      project: proj,
                      avg,
                      sum,
                      firsts,
                      count,
                      consensusRank: 999,
                      myPos
                    };
                  });

                  // Sort initially by consensus to calculate each project's consensusRank
                  consensusList.sort((a, b) => {
                    if (a.avg !== b.avg) return a.avg - b.avg;
                    if (a.firsts !== b.firsts) return b.firsts - a.firsts;
                    if (a.sum !== b.sum) return a.sum - b.sum;
                    return a.project.author_name.localeCompare(b.project.author_name);
                  });

                  // Populate consensus rankings
                  consensusList.forEach((item, index) => {
                    item.consensusRank = index + 1;
                  });

                  // Filter projects with actual votes first to match user's previous fallback check
                  const hasVotes = consensusList.some(item => item.count > 0);

                  if (!hasVotes) {
                    return (
                      <p className="text-sm text-slate-300 italic py-2">
                        {lang === 'es' ? 'No hay suficientes votaciones de socios para calcular el consenso.' : 'No hi ha suficients votacions de socis per calcular el consens.'}
                      </p>
                    );
                  }

                  // C4: Dynamic sorting depending on sorting selection
                  const sortedList = [...consensusList].sort((a, b) => {
                    if (sectionCSort === 'popular') {
                      const posA = a.project.popular_rank_position ?? 999;
                      const posB = b.project.popular_rank_position ?? 999;
                      if (posA !== posB) return posA - posB;
                    } else if (sectionCSort === 'consensus') {
                      if (a.consensusRank !== b.consensusRank) return a.consensusRank - b.consensusRank;
                    } else if (sectionCSort === 'my_vote') {
                      if (a.myPos !== b.myPos) return a.myPos - b.myPos;
                    }
                    return a.project.author_name.localeCompare(b.project.author_name);
                  });

                  // Construct dynamic columns based on selected sort setting (C4)
                  let activeColumns: ('popular' | 'consensus' | 'my_vote')[];
                  if (sectionCSort === 'popular') {
                    activeColumns = ['popular', 'consensus', 'my_vote'];
                  } else if (sectionCSort === 'consensus') {
                    activeColumns = ['consensus', 'popular', 'my_vote'];
                  } else {
                    activeColumns = ['my_vote', 'consensus', 'popular'];
                  }

                  const getHeaderName = (colType: 'popular' | 'consensus' | 'my_vote') => {
                    if (colType === 'popular') return lang === 'es' ? 'Voto Popular' : 'Vot Popular';
                    if (colType === 'consensus') return lang === 'es' ? 'Consenso Socios' : 'Consens Socis';
                    return lang === 'es' ? 'Tu Veredicto' : 'El Teu Vot';
                  };

                  const getColVal = (item: typeof consensusList[0], colType: 'popular' | 'consensus' | 'my_vote') => {
                    if (colType === 'popular') return item.project.popular_rank_position ?? 999;
                    if (colType === 'consensus') return item.consensusRank;
                    return item.myPos;
                  };

                  // Metallic badge styling helper for premium consistent ranks display
                  const renderMetallicBadge = (val: number | string) => {
                    const numericVal = typeof val === 'number' ? val : parseInt(val.toString(), 10);
                    const isNaNVal = isNaN(numericVal) || numericVal === 999;
                    
                    if (isNaNVal) {
                      return (
                        <span className="font-mono text-xs text-brand-text-muted/50 font-semibold px-2.5 py-1 bg-surface3/40 border border-brand-border/30 rounded-lg select-none inline-block min-w-[75px] text-center">
                          -
                        </span>
                      );
                    }

                    const formattedText = lang === 'es' 
                      ? `${numericVal}º` 
                      : `${numericVal}${numericVal === 1 ? 'r' : numericVal === 2 ? 'n' : numericVal === 3 ? 'r' : 'è'}`;

                    let badgeStyle = '';
                    if (numericVal === 1) {
                      badgeStyle = 'bg-amber-400/10 text-amber-300 border border-amber-400/40 shadow-[0_0_8px_rgba(251,191,36,0.15)]';
                    } else if (numericVal === 2) {
                      badgeStyle = 'bg-slate-300/10 text-slate-200 border border-slate-300/35 shadow-[0_0_8px_rgba(203,213,225,0.15)]';
                    } else if (numericVal === 3) {
                      badgeStyle = 'bg-[#cd7f32]/10 text-[#f5a152] border border-[#cd7f32]/35 shadow-[0_0_8px_rgba(205,127,50,0.15)]';
                    } else {
                      badgeStyle = 'bg-surface3 text-brand-text/90 border border-brand-border';
                    }

                    return (
                      <span className={`font-mono text-xs font-black px-2.5 py-1 rounded-lg border inline-block select-none shrink-0 whitespace-nowrap min-w-[85px] text-center ${badgeStyle}`}>
                        {formattedText}
                      </span>
                    );
                  };

                  return (
                    <div className="space-y-4 font-sans">
                      
                      {/* Sorting filter interactive dropdown (C4) */}
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-bg2 p-4 rounded-xl border border-brand-border-high/30">
                        <label className="text-xs font-bold uppercase tracking-wider text-[#81a2cc] shrink-0">
                          {lang === 'es' ? 'Ordenar lista por:' : 'Ordenació de la llista per:'}
                        </label>
                        <select
                          value={sectionCSort}
                          onChange={(e) => setSectionCSort(e.target.value as any)}
                          className="bg-surface2 border border-brand-border hover:border-brand-accent-glow text-brand-text font-semibold text-xs py-2 px-3.5 rounded-lg cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-accent transition-all min-w-[200px]"
                        >
                          <option value="popular">
                            {lang === 'es' ? 'Voto Popular (Sala)' : 'Vot Popular (Sala)'}
                          </option>
                          <option value="consensus">
                            {lang === 'es' ? 'Consenso Socios (Quiniela / Travessa)' : 'Consens dels Socis (Travessa/Quiniela)'}
                          </option>
                          <option value="my_vote">
                            {lang === 'es' ? 'Tu apuesta personal' : 'El teu vot personal'}
                          </option>
                        </select>
                      </div>

                      {/* Column Headers (Desktop/Tablet-only with 'Projecte/Proyecto' label only) (C2) */}
                      <div className="hidden md:grid md:grid-cols-12 gap-4 px-4 py-3 text-xs sm:text-xs font-extrabold uppercase tracking-widest text-[#e5eefe] bg-bg2 rounded-xl border-2 border-brand-border-high">
                        <div className="col-span-3 text-center text-[#e5eefe] font-extrabold">{getHeaderName(activeColumns[0])}</div>
                        <div className="col-span-5 text-left text-[#e5eefe] font-extrabold pl-3">{lang === 'es' ? 'PROYECTO' : 'PROJECTE'}</div>
                        <div className="col-span-2 text-center text-[#e5eefe] font-extrabold">{getHeaderName(activeColumns[1])}</div>
                        <div className="col-span-2 text-center text-[#e5eefe] font-extrabold">{getHeaderName(activeColumns[2])}</div>
                      </div>

                      {sortedList.map((item) => {
                        if (item.count === 0) return null;
                        
                        const sortedPhotos = [...((item.project as any).photos || [])].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
                        // Show the 2nd photo if available, fallback to 1st (C1 & A1 style)
                        const mainPhoto = sortedPhotos.length > 1 ? sortedPhotos[1] : (sortedPhotos.length > 0 ? sortedPhotos[0] : null);

                        // Subtle metallic shines for row borders (Consensus focused)
                        let cardBorder = 'border-brand-border hover:border-brand-border-high bg-bg2';
                        if (item.consensusRank === 1) {
                          cardBorder = 'border-amber-400/20 shadow-[0_0_12px_rgba(251,191,36,0.03)] bg-amber-400/[0.005] hover:border-amber-400/35';
                        } else if (item.consensusRank === 2) {
                          cardBorder = 'border-slate-300/20 shadow-[0_0_12px_rgba(203,213,225,0.03)] bg-slate-300/[0.005] hover:border-slate-300/35';
                        } else if (item.consensusRank === 3) {
                          cardBorder = 'border-[#cd7f32]/25 shadow-[0_0_12px_rgba(205,127,50,0.03)] bg-[#cd7f32]/[0.005] hover:border-[#cd7f32]/35';
                        }

                        // Fetch the value to render in a particular column
                        const colVal1 = getColVal(item, activeColumns[0]);
                        const colVal2 = getColVal(item, activeColumns[1]);
                        const colVal3 = getColVal(item, activeColumns[2]);

                        return (
                          <div
                            key={item.project.id}
                            className={`border-2 rounded-xl p-4 md:p-5 grid grid-cols-1 md:grid-cols-12 items-center gap-4 hover:bg-surface2 transition-all duration-200 shadow-md ${cardBorder}`}
                          >
                            {/* Column 1: Ordenació Triada */}
                            <div className="col-span-12 md:col-span-3 flex md:justify-center items-center gap-3">
                              <span className="md:hidden text-xs text-[#81a2cc]/80 font-bold uppercase shrink-0 min-w-[120px]">
                                {getHeaderName(activeColumns[0])}:
                              </span>
                              {renderMetallicBadge(colVal1)}
                            </div>

                            {/* Column 2: Projecte */}
                            <div className="col-span-12 md:col-span-5 flex items-center gap-3 min-w-0">
                              <span className="md:hidden text-xs text-slate-300 font-bold uppercase shrink-0 min-w-[120px]">
                                {lang === 'es' ? 'Proyecto' : 'Projecte'}:
                              </span>
                              
                              <div className="flex items-center gap-3 truncate min-w-0">
                                {mainPhoto && (
                                  <div
                                    className="w-16 h-12 rounded-lg overflow-hidden border-2 border-brand-border hover:border-brand-accent cursor-zoom-in shrink-0 relative group shadow-md"
                                    onClick={() => {
                                      const fullList = sortedPhotos.map((pt: any) => ({
                                        url: pt.file_url,
                                        fileName: pt.file_name || 'foto.jpg',
                                      }));
                                      setLightboxPhotos(fullList);
                                      setLightboxStartIdx(sortedPhotos.indexOf(mainPhoto));
                                      setLightboxUrl(mainPhoto.file_url);
                                      setLightboxOpen(true);
                                    }}
                                    title={lang === 'es' ? 'Ver fotos completas' : 'Veure fotos completes'}
                                  >
                                    <img
                                      src={mainPhoto.file_url}
                                      alt={mainPhoto.file_name || "Project photo"}
                                      className="w-full h-full object-cover transition-transform group-hover:scale-115 duration-200"
                                    />
                                  </div>
                                )}
                                <div className="truncate min-w-0">
                                  <h5 className="text-sm sm:text-base font-black text-white truncate leading-tight">
                                    {item.project.author_name}
                                  </h5>
                                  <p className="text-xs text-[#81a2cc] font-bold truncate italic mt-0.5">
                                    "{item.project.project_title}"
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Column 3: Segona classificació */}
                            <div className="col-span-12 md:col-span-2 flex md:justify-center items-center gap-3">
                              <span className="md:hidden text-xs text-[#81a2cc]/80 font-bold uppercase shrink-0 min-w-[120px]">
                                {getHeaderName(activeColumns[1])}:
                              </span>
                              {renderMetallicBadge(colVal2)}
                            </div>

                            {/* Column 4: Tercera classificació */}
                            <div className="col-span-12 md:col-span-2 flex md:justify-center items-center gap-3">
                              <span className="md:hidden text-xs text-[#81a2cc]/80 font-bold uppercase shrink-0 min-w-[120px]">
                                {getHeaderName(activeColumns[2])}:
                              </span>
                              {renderMetallicBadge(colVal3)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

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
      />
    </div>
  );
}
