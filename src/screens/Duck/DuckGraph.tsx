import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import placeholderPhoto from '../../../img/kamogawa/placeholder-riverbank.jpg?url';
import { duckIconDataUri } from '../../lib/ducks';
import type { DuckGraph as DuckGraphData, DuckNode } from '../../lib/duck';
import { useForceGraph, type GraphNode } from '../ToukouMap/useForceGraph';
import { useGraphViewport } from '../ToukouMap/useGraphViewport';
import { AddCard } from '../ToukouMap/AddCard';
import { RecenterIcon } from '../../components/icons';

const EDGE_OFFSET = 4000;
const ADD_PREFIX = 'add:';

/** Dark or light text depending on the background's luminance. */
function readableText(hex: string): string {
  const v = hex.replace('#', '');
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#1C1C1A' : '#E9E4D8';
}

interface DuckGraphProps {
  graph: DuckGraphData;
  uploading: boolean;
  onUpload: (duckSpotId: string, file: File) => void;
}

/**
 * The duck page's toukou-style graph (item 6): the 10 ducks as colored main
 * nodes, each with its shared photos orbiting as subs and a "+" node to add a
 * photo. Reuses the same force layout + pan/pinch viewport as the activity
 * board.
 */
export function DuckGraph({ graph, uploading, onUpload }: DuckGraphProps) {
  const { t, i18n } = useTranslation();
  const isJa = i18n.language.startsWith('ja');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingSpotRef = useRef<string | null>(null);

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const mains = graph.nodes.filter((n) => n.kind === 'main');
  const layoutNodes: GraphNode[] = [
    ...graph.nodes.map((n) => ({ id: n.id, kind: n.kind })),
    ...mains.map((m) => ({ id: `${ADD_PREFIX}${m.id}`, kind: 'addsub' as const })),
  ];
  const layoutEdges = [
    ...graph.edges,
    ...mains.map((m) => ({ source: `${ADD_PREFIX}${m.id}`, target: m.id })),
  ];

  const { positions, startDrag, drag, endDrag } = useForceGraph(layoutNodes, layoutEdges);
  const { viewportRef, cx, cy, view, resetView, containerHandlers } = useGraphViewport(positions, {
    startDrag,
    drag,
    endDrag,
  });

  const positionOf = (id: string) => positions.get(id) ?? { x: 0, y: 0 };

  function pickPhotoFor(duckSpotId: string) {
    pendingSpotRef.current = duckSpotId;
    fileInputRef.current?.click();
  }

  function handleFileChosen(file: File | undefined) {
    const spotId = pendingSpotRef.current;
    pendingSpotRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (file && spotId) onUpload(spotId, file);
  }

  return (
    <div ref={viewportRef} className="absolute inset-0 touch-none" {...containerHandlers}>
      <button
        type="button"
        onClick={resetView}
        aria-label={t('toukou.recenter')}
        className="absolute bottom-4 left-4 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-kamo-ink/15 bg-kamo-stone/90 text-kamo-ink shadow-lg backdrop-blur"
      >
        <RecenterIcon />
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFileChosen(e.target.files?.[0])}
      />
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          transform: `translate(${cx + view.tx}px, ${cy + view.ty}px) scale(${view.scale})`,
        }}
      >
        <svg
          className="pointer-events-none absolute overflow-visible"
          style={{ left: -EDGE_OFFSET, top: -EDGE_OFFSET, width: EDGE_OFFSET * 2, height: EDGE_OFFSET * 2 }}
        >
          {/* Every node -- photos and the add card -- gets a string to its duck. */}
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
          if (ln.kind === 'addsub') {
            const spotId = ln.id.slice(ADD_PREFIX.length);
            const main = nodeById.get(spotId);
            return (
              <div key={ln.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: pos.x, top: pos.y }}>
                <AddCard
                  color={main?.color ?? '#E0885E'}
                  label={t('duck.addPhoto')}
                  testId="duck-add"
                  disabled={uploading}
                  onClick={() => pickPhotoFor(spotId)}
                />
              </div>
            );
          }
          const node = nodeById.get(ln.id) as DuckNode;
          return (
            <div
              key={ln.id}
              data-testid="duck-node"
              data-node-id={ln.id}
              data-node-kind={node.kind}
              className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing"
              style={{ left: pos.x, top: pos.y }}
            >
              {node.kind === 'main' ? (
                <DuckMainCard node={node} name={isJa ? node.nameJa : node.nameEn} />
              ) : (
                <DuckPhotoCard node={node} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DuckMainCard({ node, name }: { node: DuckNode; name: string }) {
  const textColor = readableText(node.color);
  return (
    <div
      className="flex w-28 flex-col items-center gap-1 rounded-2xl px-2 py-2 shadow-lg"
      style={{ backgroundColor: node.color, color: textColor }}
    >
      <img src={duckIconDataUri(node.color)} alt="" className="h-12 w-12" draggable={false} />
      <span className="line-clamp-1 text-center font-display text-sm">{name}</span>
      {node.earned && <span className="font-ui text-[10px] opacity-80">✓</span>}
    </div>
  );
}

function DuckPhotoCard({ node }: { node: DuckNode }) {
  return (
    <div className="w-24 overflow-hidden rounded-2xl shadow-lg" style={{ backgroundColor: node.color }}>
      <img
        src={node.photoUrl ?? placeholderPhoto}
        alt=""
        className="block aspect-square w-full object-cover"
        draggable={false}
      />
    </div>
  );
}
