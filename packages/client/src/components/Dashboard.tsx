import {Link} from "react-router-dom";
import {
    ArrowDownToLine,
    ArrowRight,
    Check,
    CheckCircle2,
    Clock3,
    FileJson,
    FolderOpen,
    GitBranch,
    Layers,
    Network,
    Pencil,
    Play,
    Plus,
    Sparkles,
    Trash2,
    Upload,
} from "lucide-react";
import type {ClusterResponse, Workflow} from "../../../shared/src/types.ts";

const format = (count: number) => count.toLocaleString();

export function Dashboard({
                              workflows,
                              data,
                              busy,
                              onAdd,
                              onEdit,
                              onRemove,
                              onToggle,
                              onGenerate,
                              onImport,
                          }: {
    workflows: Workflow[];
    data: ClusterResponse;
    busy: boolean;
    onAdd: () => void;
    onEdit: (w: Workflow) => void;
    onRemove: (w: Workflow) => void;
    onToggle: (w: Workflow) => void;
    onGenerate: () => void;
    onImport: () => void;
}) {
    const enabled = workflows.filter((w) => w.enabled).length;
    const rulesets = data.clusters.reduce((n, c) => n + c.nodeCount, 0);
    const edges = data.clusters.reduce((n, c) => n + c.edgeCount, 0);

    return (
        <div className="dashboard">
            <div className="breadcrumb">
                Workspace <span>/</span> Overview
            </div>
            <div className="page-heading">
                <div>
                    <div className="eyebrow">WORKFLOW INTELLIGENCE</div>
                    <h1>Your workflows, connected.</h1>
                    <p>Turn complex Fluent Commerce workflows into a clear picture.</p>
                </div>
                <button className="button primary" onClick={onAdd} disabled={busy}>
                    <Plus size={17}/>
                    Add workflow
                </button>
            </div>
            <div className="stats-grid">
                {[
                    {
                        label: "Workflows",
                        value: workflows.length,
                        detail: `${enabled} enabled for analysis`,
                        icon: FileJson,
                    },
                    {
                        label: "Rulesets",
                        value: rulesets,
                        detail: "Across your latest analysis",
                        icon: Layers,
                    },
                    {
                        label: "Connections",
                        value: edges,
                        detail: "Directed ruleset relationships",
                        icon: GitBranch,
                    },
                    {
                        label: "Clusters",
                        value: data.clusters.length,
                        detail: "Connected groups of rulesets",
                        icon: Network,
                    },
                ].map(({label, value, detail, icon: Icon}) => (
                    <div className="stat-card" key={label}>
                        <div className="stat-title">
                            {label}
                            <Icon size={17}/>
                        </div>
                        <div className="stat-number">{format(value)}</div>
                        <div className="stat-detail">{detail}</div>
                    </div>
                ))}
            </div>
            <div className="workspace-grid">
                <section className="panel workflows-panel">
                    <div className="panel-header">
                        <div>
                            <h2>
                                Workflow library{" "}
                                <span className="count-badge">{workflows.length}</span>
                            </h2>
                            <p>Your source files, ready to explore.</p>
                        </div>
                        <button
                            className="icon-button"
                            aria-label="Add another workflow"
                            onClick={onAdd}
                            disabled={busy}
                        >
                            <Plus size={18}/>
                        </button>
                    </div>
                    {workflows.length ? (
                        <div className="table-scroll">
                            <table>
                                <thead>
                                <tr>
                                    <th>Workflow</th>
                                    <th>Source</th>
                                    <th>Enabled</th>
                                    <th>
                                        <span className="sr-only">Actions</span>
                                    </th>
                                </tr>
                                </thead>
                                <tbody>
                                {workflows.map((w) => (
                                    <tr key={w.id}>
                                        <td>
                                            <div className="workflow-name">
                          <span className="file-icon">
                            <FileJson size={20}/>
                          </span>
                                                <div>
                                                    <strong>{w.name}</strong>
                                                    <span title={w.location ?? w.filename ?? ""}>
                              {w.location ?? w.filename}
                            </span>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                        <span className="source-tag">
                          {w.source === "path" ? (
                              <FolderOpen size={13}/>
                          ) : (
                              <Upload size={13}/>
                          )}{" "}
                            {w.source === "path" ? "Local path" : "Upload"}
                        </span>
                                        </td>
                                        <td>
                                            <button
                                                role="switch"
                                                aria-checked={w.enabled}
                                                aria-label={`Enable ${w.name}`}
                                                disabled={busy}
                                                className={`switch ${w.enabled ? "on" : ""}`}
                                                onClick={() => onToggle(w)}
                                            >
                                                <span>{w.enabled && <Check size={10}/>}</span>
                                            </button>
                                        </td>
                                        <td>
                                            <div className="row-actions">
                                                <button
                                                    className="icon-button"
                                                    aria-label={`Edit ${w.name}`}
                                                    onClick={() => onEdit(w)}
                                                    disabled={busy}
                                                >
                                                    <Pencil size={15}/>
                                                </button>
                                                <button
                                                    className="icon-button remove"
                                                    aria-label={`Remove ${w.name}`}
                                                    onClick={() => onRemove(w)}
                                                    disabled={busy}
                                                >
                                                    <Trash2 size={15}/>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="empty-library">
                            <div className="empty-icon">
                                <FolderOpen size={29}/>
                                <span>+</span>
                            </div>
                            <h3>A home for your workflows</h3>
                            <p>
                                Add a local JSON path or upload a workflow file.
                                <br/>
                                Your first connection starts here.
                            </p>
                            <button className="button secondary" onClick={onAdd}>
                                <Plus size={16}/>
                                Add your first workflow
                            </button>
                        </div>
                    )}
                    <div className="panel-footer">
                        <span className="status-dot"/>
                        Stored locally. Source files stay in your control.
                    </div>
                </section>
                <section className="analysis-card">
                    <div className="analysis-top">
            <span className="analysis-icon">
              <Sparkles size={19}/>
            </span>
                        <span className="pill">GRAPH ENGINE</span>
                    </div>
                    <h2>See the bigger picture.</h2>
                    <p>Find how your rulesets connect, across every enabled workflow.</p>
                    <div className="connection-art" aria-hidden="true">
                        <svg viewBox="0 0 330 120">
                            <path d="M42 60H115M115 60L194 25M115 60L194 96M194 25L280 60M194 96L280 60"/>
                            <circle cx="42" cy="60" r="12"/>
                            <circle cx="115" cy="60" r="17"/>
                            <circle cx="194" cy="25" r="11"/>
                            <circle cx="194" cy="96" r="11"/>
                            <circle cx="280" cy="60" r="15"/>
                        </svg>
                    </div>
                    <div className="generation-summary">
            <span>
              {enabled} workflow{enabled !== 1 ? "s" : ""} enabled
            </span>
                        <span>Local analysis</span>
                    </div>
                    <button
                        className="button generate"
                        onClick={onGenerate}
                        disabled={busy || !enabled}
                    >
                        <Play size={15} fill="currentColor"/>
                        {busy ? "Generating…" : "Generate clusters"}
                        <ArrowRight size={17}/>
                    </button>
                    <span className="analysis-hint">
            {busy
                ? "Building your graph. This may take a moment."
                : "Uses the latest contents of your source files."}
          </span>
                </section>
            </div>
            <section className="cluster-section">
                <div className="section-heading">
                    <div>
                        <h2>
                            Generated clusters{" "}
                            <span className="count-badge">{data.clusters.length}</span>
                        </h2>
                        <p>Explore connected groups to understand the flow.</p>
                    </div>
                    {data.snapshot && (
                        <div className="snapshot-label">
                            <Clock3 size={14}/>
                            {new Date(data.snapshot.createdAt).toLocaleString(undefined, {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                            })}
                            {!data.stale && (
                                <span className="current-label">
                  <CheckCircle2 size={13}/>
                  Up to date
                </span>
                            )}
                        </div>
                    )}
                </div>
                {data.stale && (
                    <div className="notice warning">
                        <Clock3 size={16}/>
                        <div>
                            <strong>Results need a refresh</strong>
                            <span>
                {data.snapshot?.imported
                    ? "These clusters were copied from FluentGraph. Regenerate to restore workflow provenance."
                    : "Your workflow library has changed. Generate again to update these clusters."}
              </span>
                        </div>
                    </div>
                )}
                {data.clusters.length ? (
                    <div className="cluster-grid">
                        {data.clusters.map((c, index) => (
                            <Link
                                className="cluster-card"
                                key={c.id}
                                to={"/clusters/" + c.id}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`Explore Cluster ${index + 1}, ${c.nodeCount} rulesets`}
                            >
                                <div className="cluster-card-top">
                  <span className="cluster-glyph">
                    <Network size={22}/>
                  </span>
                                    <ArrowRight size={18}/>
                                </div>
                                <h3>Cluster {index + 1}</h3>
                                <div className="cluster-meta">
                                    <span>{format(c.nodeCount)} rulesets</span>
                                    <i/> <span>{format(c.edgeCount)} connections</span>
                                </div>
                                <div className="type-chips">
                                    {c.types.slice(0, 3).map((t) => (
                                        <span key={t}>{t.replaceAll("_", " ")}</span>
                                    ))}
                                    {c.types.length > 3 && <span>+{c.types.length - 3}</span>}
                                </div>
                                <p className="cluster-preview">{c.preview.join(" · ")}</p>
                            </Link>
                        ))}
                    </div>
                ) : (
                    <div className="empty-clusters">
            <span className="empty-cluster-symbol">
              <Network size={25}/>
            </span>
                        <div>
                            <h3>
                                {data.snapshot
                                    ? "No rulesets found"
                                    : "Your next insight is a graph away"}
                            </h3>
                            <p>
                                {data.snapshot
                                    ? "The enabled workflows have no rulesets. Add another workflow to continue."
                                    : "Enable your workflows and generate clusters to see their connections here."}
                            </p>
                        </div>
                    </div>
                )}
            </section>
            {!workflows.length && !data.snapshot && (
                <div className="import-banner">
          <span className="import-icon">
            <ArrowDownToLine size={22}/>
          </span>
                    <div>
                        <h3>Already using FluentGraph?</h3>
                        <p>
                            Bring your workflows and generated clusters into this workspace.
                        </p>
                    </div>
                    <button className="button secondary" onClick={onImport}>
                        Import existing data
                        <ArrowRight size={15}/>
                    </button>
                </div>
            )}
            <footer className="workspace-footer">
        <span>
          FLUENTGRAPH <span className="footer-separator">/</span> Built for a
          clearer view.
        </span>
                <span>
          <span className="status-dot"/>
          Local workspace
        </span>
            </footer>
        </div>
    );
}
