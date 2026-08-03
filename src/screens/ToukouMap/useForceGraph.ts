import { useEffect, useRef, useState } from 'react';
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type ForceX,
  type ForceY,
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
  /** Home. Everything is sprung to this point and returns to it. */
  ax: number;
  ay: number;
}

type SimLink = SimulationLinkDatum<SimNode>;

export interface NodePosition {
  x: number;
  y: number;
}

// Collision radii. Cards are square now and mains are circles, so this is just
// half the card plus breathing room -- no half-diagonal needed, which is why
// these are smaller than the old rectangular values despite the cards being
// bigger. The "add" node is sub-sized, so it lays out as one more slot in the
// orbit. Kept in step with MAIN_SIZE / SUB_SIZE in NodeCard.
const MAIN_RADIUS = 176 / 2 + 16;
const SUB_RADIUS = 112 / 2 + 14;

function radiusOf(kind: GraphNodeKind): number {
  return kind === 'main' ? MAIN_RADIUS : SUB_RADIUS;
}

/** How hard a MAIN is pulled home. High enough that a shove from a neighbour is
 * a nudge rather than a migration, low enough that cards still visibly give way
 * to each other. Subs get none of this -- see below. */
const ANCHOR_STRENGTH = 0.22;
/** Softer than a hard shove, so neighbours ease aside instead of scattering. */
const COLLIDE_STRENGTH = 0.7;
/** The tether from a sub to its main. Loose: the lag is the point. */
const ORBIT_STRENGTH = 0.4;
/** Just enough mutual dislike among subs to keep an orbit from bunching up on
 * one side. Mains get none -- charge between mains is what used to send them
 * fleeing across the board. */
const SUB_CHARGE = -60;

/**
 * Lays a place's board out, then holds every card on a spring to where it
 * landed.
 *
 * The layout itself is solved once, the usual way -- mains repelling each other
 * so their clusters spread out, subs held in orbit, a "+" tucked in beside each
 * main. Where each card comes to rest becomes its **anchor**, and the live
 * simulation that follows has only two jobs: pull everything home, and keep
 * cards from sitting on top of each other.
 *
 * That combination is the feel we want. A free simulation was too eager -- drag
 * one main and every other cluster fled across the board, so the arrangement
 * you had just learned was gone. Pinning everything outright fixed that and
 * killed the board instead: cards that never react feel like a screenshot.
 * Anchors give both. Push a cluster into its neighbours and they ease aside a
 * little, then drift back to exactly where they were.
 *
 * Only **mains** are anchored. Subs and the "+" hang off their main on a loose
 * spring instead, which is what makes a cluster behave like cloth: pull the
 * main and its subs trail after it, swing past, and gather back around it when
 * you stop. Anchoring them too would have made a dragged cluster stretch and
 * snap back to where it started.
 *
 * One more thing follows from anchoring: positions survive refetches, and a
 * node that already has a spot is pinned while the solver runs, so a new post
 * from realtime settles into the gaps instead of rearranging everyone.
 */
export function useForceGraph(nodes: GraphNode[], edges: ToukouEdge[]) {
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  /** d3 caches each node's target when a positioning force is initialised, so
   * moving an anchor means handing the accessor back to make it re-read. Kept
   * here for exactly that. */
  const anchorRef = useRef<{ x: ForceX<SimNode>; y: ForceY<SimNode> } | null>(null);
  const storeRef = useRef<Map<string, SimNode>>(new Map());
  const [positions, setPositions] = useState<Map<string, NodePosition>>(new Map());
  /** The node currently under the finger. Only ever one -- its subs follow of
   * their own accord, via the springs. */
  const dragRef = useRef<string | null>(null);

  // Reconcile the layout only when the *set* of nodes/edges changes, not on
  // every count/vote refetch that returns the same topology.
  const nodeKey = nodes
    .map((n) => n.id)
    .sort()
    .join(',');
  const edgeKey = edges
    .map((e) => `${e.source}->${e.target}`)
    .sort()
    .join(',');

  function snapshot(): Map<string, NodePosition> {
    const next = new Map<string, NodePosition>();
    for (const n of storeRef.current.values()) next.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
    return next;
  }

  useEffect(() => {
    const store = storeRef.current;
    const parentOf = new Map(edges.map((e) => [e.source, e.target]));

    // Everything already on the board keeps exactly where it is; only genuinely
    // new nodes are free to find a spot.
    const placed = new Set(store.keys());

    const nextIds = new Set(nodes.map((n) => n.id));
    for (const id of [...store.keys()]) {
      if (!nextIds.has(id)) store.delete(id);
    }
    for (const node of nodes) {
      if (!store.has(node.id)) {
        const parentId = parentOf.get(node.id);
        const parent = parentId ? store.get(parentId) : undefined;
        // Mains scatter around the center; subs and add-buttons start near
        // their main so they settle into its orbit.
        const spread = node.kind === 'main' ? 160 : 60;
        const x = (parent?.x ?? 0) + (Math.random() - 0.5) * spread;
        const y = (parent?.y ?? 0) + (Math.random() - 0.5) * spread;
        store.set(node.id, { id: node.id, kind: node.kind, x, y, ax: x, ay: y });
      }
    }

    const simNodes = [...store.values()];
    const simLinks: SimLink[] = edges.map((e) => ({ source: e.source, target: e.target }));
    for (const n of simNodes) {
      if (!placed.has(n.id)) continue;
      n.fx = n.x;
      n.fy = n.y;
    }

    const simulation = forceSimulation(simNodes)
      .force(
        'charge',
        // The add card behaves like a sub (an empty extra slot in the orbit).
        forceManyBody<SimNode>().strength((d) => (d.kind === 'main' ? -520 : -140)),
      )
      .force(
        'link',
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance(MAIN_RADIUS + SUB_RADIUS + 30)
          .strength(0.75),
      )
      // Only meaningful on a first layout; with everything pinned it has
      // nothing to pull on, which is what keeps a refetch from recentring.
      .force('center', placed.size === 0 ? forceCenter(0, 0) : null)
      .force(
        'collide',
        forceCollide<SimNode>()
          .radius((d) => radiusOf(d.kind))
          .strength(1)
          .iterations(3),
      );

    // Solve the layout here, synchronously. Ticking it in real time would show
    // as cards visibly jostling apart just after the page opens.
    simulation.stop();
    for (let i = 0; i < 300; i++) simulation.tick();
    for (const n of simNodes) {
      n.fx = null;
      n.fy = null;
      n.ax = n.x ?? 0;
      n.ay = n.y ?? 0;
    }

    // Now swap the layout forces out for the resting ones. Spreading is done;
    // from here the board only has to hold its shape, keep clusters together,
    // and give a little when something is dragged through it.
    const anchorX = forceX<SimNode>((d) => d.ax).strength((d) =>
      d.kind === 'main' ? ANCHOR_STRENGTH : 0,
    );
    const anchorY = forceY<SimNode>((d) => d.ay).strength((d) =>
      d.kind === 'main' ? ANCHOR_STRENGTH : 0,
    );
    anchorRef.current = { x: anchorX, y: anchorY };

    simulation
      .force('center', null)
      .force('charge', forceManyBody<SimNode>().strength((d) => (d.kind === 'main' ? 0 : SUB_CHARGE)))
      .force(
        'link',
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance(MAIN_RADIUS + SUB_RADIUS + 30)
          .strength(ORBIT_STRENGTH),
      )
      .force('x', anchorX)
      .force('y', anchorY)
      .force(
        'collide',
        forceCollide<SimNode>()
          .radius((d) => radiusOf(d.kind))
          .strength(COLLIDE_STRENGTH)
          .iterations(2),
      )
      // A touch heavier than d3's default, so a cluster follows through and
      // settles rather than wobbling.
      .velocityDecay(0.45);

    // Settle into the resting forces here too. The layout pass used a stronger
    // charge and a stiffer link, so its equilibrium isn't quite this one, and
    // without this the difference would be paid off all at once as a shuffle
    // the first time anything woke the simulation.
    simulation.stop();
    simulation.alpha(0.6);
    for (let i = 0; i < 120; i++) simulation.tick();
    simulation.stop();

    simulation
      .on('tick', () => setPositions(snapshot()))
      // Idle at zero: everything is already where it wants to be, so the
      // simulation costs nothing until a drag wakes it.
      .alpha(0)
      .restart();
    simRef.current = simulation;

    // Published next frame rather than inline: a synchronous setState in an
    // effect body cascades a render.
    const raf = requestAnimationFrame(() => setPositions(snapshot()));
    return () => {
      cancelAnimationFrame(raf);
      simulation.stop();
      simRef.current = null;
      anchorRef.current = null;
    };
    // Reconcile on topology change only (positions preserved via the ref store).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeKey, edgeKey]);

  /** Pins the grabbed node to the finger and wakes the simulation, so
   * everything attached to it has something to react to. */
  function startDrag(id: string) {
    const node = storeRef.current.get(id);
    if (!node) return;
    dragRef.current = id;
    node.fx = node.x;
    node.fy = node.y;
    simRef.current?.alphaTarget(0.3).restart();
  }

  function drag(id: string, x: number, y: number) {
    // No live drag, or a move for a node that isn't the one being held (a
    // long-press releases mid-gesture) -- either way, nothing should move.
    if (dragRef.current !== id) return;
    const node = storeRef.current.get(id);
    if (!node) return;
    // Driven, not simulated: fx/fy is what stops the anchor spring fighting the
    // finger. Only this node -- the subs are pulled along by their springs a
    // beat later, which is the trailing-cloth feel.
    node.fx = x;
    node.fy = y;
  }

  /** Let go: a main keeps the spot you dropped it in, which is the difference
   * between moving a card and stretching it on an elastic. Everything it
   * disturbed on the way is still sprung to its own anchor, so that drifts
   * back; its own subs simply re-gather around wherever it now is. */
  function endDrag(id: string) {
    if (dragRef.current !== id) return;
    dragRef.current = null;
    const node = storeRef.current.get(id);
    if (node) {
      node.fx = null;
      node.fy = null;
      node.ax = node.x ?? 0;
      node.ay = node.y ?? 0;
      // d3 read every anchor when the force was initialised, so the new one is
      // invisible until the accessor is handed back.
      anchorRef.current?.x.x((d) => d.ax);
      anchorRef.current?.y.y((d) => d.ay);
    }
    // Cool down rather than stop dead, so the settle is a glide.
    simRef.current?.alphaTarget(0).alpha(0.3).restart();
  }

  return { positions, startDrag, drag, endDrag };
}
