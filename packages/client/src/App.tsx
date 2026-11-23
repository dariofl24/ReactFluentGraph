import {lazy, Suspense, useEffect, useRef, useState} from "react";
import {Link, NavLink, Route, Routes, useLocation} from "react-router-dom";
import {
    AlertCircle,
    ArrowUpRight,
    CheckCircle2,
    FolderOpen,
    LayoutDashboard,
    Network,
    RefreshCw,
    Settings,
    X,
} from "lucide-react";
import {defaultNodeColorConfiguration} from "../../shared/src/palette.ts";
import {Configuration} from "./components/Configuration";
import type {ClusterResponse, NodeColorConfiguration, Workflow,} from "../../shared/src/types.ts";
import {api} from "./api";
import {Dashboard} from "./components/Dashboard";
import {ImportDialog, RemoveDialog, WorkflowDialog,} from "./components/Dialogs";

const Explorer = lazy(() =>
    import("./components/Explorer").then((m) => ({default: m.Explorer})),
);
const empty: ClusterResponse = {snapshot: null, stale: false, clusters: []};

export function App() {
    const [workflows, setWorkflows] = useState<Workflow[]>([]);
    const [data, setData] = useState<ClusterResponse>(empty);
    const [nodeColors, setNodeColors] = useState<NodeColorConfiguration>(
        defaultNodeColorConfiguration,
    );
    const colorChannel = useRef<BroadcastChannel | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");

    const [message, setMessage] = useState<{
        text: string;
        error: boolean;
    } | null>(null);

    const [busy, setBusy] = useState(false);
    const [editor, setEditor] = useState<Workflow | null | undefined>(undefined);
    const [removing, setRemoving] = useState<Workflow | null>(null);
    const [importing, setImporting] = useState(false);
    const [navigationOpen, setNavigationOpen] = useState(false);
    const location = useLocation();
    const explorer = location.pathname.startsWith("/clusters/");

    async function refresh() {
        const [w, c, colors] = await Promise.all([
            api<Workflow[]>("/workflows"),
            api<ClusterResponse>("/clusters"),
            api<NodeColorConfiguration>("/configuration/node-colors"),
        ]);
        setWorkflows(w);
        setData(c);
        setNodeColors((current) =>
            current.revision >= colors.revision ? current : colors,
        );
    }

    async function load() {
        setLoading(true);
        setLoadError("");
        try {
            await refresh();
        } catch (e) {
            setLoadError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void load();
    }, []);

    useEffect(() => {
        let active = true;
        const refreshColors = () => {
            void api<NodeColorConfiguration>("/configuration/node-colors")
                .then((next) => {
                    if (active)
                        setNodeColors((current) =>
                            current.revision >= next.revision ? current : next,
                        );
                })
                .catch(() => {
                    /* Keep the last loaded colors when temporarily disconnected. */
                });
        };
        const channel =
            typeof BroadcastChannel !== "undefined"
                ? new BroadcastChannel("fluentgraph-node-colors")
                : null;
        colorChannel.current = channel;
        if (channel) channel.onmessage = refreshColors;
        window.addEventListener("focus", refreshColors);
        return () => {
            active = false;
            channel?.close();
            colorChannel.current = null;
            window.removeEventListener("focus", refreshColors);
        };
    }, []);

    async function saveNodeColors(configuration: NodeColorConfiguration) {
        const next = await api<NodeColorConfiguration>(
            "/configuration/node-colors",
            {method: "PUT", body: JSON.stringify(configuration)},
        );
        setNodeColors((current) =>
            current.revision >= next.revision ? current : next,
        );
        colorChannel.current?.postMessage({revision: next.revision});
        setMessage({text: "Node colors saved.", error: false});
        return next;
    }

    async function mutate(action: () => Promise<unknown>, success: string) {
        await action();
        await refresh();
        setMessage({text: success, error: false});
    }

    async function generate() {
        setBusy(true);
        setMessage(null);
        try {
            await mutate(
                () => api("/generations", {method: "POST"}),
                "Clusters generated. Your latest analysis is ready to explore.",
            );
        } catch (e) {
            setMessage({text: (e as Error).message, error: true});
        } finally {
            setBusy(false);
        }
    }

    return (
        <div
            className={`app-shell ${explorer ? "is-explorer" : ""} ${navigationOpen ? "navigation-open" : ""}`}
        >
            <aside className="app-sidebar" id="app-navigation">
                <Link to="/" className="brand" aria-label="FluentGraph home">
          <span className="brand-mark">
            <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
            >
              <path
                  d="M6 6L18 12L6 18V6Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
              />
              <circle cx="6" cy="6" r="2.5" fill="currentColor"/>
              <circle cx="18" cy="12" r="2.5" fill="currentColor"/>
              <circle cx="6" cy="18" r="2.5" fill="currentColor"/>
            </svg>
          </span>
                    <span>
            Fluent<span className="brand-light">Graph</span>
            <small>WORKFLOW EXPLORER</small>
          </span>
                </Link>
                <div className="workspace-label">YOUR WORKSPACE</div>
                <nav aria-label="Main navigation">
                    <NavLink to="/" end>
                        <LayoutDashboard size={18}/>
                        Overview
                    </NavLink>
                    {data.clusters.length ? (
                        <NavLink
                            to={
                                explorer
                                    ? location.pathname
                                    : "/clusters/" + data.clusters[0].id
                            }
                            target={explorer ? undefined : "_blank"}
                            rel={explorer ? undefined : "noopener noreferrer"}
                        >
                            <Network size={18}/>
                            Graph explorer
                            <ArrowUpRight size={14}/>
                        </NavLink>
                    ) : (
                        <span className="nav-disabled">
              <Network size={18}/>
              Graph explorer
            </span>
                    )}
                    <NavLink to="/configuration">
                        <Settings size={18}/>
                        Configuration
                    </NavLink>
                </nav>
                <div className="sidebar-note">
          <span className="note-icon">
            <Network size={21}/>
          </span>
                    <h3>
                        Less complexity.
                        <br/>
                        More clarity.
                    </h3>
                    <p>A connected view of your Fluent Commerce workflows.</p>
                    <span className="note-line"/>
                </div>
                <div className="sidebar-bottom">
                    <div className="local-badge">
                        <span className="status-dot"/>
                        <span>
              Local workspace<small>Private by design</small>
            </span>
                        <FolderOpen size={15}/>
                    </div>
                    <span className="version-label">
            FLUENTGRAPH <span>v1.0</span>
          </span>
                </div>
            </aside>
            <div className="app-body">
                {!explorer && (
                    <header className="topbar">
            <span className="topbar-context">
              <span className="project-avatar">FG</span>Fluent Commerce
              <span className="topbar-slash">/</span>
              <span className="muted">Workflow intelligence</span>
            </span>
                        <span className="topbar-status">
              <span className="status-dot"/>
              Runs on your machine
            </span>
                        <Link
                            className="icon-button mobile-configuration-link"
                            to="/configuration"
                            aria-label="Node color configuration"
                        >
                            <Settings size={22}/>
                        </Link>
                    </header>
                )}
                {message && (
                    <div
                        className={`toast ${message.error ? "error" : ""}`}
                        role={message.error ? "alert" : "status"}
                    >
                        {message.error ? (
                            <AlertCircle size={18}/>
                        ) : (
                            <CheckCircle2 size={18}/>
                        )}
                        <span>{message.text}</span>
                        <button
                            className="icon-button"
                            aria-label="Dismiss notification"
                            onClick={() => setMessage(null)}
                        >
                            <X size={16}/>
                        </button>
                    </div>
                )}
                {loading ? (
                    <div className="route-state" role="status">
                        <span className="loading-spinner"/>
                        <p>Opening your workspace…</p>
                    </div>
                ) : loadError ? (
                    <div className="route-state">
                        <AlertCircle size={35}/>
                        <h1>Unable to load workspace</h1>
                        <p>{loadError}</p>
                        <button className="button primary" onClick={() => void load()}>
                            <RefreshCw size={16}/>
                            Retry connection
                        </button>
                    </div>
                ) : (
                    <main>
                        <Routes>
                            <Route
                                path="/"
                                element={
                                    <Dashboard
                                        workflows={workflows}
                                        data={data}
                                        busy={busy}
                                        onAdd={() => setEditor(null)}
                                        onEdit={setEditor}
                                        onRemove={setRemoving}
                                        onToggle={(w) => {
                                            void mutate(
                                                () =>
                                                    api("/workflows/" + w.id, {
                                                        method: "PATCH",
                                                        body: JSON.stringify({enabled: !w.enabled}),
                                                    }),
                                                `${w.name} ${w.enabled ? "disabled" : "enabled"}.`,
                                            ).catch((e) =>
                                                setMessage({text: e.message, error: true}),
                                            );
                                        }}
                                        onGenerate={() => void generate()}
                                        onImport={() => setImporting(true)}
                                    />
                                }
                            />
                            <Route
                                path="/clusters/:id"
                                element={
                                    <Suspense
                                        fallback={
                                            <div className="route-state" role="status">
                                                Loading graph explorer…
                                            </div>
                                        }
                                    >
                                        <Explorer
                                            data={data}
                                            nodeColors={nodeColors}
                                            navigationOpen={navigationOpen}
                                            onToggleNavigation={() =>
                                                setNavigationOpen((open) => !open)
                                            }
                                        />
                                    </Suspense>
                                }
                            />
                            <Route
                                path="/configuration"
                                element={
                                    <Configuration
                                        initialConfiguration={nodeColors}
                                        onSave={saveNodeColors}
                                    />
                                }
                            />
                            <Route
                                path="*"
                                element={
                                    <div className="route-state">
                                        <h1>Page not found</h1>
                                        <Link className="button primary" to="/">
                                            Back to overview
                                        </Link>
                                    </div>
                                }
                            />
                        </Routes>
                    </main>
                )}
            </div>
            {editor !== undefined && (
                <WorkflowDialog
                    workflow={editor}
                    onClose={() => setEditor(undefined)}
                    onSave={async (body, id) => {
                        await mutate(
                            () =>
                                api(
                                    body instanceof FormData
                                        ? "/workflows/upload"
                                        : id
                                            ? "/workflows/" + id
                                            : "/workflows",
                                    {
                                        method: id ? "PATCH" : "POST",
                                        body:
                                            body instanceof FormData ? body : JSON.stringify(body),
                                    },
                                ),
                            "Workflow saved to your library.",
                        );
                    }}
                />
            )}
            {importing && (
                <ImportDialog
                    onClose={() => setImporting(false)}
                    onImport={async (directory) => {
                        await mutate(
                            () =>
                                api("/import/legacy", {
                                    method: "POST",
                                    body: JSON.stringify({directory}),
                                }),
                            "Your existing workflows and clusters have been copied into this workspace.",
                        );
                    }}
                />
            )}
            {removing && (
                <RemoveDialog
                    workflow={removing}
                    onClose={() => setRemoving(null)}
                    onRemove={async () => {
                        await mutate(
                            () => api("/workflows/" + removing.id, {method: "DELETE"}),
                            "Workflow removed from this workspace.",
                        );
                    }}
                />
            )}
        </div>
    );
}
