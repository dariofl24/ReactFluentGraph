import { useState } from "react";
import type { FormEvent } from "react";
import { Plus, Save, Trash2, Palette } from "lucide-react";
import type { NodeColorConfiguration } from "../../../shared/src/types.ts";
import {
  DEFAULT_NODE_COLORS,
  DEFAULT_FALLBACK_COLOR,
  nodeTextColor,
} from "../../../shared/src/palette.ts";
const validColor = (color: string) => /^#[0-9a-fA-F]{6}$/.test(color);
function ColorFields({
  type,
  color,
  onChange,
  disabled,
}: {
  type: string;
  color: string;
  onChange: (color: string) => void;
  disabled: boolean;
}) {
  const valid = validColor(color),
    preview = valid ? color : DEFAULT_FALLBACK_COLOR;
  return (
    <div className="color-fields">
      <input
        type="color"
        aria-label={`Color for ${type}`}
        value={preview}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        disabled={disabled}
      />
      <input
        className="hex-input"
        aria-label={`Hex color for ${type}`}
        value={color}
        onChange={(e) => onChange(e.target.value)}
        required
        pattern="#[0-9a-fA-F]{6}"
        maxLength={7}
        spellCheck={false}
        aria-invalid={!valid}
        disabled={disabled}
      />
      <span
        className="color-preview"
        style={{ background: preview, color: nodeTextColor(preview) }}
      >
        Example ruleset
      </span>
    </div>
  );
}
export function Configuration({
  initialConfiguration,
  onSave,
}: {
  initialConfiguration: NodeColorConfiguration;
  onSave: (
    configuration: NodeColorConfiguration,
  ) => Promise<NodeColorConfiguration>;
}) {
  const [saved, setSaved] = useState(initialConfiguration);
  const [colors, setColors] = useState({ ...initialConfiguration.colors });
  const [fallbackColor, setFallbackColor] = useState(
    initialConfiguration.fallbackColor,
  );
  const [newType, setNewType] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_FALLBACK_COLOR);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const dirty =
    fallbackColor !== saved.fallbackColor ||
    Object.keys(colors).length !== Object.keys(saved.colors).length ||
    Object.entries(colors).some(
      ([type, color]) => saved.colors[type] !== color,
    );
  const valid =
    validColor(fallbackColor) && Object.values(colors).every(validColor);
  function addType(event: FormEvent) {
    event.preventDefault();
    setError("");
    const type = newType.trim().toUpperCase();
    if (!type) {
      setError("Enter a type name.");
      return;
    }
    if (Object.hasOwn(colors, type)) {
      setError(`Type ${type} is already configured.`);
      return;
    }
    if (!validColor(newColor)) {
      setError("Use a six-digit hex color, such as #BAE6FD.");
      return;
    }
    setColors((current) => ({ ...current, [type]: newColor.toUpperCase() }));
    setNewType("");
    setNewColor(DEFAULT_FALLBACK_COLOR);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const next = await onSave({
        colors,
        fallbackColor,
        revision: saved.revision,
      });
      setSaved(next);
      setColors({ ...next.colors });
      setFallbackColor(next.fallbackColor);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="dashboard configuration-page">
      <div className="breadcrumb">
        Workspace <span>/</span> Configuration
      </div>
      <div className="page-heading">
        <div>
          <div className="eyebrow">WORKSPACE SETTINGS</div>
          <h1>Node colors</h1>
          <p>
            Choose a color for each entity type. Saved changes update your
            existing graphs.
          </p>
        </div>
        <span className="configuration-symbol">
          <Palette size={26} />
        </span>
      </div>
      <section className="panel add-type-panel">
        <div className="panel-header">
          <div>
            <h2>Add a type</h2>
            <p>Type names match your workflow JSON, ignoring letter case.</p>
          </div>
        </div>
        <form onSubmit={addType} className="add-type-form">
          <label className="field">
            New type name
            <input
              aria-label="New type name"
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              placeholder="e.g. LOYALTY_EVENT"
              required
              maxLength={100}
              disabled={pending}
            />
          </label>
          <label className="field">
            Color
            <div className="new-color-fields">
              <input
                aria-label="New type color"
                type="color"
                value={validColor(newColor) ? newColor : DEFAULT_FALLBACK_COLOR}
                onChange={(e) => setNewColor(e.target.value.toUpperCase())}
                disabled={pending}
              />
              <input
                aria-label="New type hex color"
                className="hex-input"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                required
                pattern="#[0-9a-fA-F]{6}"
                maxLength={7}
                spellCheck={false}
                disabled={pending}
              />
            </div>
          </label>
          <button className="button secondary" disabled={pending}>
            <Plus size={17} />
            Add type
          </button>
        </form>
      </section>
      {error && (
        <div className="notice error configuration-error" role="alert">
          {error}
        </div>
      )}
      {initialConfiguration.revision !== saved.revision &&
        !pending &&
        initialConfiguration.revision > saved.revision && (
          <div className="notice warning">
            Settings changed in another tab. Reload this page to load the latest
            saved colors before saving your draft.
          </div>
        )}
      <form onSubmit={save} className="configuration-editor">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>
                Type colors{" "}
                <span className="count-badge">
                  {Object.keys(colors).length}
                </span>
              </h2>
              <p>Use the color picker or enter a six-digit hex value.</p>
            </div>
          </div>
          <div className="type-color-list">
            {Object.entries(colors)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([type, color]) => (
                <div className="type-color-row" key={type}>
                  <strong>{type}</strong>
                  <ColorFields
                    type={type}
                    color={color}
                    disabled={pending}
                    onChange={(value) =>
                      setColors((current) => ({ ...current, [type]: value }))
                    }
                  />
                  {!Object.hasOwn(DEFAULT_NODE_COLORS, type) ? (
                    <button
                      type="button"
                      className="icon-button remove"
                      aria-label={`Remove type ${type}`}
                      disabled={pending}
                      onClick={() =>
                        setColors((current) =>
                          Object.fromEntries(
                            Object.entries(current).filter(
                              ([key]) => key !== type,
                            ),
                          ),
                        )
                      }
                    >
                      <Trash2 size={17} />
                    </button>
                  ) : (
                    <span className="color-remove-placeholder" />
                  )}
                </div>
              ))}
          </div>
        </section>
        <section className="panel fallback-panel">
          <div>
            <h2>Unconfigured types</h2>
            <p>
              Use this color when a workflow contains a type without a
              configured color.
            </p>
          </div>
          <ColorFields
            type="unconfigured types"
            color={fallbackColor}
            disabled={pending}
            onChange={setFallbackColor}
          />
        </section>
        <div className="configuration-actions">
          <span>
            {pending
              ? "Saving colors…"
              : dirty
                ? "You have unsaved changes."
                : "All changes saved."}
          </span>
          <button
            type="button"
            className="button secondary"
            disabled={pending || !dirty}
            onClick={() => {
              setColors({ ...saved.colors });
              setFallbackColor(saved.fallbackColor);
              setError("");
            }}
          >
            Discard changes
          </button>
          <button
            className="button primary"
            disabled={pending || !dirty || !valid}
          >
            <Save size={17} />
            {pending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
