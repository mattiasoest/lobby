import { useAvatar } from '../../app/avatarContext.tsx';
import { AVATAR_OPTIONS, avatarPreviewStyle, getAvatarOption } from '../../game/room/avatars.ts';
import type { CSSProperties } from 'react';

const PREVIEW_SIZE_PX = 56;
const OPTION_SIZE_PX = 48;

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

export function AvatarSelector() {
  const { avatarId, avatarLoading, avatarUpdating, setAvatarId } = useAvatar();
  const selectedOption = getAvatarOption(avatarId);

  return (
    <section className="avatar-selector" aria-labelledby="avatar-selector-heading">
      <h2 id="avatar-selector-heading">Your avatar</h2>
      <p className="muted">Pick an avatar before entering a room. You can change it here anytime.</p>

      <div className="avatar-selector-preview-row">
        <AvatarSpritePreview optionId={avatarId} sizePx={PREVIEW_SIZE_PX} className="avatar-preview" />
        <div className="avatar-selector-selected-label">
          <span className="avatar-selector-selected-name">{selectedOption?.label ?? 'Traveler'}</span>
          <span className="muted avatar-selector-status" aria-live="polite">
            {avatarLoading || avatarUpdating ? (avatarUpdating ? 'Saving…' : 'Loading…') : null}
          </span>
        </div>
      </div>

      <div
        className="avatar-selector-grid"
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
                className="avatar-option avatar-option--locked"
                disabled
                aria-disabled="true"
                title="Coming soon"
                role="option"
                aria-selected={false}
              >
                <span
                  className="avatar-option-sprite avatar-option-sprite--locked"
                  style={{ width: OPTION_SIZE_PX, height: OPTION_SIZE_PX }}
                  aria-hidden
                >
                  <span className="avatar-option-lock">🔒</span>
                </span>
                <span className="avatar-option-label avatar-option-coming-soon">Coming soon</span>
              </button>
            );
          }

          return (
            <button
              key={option.id}
              type="button"
              className={`avatar-option${selected ? ' avatar-option--selected' : ''}`}
              aria-pressed={selected}
              aria-selected={selected}
              role="option"
              disabled={avatarLoading || avatarUpdating}
              title={option.label}
              onClick={() => setAvatarId(option.id)}
            >
              <AvatarSpritePreview optionId={option.id} sizePx={OPTION_SIZE_PX} className="avatar-option-sprite" />
              <span className="avatar-option-label">{option.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
