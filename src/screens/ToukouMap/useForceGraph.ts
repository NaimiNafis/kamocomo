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
import type { ToukouEdge } from '../../lib/toukou';

export type GraphNodeKind = 'main' | 'sub' | 'addsub';

/** The minimal shape the layout needs -- id + kind. Cards (mains/subs) carry
 * their full data elsewhere; the synthetic `addsub` nodes are just the "+" the
 * user taps to add a sub to a main. */
export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
}

interface SimNode extends SimulationNodeDatum {
  id: string;
  kind: GraphNodeKind;
}

type SimLink = SimulationLinkDatum<SimNode>;

export interface NodePosition {
  x: number;
  y: number;
}

// Collision radii sized to each element's worst-case bounding *circle* (half
// its diagonal): main cards ~128x190, sub cards ~96x134, and the small "+"
// add-sub button. Covering the full circle (not just the width) stops cards
// sliding vertically into each other.
const MAIN_RADIUS = 116;
const SUB_RADIUS = 84;
const ADD_RADIUS = 26;

function radiusOf(kind: GraphNodeKind): number {
  return kind === 'main' ? MAIN_RADIUS : kind === 'sub' ? SUB_RADIUS : ADD_RADIUS;
}

/**
 * Runs a d3-force simulation over a place's board -- MULTIPLE mains (each
 * repelling the others so their clusters spread out), every main's subs
 * orbiting it via the link force, and a small "+" add-sub node tucked beside
 * each main. Collision radii (sized to each element's full bounding circle,
 * multiple solver iterations) keep everything clear of everything else, and
 * the whole thing is pre-warmed synchronously so it opens already settled.
 * Positions of nodes that persist across a refetch are preserved so realtime
 * updates don't reshuffle the board.
 */
export function useForceGraph(nodes: GraphNode[], edges: ToukouEdge[]) {
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
        // Mains scatter around the center (pre-warm separates them); subs and
        // add-buttons start near their main so they settle into its orbit.
        const spread = node.kind === 'main' ? 160 : 60;
        store.set(node.id, {
          id: node.id,
          kind: node.kind,
          x: (parent?.x ?? 0) + (Math.random() - 0.5) * spread,
          y: (parent?.y ?? 0) + (Math.random() - 0.5) * spread,
        });
      }
    }

    const simNodes = [...store.values()];
    const simLinks: SimLink[] = edges.map((e) => ({ source: e.source, target: e.target }));

    const simulation = forceSimulation(simNodes)
      .force(
        'charge',
        forceManyBody<SimNode>().strength((d) =>
          d.kind === 'main' ? -520 : d.kind === 'sub' ? -140 : -60,
        ),
      )
      .force(
        'link',
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          // The "+" sits close to its main; subs orbit a bit further out.
          .distance((l) =>
            (l.source as SimNode).kind === 'addsub'
              ? MAIN_RADIUS + ADD_RADIUS + 8
              : MAIN_RADIUS + SUB_RADIUS + 30,
          )
          .strength(0.75),
      )
      .force('center', forceCenter(0, 0))
      .force(
        'collide',
        forceCollide<SimNode>()
          .radius((d) => radiusOf(d.kind))
          .strength(1)
          .iterations(3),
      );

    // Pre-warm synchronously: a dense board (several mains + their subs) takes
    // seconds of real-time ticking to fully separate, which otherwise shows as
    // cards visibly jostling apart right after opening the page. Running the
    // solver to convergence *before* wiring up the tick listener means the
    // first (async, next-frame) tick already reports settled positions; the
    // animated loop then only handles small ongoing changes (a drag, a
    // realtime insert). setPositions is only called from that async callback,
    // never synchronously here, to avoid a synchronous setState-in-effect.
    simulation.stop();
    for (let i = 0; i < 200; i++) simulation.tick();

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
