import { useEffect, useRef, useState } from 'react';
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import type { ToukouEdge, ToukouNode } from '../../lib/toukou';

interface SimNode extends SimulationNodeDatum {
  id: string;
  kind: 'main' | 'sub';
}

type SimLink = SimulationLinkDatum<SimNode>;

export interface NodePosition {
  x: number;
  y: number;
}

const MAIN_RADIUS = 62;
const SUB_RADIUS = 46;

/**
 * Runs a d3-force simulation over the toukou graph and returns live node
 * positions centered on (0,0). Mains repel strongly (so separate clusters
 * spread apart) while subs orbit their main via the link force; collision
 * radii keep the cards from overlapping. Positions of nodes that persist
 * across a refetch are preserved so realtime updates don't reshuffle the
 * whole board.
 */
export function useForceGraph(nodes: ToukouNode[], edges: ToukouEdge[]) {
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const simNodesRef = useRef<Map<string, SimNode>>(new Map());
  const [positions, setPositions] = useState<Map<string, NodePosition>>(new Map());

  // Reconcile the simulation only when the *set* of nodes/edges changes, not
  // on every count/vote refetch that returns the same topology.
  const nodeKey = nodes
    .map((n) => n.id)
    .sort()
    .join(',');
  const edgeKey = edges
    .map((e) => `${e.source}->${e.target}`)
    .sort()
    .join(',');

  useEffect(() => {
    const store = simNodesRef.current;
    const parentOf = new Map(edges.map((e) => [e.source, e.target]));

    // Add new nodes (seeded near their parent when possible), drop gone ones.
    const nextIds = new Set(nodes.map((n) => n.id));
    for (const id of [...store.keys()]) {
      if (!nextIds.has(id)) store.delete(id);
    }
    for (const node of nodes) {
      if (!store.has(node.id)) {
        const parentId = parentOf.get(node.id);
        const parent = parentId ? store.get(parentId) : undefined;
        store.set(node.id, {
          id: node.id,
          kind: node.kind,
          x: (parent?.x ?? 0) + (Math.random() - 0.5) * 80,
          y: (parent?.y ?? 0) + (Math.random() - 0.5) * 80,
        });
      }
    }

    const simNodes = [...store.values()];
    const simLinks: SimLink[] = edges.map((e) => ({ source: e.source, target: e.target }));

    const simulation = forceSimulation(simNodes)
      .force(
        'charge',
        forceManyBody<SimNode>().strength((d) => (d.kind === 'main' ? -520 : -140)),
      )
      .force(
        'link',
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance(84)
          .strength(0.75),
      )
      .force('center', forceCenter(0, 0))
      .force(
        'collide',
        forceCollide<SimNode>().radius((d) => (d.kind === 'main' ? MAIN_RADIUS : SUB_RADIUS)),
      );

    simulation.on('tick', () => {
      const next = new Map<string, NodePosition>();
      for (const n of simNodes) next.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
      setPositions(next);
    });

    simRef.current = simulation;
    simulation.alpha(0.9).restart();

    return () => {
      simulation.stop();
    };
    // Reconcile on topology change only (positions preserved via the ref store).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeKey, edgeKey]);

  function startDrag(id: string) {
    const sim = simRef.current;
    const node = simNodesRef.current.get(id);
    if (!sim || !node) return;
    sim.alphaTarget(0.3).restart();
    node.fx = node.x;
    node.fy = node.y;
  }

  function drag(id: string, x: number, y: number) {
    const node = simNodesRef.current.get(id);
    if (!node) return;
    node.fx = x;
    node.fy = y;
  }

  function endDrag(id: string) {
    const sim = simRef.current;
    const node = simNodesRef.current.get(id);
    if (!sim || !node) return;
    sim.alphaTarget(0);
    node.fx = null;
    node.fy = null;
  }

  return { positions, startDrag, drag, endDrag };
}
