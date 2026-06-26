import React from 'react';
import { AlertTriangle, Info, HelpCircle } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  isWarning?: boolean;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = "D'acord",
  cancelText = "Cancel·la",
  isDanger = false,
  isWarning = false,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/85 backdrop-blur-md transition-opacity duration-300"
        onClick={onCancel}
      />
      
      {/* Modal Container */}
      <div className="relative w-full max-w-md transform overflow-hidden rounded-2xl bg-surface1 border border-brand-border p-6 text-left align-middle shadow-2xl transition-all z-10 animate-in fade-in zoom-in duration-200">
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-xl shrink-0 ${
            isDanger ? 'bg-red-500/10 text-red-500 border border-red-500/20' :
            isWarning ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20' :
            'bg-brand-accent/10 text-brand-accent border border-brand-accent/20'
          }`}>
            {isDanger || isWarning ? (
              <AlertTriangle size={24} />
            ) : (
              <HelpCircle size={24} />
            )}
          </div>
          
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-brand-text leading-snug">
              {title}
            </h3>
            <p className="text-sm text-brand-text-muted leading-relaxed whitespace-pre-line">
              {message}
            </p>
          </div>
        </div>

        {/* Actions Row */}
        <div className="mt-8 flex items-center justify-end gap-3">
          <button
            type="button"
            className="px-4 py-2 text-sm font-semibold rounded-lg text-brand-text-muted bg-bg1 border border-brand-border hover:bg-surface3 hover:text-brand-text transition-colors cursor-pointer"
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={`px-5 py-2 text-sm font-bold rounded-lg text-white transition-colors cursor-pointer shadow-lg shadow-black/10 ${
              isDanger 
                ? 'bg-red-600 hover:bg-red-500 hover:shadow-red-500/10' 
                : isWarning 
                ? 'bg-yellow-600 hover:bg-yellow-500 hover:shadow-yellow-500/10 text-black' 
                : 'bg-brand-accent hover:opacity-90 hover:shadow-brand-accent-glow'
            }`}
            onClick={() => {
              onConfirm();
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
