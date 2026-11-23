import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Search,
  Braces,
  Copy,
  Check,
  PanelLeft,
  PanelRight,
  Network,
  AlertCircle,
} from "lucide-react";
import { nodeColor } from "../../../shared/src/palette.ts";
import type {
  Cluster,
  ClusterResponse,
  NodeColorConfiguration,
} from "../../../shared/src/types.ts";
import { api } from "../api";
import { tokenizeJsonLine } from "../jsonSyntax";
import { GraphCanvas } from "./GraphCanvas";
export function Explorer({
  data,
  nodeColors,
  navigationOpen,
  onToggleNavigation,
}: {
  data: ClusterResponse;
  nodeColors: NodeColorConfiguration;
  navigationOpen: boolean;
  onToggleNavigation: () => void;
}) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [cluster, setCluster] = useState<Cluster | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ id: string } | null>(null);
  const [mobilePanel, setMobilePanel] = useState<"graph" | "list" | "json">(
    "graph",
  );
  const [leftWidth, setLeftWidth] = useState(480);
  const [listShare, setListShare] = useState(50);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let current = true;
    setCluster(null);
    setSelected(null);
    setFocusRequest(null);
    setSearch("");
    setError("");
    api<Cluster>("/clusters/" + encodeURIComponent(id ?? ""))
      .then((c) => {
        if (current) setCluster(c);
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [id]);
  const node = cluster?.nodes.find((n) => n.id === selected);
  const ordinal = data.clusters.findIndex((c) => c.id === id) + 1;
  if (error)
    return (
      <div className="route-state">
        <AlertCircle size={38} />
        <h1>Cluster unavailable</h1>
        <p>{error}</p>
        <Link className="button primary" to="/">
          Back to overview
        </Link>
      </div>
    );
  if (!cluster)
    return (
      <div className="route-state" role="status">
        <span className="loading-spinner" />
        <p>Loading your graph…</p>
      </div>
    );
  const filtered = cluster.nodes.filter((n) =>
    `${n.name} ${n.type} ${n.subtype ?? ""} ${n.workflowName ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  function select(id: string) {
    setSelected(id);
    setCopied(false);
    setMobilePanel("json");
  }
  return (
    <div className="explorer">
      <header className="explorer-heading">
        <div className="explorer-heading-main">
          <button
            className="icon-button navigation-toggle"
            aria-label={
              navigationOpen
                ? "Hide navigation sidebar"
                : "Show navigation sidebar"
            }
            aria-expanded={navigationOpen}
            aria-controls="app-navigation"
            onClick={onToggleNavigation}
          >
            <PanelLeft size={22} />
          </button>
          <Link className="back-link" to="/">
            <ArrowLeft size={14} />
            Overview
          </Link>
          <div className="explorer-title">
            <h1>Cluster {ordinal || "—"}</h1>
            <span className="pill">{cluster.nodes.length} RULESETS</span>
            {data.stale && <span className="stale-tag">Refresh needed</span>}
          </div>
        </div>
        <div className="cluster-select">
          <label className="sr-only" htmlFor="cluster-choice">
            Exploring
          </label>
          <select
            id="cluster-choice"
            value={id}
            onChange={(e) => navigate("/clusters/" + e.target.value)}
          >
            {data.clusters.map((c, i) => (
              <option key={c.id} value={c.id}>
                Cluster {i + 1} · {c.nodeCount} rulesets
              </option>
            ))}
          </select>
        </div>
      </header>
      <div className="explorer-mobile-tabs">
        <button
          aria-label="Rulesets panel"
          className={mobilePanel === "list" ? "active" : ""}
          onClick={() => setMobilePanel("list")}
        >
          <PanelLeft size={16} />
          Rulesets
        </button>
        <button
          className={mobilePanel === "graph" ? "active" : ""}
          onClick={() => setMobilePanel("graph")}
        >
          <Network size={16} />
          Graph
        </button>
        <button
          aria-label="JSON panel"
          className={mobilePanel === "json" ? "active" : ""}
          onClick={() => setMobilePanel("json")}
        >
          <PanelRight size={16} />
          Inspector
        </button>
      </div>
      <div
        className={`explorer-panels mobile-${mobilePanel}`}
        style={
          {
            "--left-panel": `${leftWidth}px`,
            "--ruleset-row": `${listShare}fr`,
            "--json-row": `${100 - listShare}fr`,
          } as CSSProperties
        }
      >
        <aside className="ruleset-panel">
          <div className="pane-heading">
            <h2>Rulesets</h2>
            <span className="count-badge">{cluster.nodes.length}</span>
          </div>
          <div className="ruleset-search">
            <Search size={16} />
            <input
              aria-label="Search rulesets"
              placeholder="Find a ruleset…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                className="clear-search"
                aria-label="Clear search"
                onClick={() => setSearch("")}
              >
                ×
              </button>
            )}
          </div>
          <div className="ruleset-list">
            {filtered.length ? (
              filtered.map((n) => (
                <button
                  key={n.id}
                  aria-label={`Select ${n.name}, ${n.type}`}
                  aria-pressed={selected === n.id}
                  className={`ruleset-item ${selected === n.id ? "selected" : ""}`}
                  onClick={() => {
                    select(n.id);
                    setFocusRequest({ id: n.id });
                  }}
                >
                  <span
                    className="node-dot"
                    style={{ background: nodeColor(n.type, nodeColors) }}
                  />
                  <span>
                    <strong>{n.name}</strong>
                    <small>{n.type.replaceAll("_", " ")}</small>
                  </span>
                </button>
              ))
            ) : (
              <p className="search-empty">No rulesets match “{search}”.</p>
            )}
          </div>
          <div className="ruleset-count">
            {filtered.length} of {cluster.nodes.length} rulesets
          </div>
        </aside>
        <div
          role="separator"
          aria-label="Resize left panel"
          aria-orientation="vertical"
          aria-valuenow={leftWidth}
          aria-valuemin={300}
          aria-valuemax={760}
          tabIndex={0}
          className="panel-resizer"
          onKeyDown={(e) => {
            if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
              e.preventDefault();
              setLeftWidth((v) =>
                Math.min(
                  760,
                  Math.max(300, v + (e.key === "ArrowRight" ? 16 : -16)),
                ),
              );
            }
          }}
          onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              const r = e.currentTarget.parentElement!.getBoundingClientRect();
              setLeftWidth(Math.max(300, Math.min(760, e.clientX - r.left)));
            }
          }}
        />
        <section className="graph-panel">
          <GraphCanvas
            cluster={cluster}
            nodeColors={nodeColors}
            selected={selected}
            focusRequest={focusRequest}
            onSelect={select}
          />
        </section>
        <div
          role="separator"
          aria-label="Resize ruleset and JSON panels"
          aria-orientation="horizontal"
          aria-valuenow={listShare}
          aria-valuemin={20}
          aria-valuemax={80}
          tabIndex={0}
          className="panel-resizer horizontal-resizer"
          onKeyDown={(e) => {
            if (["ArrowUp", "ArrowDown"].includes(e.key)) {
              e.preventDefault();
              setListShare((v) =>
                Math.max(
                  20,
                  Math.min(80, v + (e.key === "ArrowDown" ? 5 : -5)),
                ),
              );
            }
          }}
          onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              const bounds =
                e.currentTarget.parentElement!.getBoundingClientRect();
              setListShare(
                Math.max(
                  20,
                  Math.min(
                    80,
                    (100 * (e.clientY - bounds.top)) / bounds.height,
                  ),
                ),
              );
            }
          }}
        />
        <aside className="inspector-panel" aria-label="Ruleset JSON">
          {node ? (
            <>
              <div className="json-toolbar">
                <span>
                  <FileCodeIcon />
                  ruleset.json
                </span>
                <button
                  className="icon-button"
                  aria-label="Copy ruleset JSON"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        JSON.stringify(node.ruleset, null, 2),
                      );
                      setCopied(true);
                    } catch {
                      setCopied(false);
                    }
                  }}
                >
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                </button>
              </div>
              <pre className="json-code" data-testid="json-inspector">
                <code>
                  {JSON.stringify(node.ruleset, null, 2)
                    .split("\n")
                    .map((line, i) => (
                      <span className="code-line" key={i}>
                        <span className="line-number" aria-hidden="true">
                          {i + 1}
                        </span>
                        <span>
                          {tokenizeJsonLine(line).map((token, index) => (
                            <span className={`json-${token.kind}`} key={index}>
                              {token.text}
                            </span>
                          ))}
                        </span>
                        {"\n"}
                      </span>
                    ))}
                </code>
              </pre>
              {copied && (
                <span className="copy-status" role="status">
                  Copied to clipboard
                </span>
              )}
            </>
          ) : (
            <div className="inspector-empty">
              <div>
                <Braces size={31} />
              </div>
              <h3>A closer look</h3>
              <p>
                Select a ruleset in the graph or list to inspect its JSON
                definition.
              </p>
              <span>Every detail, in one place.</span>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
function FileCodeIcon() {
  return <Braces size={13} />;
}
