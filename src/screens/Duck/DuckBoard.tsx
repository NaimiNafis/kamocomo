import { useTranslation } from 'react-i18next';
import { duckSilhouetteDataUri } from '../../lib/ducks';
import { examplePhoto } from '../../lib/photos';
import type { DuckGraph as DuckGraphData, DuckNode } from '../../lib/duck';
import { useForceGraph, type GraphNode } from '../ToukouMap/useForceGraph';
import { useGraphViewport } from '../ToukouMap/useGraphViewport';
import { driftStyle } from '../ToukouMap/drift';
import { RecenterIcon } from '../../components/icons';

const EDGE_OFFSET = 4000;

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
 * A main is **your stamp slot**, not a duck icon — your photo of that duck, or
 * the dotted ring and `+` the collection sheet shows when you haven't found it.
 * The board and the sheet then say the same thing the same way, and tapping a
 * ring here is another way to go and find one.
 *
 * That's also why there's no separate "+" node beside each duck the way the
 * toukou board has one: `collectDuckByPhoto` posts and collects in a single
 * action, so a second control would do the identical thing. One `+` per duck.
 */
export function DuckBoard({ graph, busy, onCapture, onOpen, openId }: DuckBoardProps) {
  const { t, i18n } = useTranslation();
  const isJa = i18n.language.startsWith('ja');

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const layoutNodes: GraphNode[] = graph.nodes.map((n) => ({ id: n.id, kind: n.kind }));

  const { positions, startDrag, drag, endDrag } = useForceGraph(layoutNodes, graph.edges);
  const { viewportRef, cx, cy, view, resetView, atFitView, pressedId, containerHandlers } =
    useGraphViewport(positions, { startDrag, drag, endDrag }, { onLongPress: onOpen });

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
            {graph.edges.map((edge) => {
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
            const node = nodeById.get(ln.id);
            if (!node) return null;
            const pos = positionOf(ln.id);
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
                    <DuckStamp
                      node={node}
                      name={isJa ? node.nameJa : node.nameEn}
                      pressed={pressedId === ln.id || openId === ln.id}
                      busy={busy}
                      onCapture={() => onCapture(node.id)}
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

      {!atFitView && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4">
          <button
            type="button"
            onClick={resetView}
            className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-kamo-ink/15 bg-kamo-stone/90 py-2.5 pl-3 pr-4 font-ui text-sm font-medium text-kamo-ink shadow-lg backdrop-blur"
            style={{ animation: 'fadeIn 220ms ease-out' }}
          >
            <RecenterIcon size={16} />
            {t('toukou.recenter')}
          </button>
        </div>
      )}
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

/** A duck: your photo of it, or the empty slot inviting one. */
function DuckStamp({
  node,
  name,
  pressed,
  busy,
  onCapture,
}: {
  node: DuckNode;
  name: string;
  pressed: boolean;
  busy: boolean;
  onCapture: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center gap-2" style={pressStyle(pressed)}>
      <span className="relative block" style={{ width: DUCK_SIZE, height: DUCK_SIZE }}>
        <span
          className="flex h-full w-full items-center justify-center overflow-hidden rounded-full shadow-lg"
          style={{
            border: node.photoUrl ? `4px solid ${node.color}` : `4px dotted ${node.color}90`,
            backgroundColor: node.photoUrl ? undefined : `${node.color}1A`,
          }}
        >
          {node.photoUrl ? (
            <img
              src={node.photoUrl}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <>
              <img
                src={duckSilhouetteDataUri(node.number - 1, 96)}
                alt=""
                className="absolute h-1/2 w-1/2 opacity-25"
                draggable={false}
              />
              {/* A button, so a plain tap captures without waiting out a hold. */}
              <button
                type="button"
                onClick={onCapture}
                disabled={busy}
                aria-label={`${t('collection.addTo')} ${name}`}
                className="relative font-ui text-4xl font-light leading-none disabled:opacity-50"
                style={{ color: node.color }}
              >
                +
              </button>
            </>
          )}
        </span>
        {node.earned && (
          <span
            className="absolute -right-1 top-2 rotate-[-12deg] rounded border-2 px-1.5 py-0.5 font-ui text-[9px] font-bold"
            style={{
              color: '#B5705E',
              borderColor: '#B5705E',
              backgroundColor: 'rgba(233,228,216,0.9)',
            }}
          >
            {t('collection.collected')}
          </span>
        )}
      </span>
      <span
        className="max-w-[11rem] text-balance rounded-full bg-kamo-stone/85 px-2 py-0.5 text-center font-display text-sm leading-tight text-kamo-ink shadow-sm backdrop-blur"
        style={{ pointerEvents: 'none' }}
      >
        {name}
      </span>
    </div>
  );
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
