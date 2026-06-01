import { Suspense } from 'react';
import { useAuth } from '@/app/authContext.tsx';
import { useAvatar } from '@/app/avatarContext.tsx';
import { LoadingIndicatorFallback } from '@/components/LoadingIndicatorFallback/LoadingIndicatorFallback.tsx';
import { useSuspenseMeQuery } from '@/query/hooks.ts';
import {
  AVATAR_OPTIONS,
  avatarPreviewStyle,
  getAvatarOption,
  readAvatarPreviewSheets,
  sanitizeAvatarId,
} from '../../game/config/avatars.ts';
import type { CSSProperties, PointerEvent } from 'react';
import styles from './AvatarSelector.css';

const PREVIEW_SIZE_PX = 56;
const OPTION_SIZE_PX = 48;

function RetroLockIcon() {
  return (
    <svg className={styles.lock} viewBox="0 0 16 16" aria-hidden shapeRendering="crispEdges">
      <rect x="5" y="1" width="6" height="2" />
      <rect x="4" y="3" width="2" height="4" />
      <rect x="10" y="3" width="2" height="4" />
      <rect x="3" y="6" width="10" height="9" />
      <rect x="4" y="7" width="2" height="2" className={styles.lockShine} />
      <rect x="7" y="9" width="2" height="4" className={styles.lockKeyhole} />
    </svg>
  );
}

function AvatarSpritePreview({
  optionId,
  sizePx,
  className,
}: {
  optionId: string;
  sizePx: number;
  className?: string;
}) {
  const option = getAvatarOption(optionId);
  if (!option?.preview) return null;
  const style = avatarPreviewStyle(option.preview, sizePx);
  return (
    <span
      className={className}
      style={{
        width: sizePx,
        height: sizePx,
        backgroundImage: style.backgroundImage,
        backgroundSize: style.backgroundSize,
        backgroundPosition: style.backgroundPosition,
        backgroundRepeat: 'no-repeat',
      }}
      aria-hidden
    />
  );
}

function AvatarSelectorContent() {
  const { token } = useAuth();
  const { setAvatarId, avatarUpdating } = useAvatar();
  const { data: me } = useSuspenseMeQuery(token as string);
  readAvatarPreviewSheets();

  const avatarId = sanitizeAvatarId(me.avatarId);
  const selectedOption = getAvatarOption(avatarId);
  const selectionLocked = avatarUpdating;

  const selectAvatar = (id: string) => {
    if (selectionLocked || id === avatarId) return;
    setAvatarId(id);
  };

  const handleAvatarPointerUp = (e: PointerEvent<HTMLButtonElement>, id: string) => {
    if (e.pointerType !== 'touch' || e.currentTarget.disabled) return;
    selectAvatar(id);
    e.preventDefault();
  };

  return (
    <>
      <p className="muted">Pick an avatar before entering a room. You can change it here anytime.</p>

      <div className={styles.previewRow}>
        <AvatarSpritePreview optionId={avatarId} sizePx={PREVIEW_SIZE_PX} className={styles.preview} />
        <div className={styles.selectedLabel}>
          <span className={styles.selectedName}>{selectedOption?.label ?? 'Traveler'}</span>
          <span className={`muted ${styles.status}`} aria-live="polite">
            {avatarUpdating ? 'Saving…' : null}
          </span>
        </div>
      </div>

      <div
        className={styles.grid}
        role="listbox"
        aria-label="Avatar options"
        style={{ '--avatar-option-sprite-size': `${OPTION_SIZE_PX}px` } as CSSProperties}
      >
        {AVATAR_OPTIONS.map((option) => {
          const selected = option.id === avatarId;
          if (!option.unlocked) {
            return (
              <button
                key={option.id}
                type="button"
                className={`${styles.option} ${styles.optionLocked}`}
                disabled
                aria-disabled="true"
                title="Coming soon"
                role="option"
                aria-selected={false}
              >
                <span
                  className={`${styles.optionSprite} ${styles.optionSpriteLocked}`}
                  style={{ width: OPTION_SIZE_PX, height: OPTION_SIZE_PX }}
                  aria-hidden
                >
                  <RetroLockIcon />
                </span>
                <span className={`${styles.optionLabel} ${styles.comingSoon}`}>Coming soon</span>
              </button>
            );
          }

          return (
            <button
              key={option.id}
              type="button"
              className={`${styles.option}${selected ? ` ${styles.optionSelected}` : ''}`}
              aria-pressed={selected}
              aria-selected={selected}
              role="option"
              disabled={selectionLocked}
              title={option.label}
              onPointerUp={(e) => handleAvatarPointerUp(e, option.id)}
              onClick={() => selectAvatar(option.id)}
            >
              <AvatarSpritePreview optionId={option.id} sizePx={OPTION_SIZE_PX} className={styles.optionSprite} />
              <span className={styles.optionLabel}>{option.label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

export function AvatarSelector() {
  return (
    <section className={styles.root} aria-labelledby="avatar-selector-heading">
      <h2 id="avatar-selector-heading">Your avatar</h2>
      <Suspense fallback={<LoadingIndicatorFallback inline label="Loading avatar…" ariaLabel="Loading avatar" />}>
        <AvatarSelectorContent />
      </Suspense>
    </section>
  );
}
