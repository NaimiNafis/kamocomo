import { useTranslation } from 'react-i18next';
import { duckIconDataUri, duckSilhouetteDataUri } from '../../lib/ducks';
import { examplePhoto } from '../../lib/photos';
import type { DuckGraph as DuckGraphData, DuckNode } from '../../lib/duck';
import { useForceGraph, type GraphNode } from '../ToukouMap/useForceGraph';
import { useGraphViewport } from '../ToukouMap/useGraphViewport';
import { driftStyle } from '../ToukouMap/drift';
import { RecenterIcon } from '../../components/icons';
import { OffscreenMains } from '../ToukouMap/OffscreenMains';

const EDGE_OFFSET = 4000;
/** Synthetic node: the empty slot where your photo of a duck would go. */
const MINE_PREFIX = 'mine:';

/** Kept in step with MAIN_SIZE / SUB_SIZE in NodeCard -- useForceGraph's
 * collision radii are sized to those, so cards any smaller lay out with holes
 * in the middle of every cluster. */
const DUCK_SIZE = 176;
const PHOTO_SIZE = 112;

interface DuckBoardProps {
  graph: DuckGraphData;
  busy: boolean;
  onCapture: (duckSpotId: string) => void;
  onOpen: (nodeId: string) => void;
  openId: string | null;
}

/**
 * The duck board: each duck as a main node with everyone's photos of it
 * orbiting, on the same force layout and gestures as the toukou web.
 *
 * A main is the duck itself: a round node with its mark and its name, the fixed
 * thing everything else hangs off.
 *
 * **Your own photo is a sub**, like everyone else's, because that's what it is
 * — one photo among the ones people have shared. It's ringed so you can pick it
 * out of the orbit, and it's always present: before you've taken one, its place
 * is held by a dotted slot with a `+`, so every duck shows you whether you've
 * been there without having to count photos.
 */
export function DuckBoard({ graph, busy, onCapture, onOpen, openId }: DuckBoardProps) {
  const { t, i18n } = useTranslation();
  const isJa = i18n.language.startsWith('ja');

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const mains = graph.nodes.filter((n) => n.kind === 'main');
  // Ducks you have no photo of get an empty slot in the orbit, so the answer to
  // "have I been to this one" is in the same place on every duck.
  const emptySlots = mains.filter((m) => m.photoUrl === null);

  const layoutNodes: GraphNode[] = [
    ...graph.nodes.map((n) => ({ id: n.id, kind: n.kind })),
    ...emptySlots.map((m) => ({ id: `${MINE_PREFIX}${m.id}`, kind: 'sub' as const })),
  ];
  const layoutEdges = [
    ...graph.edges,
    ...emptySlots.map((m) => ({ source: `${MINE_PREFIX}${m.id}`, target: m.id })),
  ];

  const { positions, startDrag, drag, endDrag } = useForceGraph(layoutNodes, layoutEdges);
  const {
    viewportRef,
    size,
    cx,
    cy,
    view,
    resetView,
    atFitView,
    focusOn,
    pressedId,
    containerHandlers,
  } = useGraphViewport(
    positions,
    { startDrag, drag, endDrag },
    {
      // Where the opening glide lands. The ducks run north to south, so the
      // first is the Delta -- the top of the river and where the rally starts.
      // Without this the glide closed in on the middle of the layout, which is
      // empty space between clusters.
      focusId: mains[0]?.id,
      // An empty slot has no post behind it, so holding one has nothing to show.
      onLongPress: (id) => !id.startsWith(MINE_PREFIX) && onOpen(id),
    },
  );

  const positionOf = (id: string) => positions.get(id) ?? { x: 0, y: 0 };

  return (
    <>
      <div ref={viewportRef} className="absolute inset-0 touch-none" {...containerHandlers}>
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{ transform: `translate(${cx + view.tx}px, ${cy + view.ty}px) scale(${view.scale})` }}
        >
          <svg
            className="pointer-events-none absolute overflow-visible"
            style={{
              left: -EDGE_OFFSET,
              top: -EDGE_OFFSET,
              width: EDGE_OFFSET * 2,
              height: EDGE_OFFSET * 2,
            }}
          >
            {/* Every photo gets a string to its duck. */}
            {layoutEdges.map((edge) => {
              const s = positionOf(edge.source);
              const tp = positionOf(edge.target);
              return (
                <line
                  key={`${edge.source}-${edge.target}`}
                  x1={s.x + EDGE_OFFSET}
                  y1={s.y + EDGE_OFFSET}
                  x2={tp.x + EDGE_OFFSET}
                  y2={tp.y + EDGE_OFFSET}
                  stroke="#6E8CA0"
                  strokeWidth={1.5}
                  strokeOpacity={0.5}
                />
              );
            })}
          </svg>

          {layoutNodes.map((ln) => {
            const pos = positionOf(ln.id);

            if (ln.id.startsWith(MINE_PREFIX)) {
              const duck = nodeById.get(ln.id.slice(MINE_PREFIX.length));
              if (!duck) return null;
              return (
                <div
                  key={ln.id}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: pos.x, top: pos.y }}
                >
                  <div className="kamo-drift" style={driftStyle(ln.id)}>
                    <EmptySlot
                      node={duck}
                      name={isJa ? duck.nameJa : duck.nameEn}
                      busy={busy}
                      onCapture={() => onCapture(duck.id)}
                    />
                  </div>
                </div>
              );
            }

            const node = nodeById.get(ln.id);
            if (!node) return null;
            return (
              <div
                key={ln.id}
                data-testid="duck-node"
                data-node-id={ln.id}
                data-node-kind={node.kind}
                className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing"
                style={{ left: pos.x, top: pos.y }}
              >
                <div className="kamo-drift" style={driftStyle(ln.id)}>
                  {node.kind === 'main' ? (
                    <DuckCircle
                      node={node}
                      name={isJa ? node.nameJa : node.nameEn}
                      pressed={pressedId === ln.id || openId === ln.id}
                    />
                  ) : (
                    <PhotoCard node={node} pressed={pressedId === ln.id || openId === ln.id} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Ducks off the edge, as tappable markers on the frame. */}
      {openId === null && (
        <div className="pointer-events-none absolute inset-0">
          {/* photoUrl nulled on purpose: a main renders as the duck's mark on
              the board, so its edge marker should be that mark rather than your
              photo of it. */}
          <OffscreenMains
            mains={mains.map((m) => ({ id: m.id, color: m.color, photoUrl: null }))}
            positions={positions}
            view={view}
            size={size}
            onSelect={focusOn}
            imageFor={(node) => duckIconDataUri(node.color)}
          />
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-4">
        {/* Press-and-hold has no affordance of its own, so the board says so
            once, quietly -- the same line the toukou board carries. */}
        {openId === null && (
          <p className="font-ui text-[11px] text-kamo-ink/45">{t('toukou.holdHint')}</p>
        )}
        {!atFitView && (
          <button
            type="button"
            onClick={resetView}
            className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-kamo-ink/15 bg-kamo-stone/90 py-2.5 pl-3 pr-4 font-ui text-sm font-medium text-kamo-ink shadow-lg backdrop-blur"
            style={{ animation: 'fadeIn 220ms ease-out' }}
          >
            <RecenterIcon size={16} />
            {t('toukou.recenter')}
          </button>
        )}
      </div>
    </>
  );
}

/** The press-and-hold feel, shared by both node kinds: sink under the finger,
 * spring back past your own size on release. Matches NodeCard. */
function pressStyle(pressed: boolean): React.CSSProperties {
  return {
    transform: pressed ? 'scale(0.93)' : 'scale(1)',
    transition: pressed
      ? 'transform 320ms cubic-bezier(0.25, 0.8, 0.4, 1)'
      : 'transform 420ms cubic-bezier(0.34, 1.7, 0.5, 1)',
  };
}

/** A duck: the fixed thing its photos hang off. Its mark and its name, inside
 * the circle so the node is one object rather than a disc with a caption. */
function DuckCircle({
  node,
  name,
  pressed,
}: {
  node: DuckNode;
  name: string;
  pressed: boolean;
}) {
  return (
    <div
      className="flex items-center justify-center rounded-full shadow-lg"
      style={{
        width: DUCK_SIZE,
        height: DUCK_SIZE,
        backgroundColor: node.color,
        color: readableText(node.color),
        ...pressStyle(pressed),
      }}
    >
      <div className="flex flex-col items-center gap-1 px-4">
        <img src={duckIconDataUri(node.color)} alt="" className="h-11 w-11" draggable={false} />
        <span className="text-balance text-center font-display text-sm leading-tight">{name}</span>
      </div>
    </div>
  );
}

/** Where your photo of a duck would go, before you've taken one. Dotted, so it
 * reads as a gap rather than a card, and the same dotted ring the collection
 * sheet uses for a slot you haven't filled. */
function EmptySlot({
  node,
  name,
  busy,
  onCapture,
}: {
  node: DuckNode;
  name: string;
  busy: boolean;
  onCapture: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onCapture}
      disabled={busy}
      aria-label={`${t('collection.addTo')} ${name}`}
      className="relative flex items-center justify-center rounded-full transition-transform duration-150 active:scale-90 disabled:opacity-50"
      style={{
        width: PHOTO_SIZE,
        height: PHOTO_SIZE,
        border: `3px dotted ${node.color}A0`,
        // Opaque: a translucent fill let the string to its duck show through the
        // middle of the slot, which read as a crack rather than a gap.
        backgroundColor: '#EDE9DF',
      }}
    >
      <img
        src={duckSilhouetteDataUri(node.number - 1, 96)}
        alt=""
        className="absolute h-1/2 w-1/2 opacity-25"
        draggable={false}
      />
      <span
        className="relative font-ui text-3xl font-light leading-none"
        style={{ color: node.color }}
      >
        +
      </span>
    </button>
  );
}

/** Dark or light text depending on the background's luminance. */
function readableText(hex: string): string {
  const v = hex.replace('#', '');
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#1C1C1A' : '#E9E4D8';
}

/** Someone's photo of a duck. Square like a toukou sub, so the two boards read
 * as the same kind of thing. */
function PhotoCard({ node, pressed }: { node: DuckNode; pressed: boolean }) {
  return (
    <div
      className="overflow-hidden rounded-2xl shadow-lg"
      style={{
        width: PHOTO_SIZE,
        height: PHOTO_SIZE,
        backgroundColor: node.color,
        // Yours is ringed in its duck's own colour, so it's findable in the
        // orbit without being louder than the photo it frames.
        border: node.mine ? `4px solid ${node.color}` : undefined,
        boxShadow: node.mine ? `0 0 0 3px rgba(233,228,216,0.9)` : undefined,
        ...pressStyle(pressed),
      }}
    >
      <img
        src={node.photoUrl ?? examplePhoto(node.id)}
        alt=""
        className="block h-full w-full object-cover"
        draggable={false}
      />
    </div>
  );
}
