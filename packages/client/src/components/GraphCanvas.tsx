import { useEffect, useRef, useState } from "react";
import { Network } from "vis-network";
import { DataSet } from "vis-data";
import { Scan } from "lucide-react";
import { nodeColor, nodeTextColor } from "../../../shared/src/palette.ts";
import type {
  Cluster,
  NodeColorConfiguration,
} from "../../../shared/src/types.ts";
function appearance(type: string, configuration: NodeColorConfiguration) {
  const background = nodeColor(type, configuration);
  return {
    color: {
      background,
      border: "#475569",
      highlight: { background, border: "#1F2937" },
      hover: { background, border: "#475569" },
    },
    font: { color: nodeTextColor(background), size: 18, face: "Arial" },
  };
}
export function GraphCanvas({
  cluster,
  nodeColors,
  selected,
  focusRequest,
  onSelect,
}: {
  cluster: Cluster;
  nodeColors: NodeColorConfiguration;
  selected: string | null;
  focusRequest: { id: string } | null;
  onSelect: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const network = useRef<Network | null>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const [stabilizing, setStabilizing] = useState(true);
  const colorsRef = useRef(nodeColors);
  colorsRef.current = nodeColors;
  const updateColors = useRef<(configuration: NodeColorConfiguration) => void>(
    () => {},
  );
  useEffect(() => {
    const nodes = new DataSet(
      cluster.nodes.map((n) => ({
        id: n.id,
        label: n.name,
        ...appearance(n.type, colorsRef.current),
        shape: "ellipse",
        margin: { top: 8, right: 16, bottom: 8, left: 16 },
        borderWidth: 1,
        borderWidthSelected: 3,
      })),
    );
    const instance = new Network(
      container.current!,
      {
        nodes,
        edges: new DataSet(
          cluster.edges.map((e) => ({
            ...e,
            arrows: "to",
            color: { color: "#b5c5cb", highlight: "#2f756b" },
            width: 1.2,
            smooth: { enabled: true, type: "dynamic", roundness: 0.3 },
          })),
        ),
      },
      {
        layout: { randomSeed: 19, improvedLayout: cluster.nodes.length < 300 },
        interaction: {
          hover: true,
          hideEdgesOnDrag: true,
          keyboard: false,
          zoomSpeed: 0.25,
        },
        physics: {
          solver: "barnesHut",
          barnesHut: {
            gravitationalConstant: -7000,
            springLength: 260,
            springConstant: 0.035,
            avoidOverlap: 0.8,
          },
          stabilization: { iterations: 350 },
        },
        nodes: { chosen: true },
        edges: { selectionWidth: 2 },
      },
    );
    network.current = instance;
    let appliedRevision = colorsRef.current.revision;
    updateColors.current = (configuration) => {
      if (configuration.revision === appliedRevision) return;
      nodes.update(
        cluster.nodes.map((n) => ({
          id: n.id,
          ...appearance(n.type, configuration),
        })),
      );
      appliedRevision = configuration.revision;
    };
    instance.on("click", (e: { nodes: string[] }) => {
      if (e.nodes[0]) selectRef.current(String(e.nodes[0]));
    });
    instance.once("stabilizationIterationsDone", () => {
      instance.setOptions({ physics: { enabled: false } });
      setStabilizing(false);
      instance.fit({ animation: false });
    });
    if (cluster.nodes.length < 2) {
      setStabilizing(false);
      instance.setOptions({ physics: { enabled: false } });
    }
    return () => {
      instance.destroy();
      network.current = null;
      updateColors.current = () => {};
    };
  }, [cluster]);
  useEffect(() => {
    updateColors.current(nodeColors);
  }, [nodeColors]);
  useEffect(() => {
    if (selected && network.current) {
      network.current.selectNodes([selected]);
    }
  }, [selected]);
  useEffect(() => {
    if (focusRequest && network.current) {
      network.current.focus(focusRequest.id, {
        scale: 1.15,
        animation: { duration: 450, easingFunction: "easeInOutQuad" },
        locked: false,
      });
    }
  }, [focusRequest]);
  return (
    <div className="canvas-wrap">
      <div className="canvas-top-label">
        <span className="status-dot" />
        {stabilizing
          ? "Arranging your graph…"
          : `${cluster.nodes.length} rulesets · ${cluster.edges.length} connections`}
      </div>
      <div
        ref={container}
        className="graph-canvas"
        data-testid="graph-canvas"
        role="img"
        aria-label={`Interactive ruleset graph with ${cluster.nodes.length} nodes. Use the ruleset list to select nodes with a keyboard.`}
      />
      <div className="graph-controls">
        <button
          className="icon-button"
          aria-label="Fit graph to view"
          onClick={() =>
            network.current?.fit({
              animation: { duration: 400, easingFunction: "easeInOutQuad" },
            })
          }
        >
          <Scan size={18} />
        </button>
      </div>
    </div>
  );
}
