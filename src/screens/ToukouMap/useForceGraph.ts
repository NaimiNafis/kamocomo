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

// Collision radii sized to each card's worst-case bounding *circle* (half its
// diagonal, main ~128x190 with a photo + archived-posts line, sub ~96x134
// with a photo) -- not just half the width. A radius that only covers the
// width leaves cards free to slide vertically into each other, which is
// exactly how they used to stack.
const MAIN_RADIUS = 116;
const SUB_RADIUS = 84;
const LINK_DISTANCE = MAIN_RADIUS + SUB_RADIUS + 30;

/**
 * Runs a d3-force simulation over one place's toukou graph (a single main
 * plus its subs) and returns live node positions centered on (0,0). The main
 * is pinned at the center as the fixed hub the subs orbit via the link
 * force; collision radii (sized to each card's full bounding circle, with
 * multiple solver iterations for a tighter guarantee) keep every card clear
 * of every other. Positions of nodes that persist across a refetch are
 * preserved so realtime updates don't reshuffle the whole board.
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
        const isMain = node.kind === 'main';
        const parentId = parentOf.get(node.id);
        const parent = parentId ? store.get(parentId) : undefined;
        store.set(node.id, {
          id: node.id,
          kind: node.kind,
          x: isMain ? 0 : (parent?.x ?? 0) + (Math.random() - 0.5) * 80,
          y: isMain ? 0 : (parent?.y ?? 0) + (Math.random() - 0.5) * 80,
          // The main is the fixed hub subs orbit around (a per-place graph
          // has exactly one); pinning it keeps the whole layout stable
          // instead of drifting as subs are added.
          fx: isMain ? 0 : undefined,
          fy: isMain ? 0 : undefined,
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
          .distance(LINK_DISTANCE)
          .strength(0.75),
      )
      .force('center', forceCenter(0, 0))
      .force(
        'collide',
        forceCollide<SimNode>()
          .radius((d) => (d.kind === 'main' ? MAIN_RADIUS : SUB_RADIUS))
          .strength(1)
          .iterations(3),
      );

    // Pre-warm synchronously: a dense graph (up to 21 nodes on the busiest
    // main) takes several seconds of real-time ticking to fully separate,
    // which otherwise shows as cards visibly jostling apart/overlapping
    // right after opening the page. Running the solver to convergence
    // *before* wiring up the tick listener means the very first (async,
    // next-frame) tick already reports settled positions -- the animated
    // loop below then only has to handle small ongoing changes (a drag, a
    // realtime insert), not untangle from scratch. (setPositions is only
    // ever called from that async tick callback, not synchronously here, to
    // avoid a synchronous setState-in-effect.)
    simulation.stop();
    for (let i = 0; i < 150; i++) simulation.tick();

    simulation.on('tick', () => {
      const next = new Map<string, NodePosition>();
      for (const n of simNodes) next.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
      setPositions(next);
    });

    simRef.current = simulation;
    simulation.alpha(0.3).restart();

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
