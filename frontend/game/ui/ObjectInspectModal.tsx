'use client';

import { useEffect, useState } from 'react';
import { EventBus } from '../EventBus';
import objectsData from '../../public/data/objects.json';
import officeObjectsRaw from '../../public/assets/world/office-objects.json';

// ── Types ────────────────────────────────────────────────────────────────────

interface WorldObject {
  label: string;
  zone: string;
  entityType: string;
  owner: string | null;
  description: string;
  position?: { x: number; y: number };
  state?: {
    sitPoints?: boolean[];
    inUse?: boolean;
    dirty?: boolean;
    open?: boolean;
  };
}

interface RawAction {
  id: string;
  name: string;
  emoji: string;
  durationMs?: number;
  needDeltas?: Record<string, number>;
}

interface RawEntity {
  id: number;
  name: string;
  entityType: string;
  actions?: RawAction[];
}

// ── Emoji key → Unicode ──────────────────────────────────────────────────────

const EMOJI_MAP: Record<string, string> = {
  // food & drink
  soda_can:        '🥫',  // snack (canned — distinct from cup)
  soda_cup:        '🥤',  // drink (cup with straw)
  sandwich:        '🥪',
  coffee:          '☕',
  water_bottle:    '💧',
  raindrop:        '💦',
  bread_loaf:      '🍞',
  // objects & tools
  phone:           '📞',
  computer:        '💻',
  folder:          '📁',
  pencil:          '📝',  // ✏️ can render as text glyph; 📝 is always emoji
  paper:           '📄',
  file_save:       '💾',
  newspaper:       '📰',
  calendar:        '📅',
  book:            '📖',
  mail:            '📧',
  shopping_bag:    '🛍️',
  megaphone:       '📣',
  // nature / activity
  sleeping:        '😴',
  neutral_face:    '😐',
  cat:             '🐱',
  paint_palette:   '🎨',
  internet:        '🌐',
  lightbulb:       '💡',
  magnify:         '🔍',
  eye:             '👀',  // 👁️ can render as text glyph
  star:            '⭐',
  rocket:          '🚀',
  talk:            '💬',
  fire:            '🔥',
  // bathroom / cleaning
  bath:            '🚿',
  toilet_paper:    '🧻',
  soap:            '🧼',
  trash:           '🗑️',
  // hazard / warning  (⚠️ renders as text in many contexts — use 🚧 instead)
  caution:         '🚧',
  skull_crossbones:'💀',  // ☠️ has similar rendering issues
};

const ENTITY_TYPE_EMOJI: Record<string, string> = {
  chair: '🪑', table: '📋', appliance: '⚡', storage: '📦',
};

function resolveEmoji(key: string): string {
  return EMOJI_MAP[key] ?? '✦';
}

function headerEmoji(entityType: string, actions: RawAction[]): string {
  if (actions.length > 0) return resolveEmoji(actions[0].emoji);
  return ENTITY_TYPE_EMOJI[entityType] ?? '✦';
}

// ── Need delta label helpers ────────────────────────────────────��────────────

const NEED_LABELS: Record<string, string> = {
  energy: 'energy', stress: 'stress', productivity: 'productivity',
  esteem: 'esteem', stimulation: 'stimulation', belonging: 'belonging',
  hunger: 'hunger', thirst: 'thirst', fulfillment: 'fulfillment',
  social: 'social',
};

function needSign(val: number): string {
  return val > 0 ? `+${val}` : `${val}`;
}

// ── Static data ──────────────────────────────────────────────────────────────

const CHARACTER_LABELS: Record<string, string> = {
  jim: 'Jim', dwight: 'Dwight', michael: 'Michael', pam: 'Pam',
  toby: 'Toby', ryan: 'Ryan', kelly: 'Kelly', oscar: 'Oscar',
  angela: 'Angela', stanley: 'Stanley', kevin: 'Kevin',
  phyllis: 'Phyllis', creed: 'Creed', meredith: 'Meredith',
};

const CHARACTER_COLORS: Record<string, string> = {
  jim: '#60a5fa', dwight: '#facc15', michael: '#f97316', pam: '#f9a8d4',
  toby: '#94a3b8', ryan: '#a78bfa', kelly: '#fb7185', oscar: '#34d399',
  angela: '#c084fc', stanley: '#fb923c', kevin: '#6ee7b7',
  phyllis: '#f472b6', creed: '#a3e635', meredith: '#fcd34d',
};

const ZONE_LABELS: Record<string, string> = {
  'lobby': 'Lobby', 'far lobby': 'Far Lobby',
  'entrance hallway': 'Entrance Hallway', 'reception': 'Reception',
  "michael's office": "Michael's Office", 'accounting': 'Accounting',
  'sales': 'Sales', 'annex': 'Annex', 'conference_room': 'Conference Room',
  'kitchen': 'Kitchen', 'break room': 'Break Room',
  "men's bathroom": "Men's Bathroom", "women's bathroom": "Women's Bathroom",
  'closet': 'Closet', 'parking lot ': 'Parking Lot',
};

const TYPE_LABELS: Record<string, string> = {
  appliance: 'Appliance', table: 'Desk / Table', chair: 'Seating', storage: 'Storage',
};

// ── Build entity lookup by name ──────────────────────────────────────────────

const entitiesByName: Record<string, RawEntity> = {};
for (const entity of Object.values(
  (officeObjectsRaw as { entitiesById: Record<string, RawEntity> }).entitiesById
)) {
  entitiesByName[entity.name] = entity;
}

const allObjects = objectsData.objects as Record<string, WorldObject>;

// ── Sub-components ───────────────────────────────────────────────────────────

function StateRows({ state }: { state: NonNullable<WorldObject['state']> }) {
  const rows: { label: string; value: string; active: boolean }[] = [];

  if (state.sitPoints !== undefined) {
    if (state.sitPoints.length === 1) {
      rows.push({ label: 'seat', value: state.sitPoints[0] ? 'occupied' : 'free', active: state.sitPoints[0] });
    } else {
      state.sitPoints.forEach((occupied, i) => {
        rows.push({ label: `seat ${i + 1}`, value: occupied ? 'occupied' : 'free', active: occupied });
      });
    }
  }
  if (state.inUse !== undefined)
    rows.push({ label: 'status', value: state.inUse ? 'in use' : 'free', active: state.inUse });
  if (state.dirty !== undefined)
    rows.push({ label: 'cleanliness', value: state.dirty ? 'dirty' : 'clean', active: state.dirty });
  if (state.open !== undefined)
    rows.push({ label: 'door', value: state.open ? 'open' : 'closed', active: false });

  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[10px] font-medium tracking-widest uppercase" style={{ color: '#334155' }}>State</p>
      <div className="flex flex-wrap gap-1.5">
        {rows.map(({ label, value, active }, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px]"
            style={{
              backgroundColor: active ? '#ef444415' : '#0f172a',
              color: active ? '#f87171' : '#475569',
              border: `1px solid ${active ? '#ef444430' : '#1e293b'}`,
            }}
          >
            <span style={{ color: '#334155' }}>{label}</span>
            <span>{value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function ActionsList({ actions }: { actions: RawAction[] }) {
  if (actions.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[10px] font-medium tracking-widest uppercase" style={{ color: '#334155' }}>
        Advertised actions
      </p>
      <div className="flex flex-col gap-1">
        {actions.map((action) => (
          <div
            key={action.id}
            className="flex items-start gap-2.5 px-2.5 py-2 rounded"
            style={{ backgroundColor: '#0a1628', border: '1px solid #1e293b' }}
          >
            <span className="text-base leading-none mt-0.5 shrink-0">{resolveEmoji(action.emoji)}</span>
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <span className="text-[11px] text-slate-300">{action.name}</span>
              {action.needDeltas && Object.keys(action.needDeltas).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {Object.entries(action.needDeltas).map(([need, val]) => (
                    <span
                      key={need}
                      className="text-[10px] px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: val > 0 ? '#16a34a18' : '#dc262618',
                        color: val > 0 ? '#4ade80' : '#f87171',
                        border: `1px solid ${val > 0 ? '#16a34a30' : '#dc262630'}`,
                      }}
                    >
                      {NEED_LABELS[need] ?? need} {needSign(val)}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {action.durationMs && (
              <span className="text-[10px] shrink-0 tabular-nums" style={{ color: '#334155' }}>
                {(action.durationMs / 1000).toFixed(0)}s
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main modal ───────────────────────────────────────────────────────────────

export default function ObjectInspectModal() {
  const [objectKey, setObjectKey] = useState<string | null>(null);

  useEffect(() => {
    const handler = (key: string) => setObjectKey(key);
    const closeOnCharacter = () => setObjectKey(null);
    EventBus.on('object-inspect', handler);
    EventBus.on('character-inspect', closeOnCharacter);
    return () => {
      EventBus.off('object-inspect', handler);
      EventBus.off('character-inspect', closeOnCharacter);
    };
  }, []);

  if (!objectKey) return null;

  const obj = allObjects[objectKey];
  const rawEntity = entitiesByName[objectKey];
  const actions: RawAction[] = rawEntity?.actions ?? [];
  const close = () => setObjectKey(null);

  const emoji = obj ? headerEmoji(obj.entityType, actions) : '✦';

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      onClick={close}
    >
      <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }} />

      <div
        className="relative z-10 w-full max-w-lg mx-4 rounded-xl shadow-2xl"
        style={{ backgroundColor: 'rgba(6,13,24,0.97)', border: '1px solid #1e293b' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between gap-3 px-5 pt-5 pb-4"
          style={{ borderBottom: '1px solid #0f172a' }}
        >
          <div className="flex items-start gap-3 min-w-0">
            <span className="text-2xl leading-none mt-0.5 shrink-0">{emoji}</span>
            <div className="flex flex-col gap-1.5 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-semibold leading-tight" style={{ color: '#e2e8f0' }}>
                  {obj ? obj.label : objectKey.replace(/_/g, ' ')}
                </h2>
                {obj && (
                  <span
                    className="text-[10px] font-medium tracking-widest uppercase px-1.5 py-0.5 rounded"
                    style={{ color: '#334155', border: '1px solid #1e293b' }}
                  >
                    {TYPE_LABELS[obj.entityType] ?? obj.entityType}
                  </span>
                )}
                {obj?.owner && (() => {
                  const color = CHARACTER_COLORS[obj.owner] ?? '#9B9B9B';
                  return (
                    <span
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0"
                      style={{ color, backgroundColor: `${color}18` }}
                    >
                      {CHARACTER_LABELS[obj.owner] ?? obj.owner}
                    </span>
                  );
                })()}
              </div>
              {obj && (
                <span className="text-[10px]" style={{ color: '#334155' }}>
                  {ZONE_LABELS[obj.zone] ?? obj.zone}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={close}
            className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-xs transition-colors"
            style={{ color: '#334155' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#e2e8f0')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#334155')}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 flex flex-col gap-4">
          {!obj ? (
            <p className="text-xs" style={{ color: '#334155' }}>No data for &ldquo;{objectKey}&rdquo;.</p>
          ) : (
            <>
              {obj.description && (
                <p className="text-[12px] leading-relaxed" style={{ color: '#64748b' }}>
                  {obj.description}
                </p>
              )}
              {obj.state && <StateRows state={obj.state} />}
              <ActionsList actions={actions} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
