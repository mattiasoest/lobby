import { useAvatarColor } from '../../app/avatarColorContext.tsx';
import { AVATAR_PALETTE, cssHexToRgbInt, rgbIntToCssHex } from '../../game/room/playerColor.ts';

export function AvatarColorPicker() {
  const { avatarRgb, setAvatarRgb } = useAvatarColor();
  const hex = rgbIntToCssHex(avatarRgb);

  return (
    <section className="avatar-color-picker" aria-labelledby="avatar-color-heading">
      <h2 id="avatar-color-heading">Your avatar color</h2>
      <p className="muted">Pick a color before entering a room. You can change it here anytime.</p>

      <div className="avatar-color-picker-row">
        <div className="avatar-color-preview" style={{ backgroundColor: hex }} aria-hidden title="Preview" />
        <label className="avatar-color-custom">
          <span className="avatar-color-custom-label">Custom</span>
          <input
            type="color"
            value={hex}
            onChange={(e) => {
              const n = cssHexToRgbInt(e.target.value);
              if (n !== null) setAvatarRgb(n);
            }}
            aria-label="Choose a custom color"
          />
        </label>
      </div>

      <div className="avatar-color-swatches">
        {AVATAR_PALETTE.map((c) => {
          const h = rgbIntToCssHex(c);
          const selected = c === avatarRgb;
          return (
            <button
              key={c}
              type="button"
              className="avatar-color-swatch"
              style={{ backgroundColor: h }}
              title={h}
              aria-label={`Color ${h}`}
              aria-pressed={selected}
              onClick={() => setAvatarRgb(c)}
            />
          );
        })}
      </div>
    </section>
  );
}
