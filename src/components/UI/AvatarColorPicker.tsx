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
            onChange={(event) => {
              const customRgb = cssHexToRgbInt(event.target.value);
              if (customRgb !== null) setAvatarRgb(customRgb);
            }}
            aria-label="Choose a custom color"
          />
        </label>
      </div>

      <div className="avatar-color-swatches">
        {AVATAR_PALETTE.map((paletteRgb) => {
          const cssHex = rgbIntToCssHex(paletteRgb);
          const selected = paletteRgb === avatarRgb;
          return (
            <button
              key={paletteRgb}
              type="button"
              className="avatar-color-swatch"
              style={{ backgroundColor: cssHex }}
              title={cssHex}
              aria-label={`Color ${cssHex}`}
              aria-pressed={selected}
              onClick={() => setAvatarRgb(paletteRgb)}
            />
          );
        })}
      </div>
    </section>
  );
}
