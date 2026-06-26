import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, Download } from 'lucide-react';

interface PhotoItem {
  url: string;
  fileName?: string;
}

interface FullscreenViewerProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  fileName?: string;
  photosList?: PhotoItem[];
  startIndex?: number;
  showDownload?: boolean;
}

export default function FullscreenViewer({
  isOpen,
  onClose,
  url,
  fileName = 'foto.jpg',
  photosList = [],
  startIndex = 0,
  showDownload = false,
}: FullscreenViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [isPanning, setIsPanning] = useState(false);

  const imgRef = useRef<HTMLImageElement>(null);
  const dragStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const pinchStartDist = useRef(0);
  const pinchStartZoom = useRef(1);

  // Sync index when startIndex changes
  useEffect(() => {
    setCurrentIndex(startIndex);
  }, [startIndex, url]);

  // Reset zoom on index change
  useEffect(() => {
    setZoomLevel(1);
    setTx(0);
    setTy(0);
  }, [currentIndex]);

  if (!isOpen) return null;

  // CRITICAL FIX: Safe indexing to prevent undefined crash on stale index state transition
  const currentPhoto = (photosList && photosList.length > 0 && currentIndex >= 0 && currentIndex < photosList.length)
    ? photosList[currentIndex]
    : { url, fileName };

  const handleNext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (photosList.length > 0) {
      setCurrentIndex((prev) => (prev + 1) % photosList.length);
    }
  };

  const handlePrev = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (photosList.length > 0) {
      setCurrentIndex((prev) => (prev - 1 + photosList.length) % photosList.length);
    }
  };

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.2 : -0.2;
    const nextZoom = Math.min(4, Math.max(1, zoomLevel + delta));
    setZoomLevel(nextZoom);
    if (nextZoom === 1) {
      setTx(0);
      setTy(0);
    }
  };

  // Touch handlers for fluid swipe + pinch zoom
  const touchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDist.current = Math.hypot(dx, dy);
      pinchStartZoom.current = zoomLevel;
    } else if (e.touches.length === 1 && zoomLevel > 1) {
      setIsPanning(true);
      dragStart.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        tx,
        ty,
      };
    }
  };

  const touchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStartDist.current > 0) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const ratio = dist / pinchStartDist.current;
      const nextZoom = Math.min(4, Math.max(1, pinchStartZoom.current * ratio));
      setZoomLevel(nextZoom);
    } else if (e.touches.length === 1 && isPanning && zoomLevel > 1) {
      e.preventDefault();
      const deltaX = e.touches[0].clientX - dragStart.current.x;
      const deltaY = e.touches[0].clientY - dragStart.current.y;
      setTx(dragStart.current.tx + deltaX);
      setTy(dragStart.current.ty + deltaY);
    }
  };

  const touchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      pinchStartDist.current = 0;
    }
    if (e.touches.length === 0) {
      setIsPanning(false);
    }
  };

  // Keyboard controls
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowRight') handleNext();
    if (e.key === 'ArrowLeft') handlePrev();
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [currentIndex, photosList]);

  // Click & drag for mouse zoom
  const mouseDown = (e: React.MouseEvent) => {
    if (zoomLevel > 1) {
      e.preventDefault();
      setIsPanning(true);
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        tx,
        ty,
      };
    }
  };

  const mouseMove = (e: React.MouseEvent) => {
    if (isPanning && zoomLevel > 1) {
      const deltaX = e.clientX - dragStart.current.x;
      const deltaY = e.clientY - dragStart.current.y;
      setTx(dragStart.current.tx + deltaX);
      setTy(dragStart.current.ty + deltaY);
    }
  };

  const mouseUp = () => {
    setIsPanning(false);
  };

  const downloadSinglePhoto = async () => {
    if (!currentPhoto?.url) return;
    try {
      const res = await fetch(currentPhoto.url);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = currentPhoto.fileName || 'foto.jpg';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      window.open(currentPhoto.url, '_blank');
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/95 z-[2000] flex items-center justify-center select-none backdrop-blur-md"
      onClick={onClose}
    >
      {/* Dynamic Prev Button */}
      {photosList.length > 1 && (
        <button
          className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 bg-white/10 border border-white/20 text-white rounded-full w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center cursor-pointer backdrop-blur-md hover:bg-white/20 active:scale-95 transition-all z-50 shadow-lg"
          onClick={handlePrev}
          title="Anterior"
        >
          <ChevronLeft size={28} />
        </button>
      )}

      {/* Main Image Viewport */}
      {currentPhoto?.url && (
        <div
          className="relative max-w-[85vw] max-h-[85vh] overflow-hidden flex items-center justify-center"
          onWheel={handleWheel}
          onTouchStart={touchStart}
          onTouchMove={touchMove}
          onTouchEnd={touchEnd}
          onMouseDown={mouseDown}
          onMouseMove={mouseMove}
          onMouseUp={mouseUp}
          onMouseLeave={mouseUp}
          onClick={(e) => e.stopPropagation()}
        >
          <img
            ref={imgRef}
            src={currentPhoto.url}
            alt={currentPhoto.fileName || 'Zoom view'}
            style={{
              transform: `translate(${tx}px, ${ty}px) scale(${zoomLevel})`,
              transition: isPanning ? 'none' : 'transform 0.15s ease-out',
              maxHeight: '85vh',
              maxWidth: '85vw',
              objectFit: 'contain',
            }}
            className={`rounded-lg shadow-2xl transition-all duration-200 ${
              zoomLevel > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'
            }`}
          />
        </div>
      )}

      {/* Dynamic Next Button */}
      {photosList.length > 1 && (
        <button
          className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 bg-white/10 border border-white/20 text-white rounded-full w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center cursor-pointer backdrop-blur-md hover:bg-white/20 active:scale-95 transition-all z-50 shadow-lg"
          onClick={handleNext}
          title="Següent"
        >
          <ChevronRight size={28} />
        </button>
      )}

      {/* Top right toolbar (Download + Close) */}
      <div className="absolute top-4 right-4 sm:top-5 sm:right-6 flex gap-2.5 z-50">
        {showDownload && currentPhoto?.url && (
          <button
            className="bg-white/10 border border-white/20 text-white cursor-pointer rounded-xl w-12 h-12 flex items-center justify-center backdrop-blur-md hover:bg-white/20 active:scale-95 transition-all shadow-lg"
            onClick={(e) => {
              e.stopPropagation();
              downloadSinglePhoto();
            }}
            title="Descarregar imatge"
          >
            <Download size={20} />
          </button>
        )}
        <button
          className="bg-white/10 border border-white/20 text-white cursor-pointer rounded-xl px-4 h-12 flex items-center justify-center gap-1.5 backdrop-blur-md hover:bg-white/20 active:scale-95 transition-all shadow-lg text-xs font-bold font-mono tracking-wider"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          title="Tancar"
        >
          <X size={18} />
          <span>TANCAR</span>
        </button>
      </div>

      {/* Bottom Counter */}
      {photosList.length > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/60 border border-white/20 rounded-full px-5 py-2.5 text-white text-xs font-semibold tracking-wider backdrop-blur-md whitespace-nowrap shadow-lg">
          {currentIndex + 1} / {photosList.length}
        </div>
      )}
    </div>
  );
}
