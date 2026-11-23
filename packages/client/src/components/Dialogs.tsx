import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  X,
  FileJson,
  FolderOpen,
  Upload,
  ArrowDownToLine,
  AlertTriangle,
} from "lucide-react";
import type { Workflow } from "../../../shared/src/types.ts";
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-label={title}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={19} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function WorkflowDialog({
  workflow,
  onSave,
  onClose,
}: {
  workflow: Workflow | null;
  onSave: (
    body: FormData | Record<string, unknown>,
    id?: string,
  ) => Promise<void>;
  onClose: () => void;
}) {
  const [source, setSource] = useState<"path" | "upload">(
    workflow?.source ?? "path",
  );
  const [name, setName] = useState(workflow?.name ?? "");
  const [path, setPath] = useState(workflow?.location ?? "");
  const [enabled, setEnabled] = useState(workflow?.enabled ?? true);
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setPending(true);
    try {
      let body: FormData | Record<string, unknown> = {
        name,
        enabled,
        ...(source === "path" ? { location: path } : {}),
      };
      if (source === "upload" && !workflow) {
        if (!file) throw Error("Choose a JSON file.");
        body = new FormData();
        body.set("name", name);
        body.set("enabled", String(enabled));
        body.set("file", file);
      }
      await onSave(body, workflow?.id);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal
      title={workflow ? "Edit workflow" : "Add workflow"}
      onClose={() => {
        if (!pending) onClose();
      }}
    >
      <p className="modal-intro">
        Connect a Fluent Commerce workflow to your workspace.
      </p>
      <form onSubmit={submit}>
        {!workflow && (
          <div className="tabs" role="tablist" aria-label="Workflow source">
            <button
              type="button"
              role="tab"
              aria-selected={source === "path"}
              onClick={() => setSource("path")}
            >
              <FolderOpen size={16} />
              Local path
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={source === "upload"}
              onClick={() => setSource("upload")}
            >
              <Upload size={16} />
              Upload JSON
            </button>
          </div>
        )}
        <label className="field">
          Workflow name
          <input
            required
            maxLength={200}
            autoFocus
            value={name}
            placeholder="e.g. Order lifecycle"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {source === "path" ? (
          <label className="field">
            Absolute JSON path
            <input
              required
              value={path}
              placeholder="/Users/you/workflows/order.json"
              onChange={(e) => setPath(e.target.value)}
            />
            <span>
              Read from disk each time you generate clusters. Up to 25 MiB.
            </span>
          </label>
        ) : workflow ? (
          <div className="file-summary">
            <FileJson size={20} />
            {workflow.filename}
            <span>Stored in this workspace</span>
          </div>
        ) : (
          <label className="field">
            JSON file
            <div className="upload-area">
              <FileJson size={28} />
              <strong>Choose a workflow JSON file</strong>
              <span>Up to 25 MiB · stored in this workspace</span>
              <input
                type="file"
                accept=".json,application/json"
                required
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </label>
        )}
        <label className="check-field">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Include in cluster generation
        </label>
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            disabled={pending}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button primary" disabled={pending}>
            {pending ? "Saving…" : "Save workflow"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function ImportDialog({
  onImport,
  onClose,
}: {
  onImport: (directory: string) => Promise<void>;
  onClose: () => void;
}) {
  const [directory, setDirectory] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      await onImport(directory);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal
      title="Bring your existing work"
      onClose={() => {
        if (!pending) onClose();
      }}
    >
      <div className="dialog-symbol">
        <ArrowDownToLine size={25} />
      </div>
      <p className="modal-intro">
        Copy workflow registrations and generated clusters from FluentGraph.
        Your original application and files stay untouched.
      </p>
      <form onSubmit={submit}>
        <label className="field">
          Legacy application directory
          <input
            required
            placeholder="/path/to/FluentGraph"
            value={directory}
            onChange={(e) => setDirectory(e.target.value)}
          />
          <span>Contains data/workflowFiles.json and data/clusters.json.</span>
        </label>
        <p className="muted small">
          Available only when this workspace is empty. Imported nodes show their
          original JSON; regenerate to restore workflow provenance.
        </p>
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            disabled={pending}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button primary" disabled={pending}>
            {pending ? "Importing…" : "Import a copy"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function RemoveDialog({
  workflow,
  onRemove,
  onClose,
}: {
  workflow: Workflow;
  onRemove: () => Promise<void>;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      title="Remove workflow?"
      onClose={() => {
        if (!pending) onClose();
      }}
    >
      <div className="dialog-symbol danger">
        <AlertTriangle size={25} />
      </div>
      <p className="modal-intro">
        Remove <strong>{workflow.name}</strong> from this workspace? The source
        file on disk will stay untouched. Generated results will need a refresh.
      </p>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      <div className="modal-actions">
        <button
          className="button secondary"
          disabled={pending}
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          className="button destructive"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            try {
              await onRemove();
              onClose();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setPending(false);
            }
          }}
        >
          {pending ? "Removing…" : "Remove workflow"}
        </button>
      </div>
    </Modal>
  );
}
