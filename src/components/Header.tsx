import { Download, Globe, Info, Moon, ShieldCheck, Sun } from 'lucide-react';
import { formatBytes } from '../engines/formatUtils';
import { useI18n } from '../i18n/useI18n';
import { useTheme } from '../i18n/useTheme';

interface HeaderProps {
  totalLocalBytes: number;
  canInstallPwa: boolean;
  onInstallPwa: () => void;
  onOpenPrivacyModal: () => void;
  onNavigateHome: () => void;
}

export function Header({
  totalLocalBytes,
  canInstallPwa,
  onInstallPwa,
  onOpenPrivacyModal,
  onNavigateHome,
}: HeaderProps) {
  const { lang, setLang, t } = useI18n();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--studio-border)] bg-[#F4F2EC]/90 backdrop-blur-md dark:bg-[#111113]/90">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <button
          type="button"
          onClick={onNavigateHome}
          className="group flex items-center gap-3 text-left transition hover:opacity-90"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--studio-border)] bg-[#141416] shadow-sm">
            <img src="/icons/icon.svg" alt="LokalConvert" className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-extrabold tracking-tight text-[#141413] dark:text-[#F3F2EE]">
                {t('appName')}
              </span>
              <span
                title={t('privacyTooltip')}
                className="hidden items-center gap-1.5 rounded-md border border-[var(--studio-border)] bg-[var(--studio-surface)] px-2 py-0.5 font-mono text-[11px] font-medium text-[#15803D] sm:inline-flex dark:text-[#4ADE80]"
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                <ShieldCheck className="h-3 w-3" />
                {t('privacyBadge')}
              </span>
            </div>
            <p className="text-[11px] text-[var(--studio-muted)]">{t('tagline')}</p>
          </div>
        </button>

        <div className="flex items-center gap-2">
          {totalLocalBytes > 0 && (
            <div
              className="tactile-well hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-mono text-[11px] md:flex"
              title={t('localSavedLabel')}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#FF5416]" />
              <span className="text-[var(--studio-muted)]">{t('localSavedLabel')}:</span>
              <span className="font-bold tabular-nums text-[#141413] dark:text-[#F3F2EE]">
                {formatBytes(totalLocalBytes)}
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={onOpenPrivacyModal}
            className="tactile-key inline-flex items-center gap-1.5 rounded-lg bg-[var(--studio-surface)] px-3 py-1.5 text-xs font-semibold text-[#141413] dark:text-[#F3F2EE]"
          >
            <Info className="h-3.5 w-3.5 text-[#FF5416]" />
            <span className="hidden sm:inline">{t('howItWorks')}</span>
          </button>

          {canInstallPwa && (
            <button
              type="button"
              onClick={onInstallPwa}
              className="tactile-trigger inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold"
            >
              <Download className="h-3.5 w-3.5" />
              {t('installApp')}
            </button>
          )}

          <button
            type="button"
            onClick={toggleTheme}
            title={t('toggleThemeLabel')}
            aria-label={t('toggleThemeLabel')}
            className="tactile-key inline-flex items-center justify-center rounded-lg bg-[var(--studio-surface)] p-1.5 text-[#141413] dark:text-[#F3F2EE]"
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4 text-amber-400" />
            ) : (
              <Moon className="h-4 w-4 text-[#141413]" />
            )}
          </button>

          <div
            className="tactile-well inline-flex items-center rounded-lg p-0.5 font-mono"
            role="group"
            aria-label="Language switch"
          >
            <Globe className="mx-1.5 h-3.5 w-3.5 text-[var(--studio-muted)]" />
            <button
              type="button"
              onClick={() => setLang('id')}
              className={`rounded-md px-2 py-1 text-[11px] font-bold transition ${
                lang === 'id'
                  ? 'bg-[#FF5416] text-white shadow-xs'
                  : 'text-[var(--studio-muted)] hover:text-[#141413] dark:hover:text-[#F3F2EE]'
              }`}
            >
              ID
            </button>
            <button
              type="button"
              onClick={() => setLang('en')}
              className={`rounded-md px-2 py-1 text-[11px] font-bold transition ${
                lang === 'en'
                  ? 'bg-[#FF5416] text-white shadow-xs'
                  : 'text-[var(--studio-muted)] hover:text-[#141413] dark:hover:text-[#F3F2EE]'
              }`}
            >
              EN
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
