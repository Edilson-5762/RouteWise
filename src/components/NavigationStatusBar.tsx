import { LogOut, Volume2, VolumeX, X } from 'lucide-react';
import { formatDistance, formatDuration } from '../utils/format';

interface NavigationStatusBarProps {
  durationSeconds: number;
  distanceMeters: number;
  isVoiceSupported: boolean;
  isVoiceMuted: boolean;
  onToggleVoice: () => void;
  onExit: () => void;
  onExitApp: () => void;
}

export function NavigationStatusBar({
  durationSeconds,
  distanceMeters,
  isVoiceSupported,
  isVoiceMuted,
  onToggleVoice,
  onExit,
  onExitApp,
}: NavigationStatusBarProps) {
  return (
    <div className="flex items-center justify-between gap-4 bg-surface px-4 py-3 text-surface-foreground shadow-[0_-4px_12px_rgba(0,0,0,0.1)]">
      <div className="flex items-baseline gap-3">
        <span className="text-lg font-bold">{formatDuration(durationSeconds)}</span>
        <span className="text-sm text-muted">{formatDistance(distanceMeters)}</span>
      </div>
      <div className="flex items-center gap-2">
        {isVoiceSupported && (
          <button
            type="button"
            onClick={onToggleVoice}
            aria-label={isVoiceMuted ? 'Ativar voz' : 'Silenciar voz'}
            className="rounded-full bg-primary/10 p-2 text-primary"
          >
            {isVoiceMuted ? (
              <VolumeX size={20} aria-hidden="true" />
            ) : (
              <Volume2 size={20} aria-hidden="true" />
            )}
          </button>
        )}
        <button
          type="button"
          onClick={onExit}
          aria-label="Sair da navegação"
          className="rounded-full bg-danger/10 p-2 text-danger"
        >
          <X size={20} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onExitApp}
          aria-label="Sair da página"
          className="rounded-full bg-danger/10 p-2 text-danger"
        >
          <LogOut size={20} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
