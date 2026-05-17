'use client';

import { useEffect, useState } from 'react';
import { EventBus } from '../EventBus';
import personalitiesRaw from '../../public/data/personalities.json';

// ── Types ────────────────────────────────────────────────────────────────────

interface PAD { p: number; a: number; d: number }
interface Needs {
  energy: number; stress: number; hunger: number; thirst: number;
  social: number; esteem: number; stimulation: number; productivity: number;
}
interface CharacterState { currently: string; pad: PAD; needs: Needs }
interface Personality { mbti: string; o: number; c: number; e: number; a: number; n: number }

// ── Sprite portrait lookup ───────────────────────────────────────────────────
// ── Static character data ────────────────────────────────────────────────────

const CHARACTER_DISPLAY: Record<string, { name: string; role: string; color: string }> = {
  michael:  { name: 'Michael Scott',   role: 'Regional Manager',           color: '#f97316' },
  dwight:   { name: 'Dwight Schrute',  role: 'Assistant (to the) Regional Manager', color: '#facc15' },
  jim:      { name: 'Jim Halpert',     role: 'Sales Representative',       color: '#60a5fa' },
  pam:      { name: 'Pam Beesly',      role: 'Receptionist',               color: '#f9a8d4' },
  ryan:     { name: 'Ryan Howard',     role: 'Temp',                       color: '#a78bfa' },
  kelly:    { name: 'Kelly Kapoor',    role: 'Customer Service',            color: '#fb7185' },
  angela:   { name: 'Angela Martin',  role: 'Head of Accounting',         color: '#c084fc' },
  oscar:    { name: 'Oscar Martinez',  role: 'Accountant',                 color: '#34d399' },
  kevin:    { name: 'Kevin Malone',    role: 'Accountant',                 color: '#6ee7b7' },
  stanley:  { name: 'Stanley Hudson',  role: 'Sales Representative',       color: '#fb923c' },
  phyllis:  { name: 'Phyllis Lapin',   role: 'Sales Representative',       color: '#f472b6' },
  meredith: { name: 'Meredith Palmer', role: 'Supplier Relations',         color: '#fcd34d' },
  creed:    { name: 'Creed Bratton',   role: 'Quality Assurance',          color: '#a3e635' },
  toby:     { name: 'Toby Flenderson', role: 'HR Representative',          color: '#94a3b8' },
};

// Dummy state — will be replaced by per-step data from replay.json
const DUMMY_STATE: Record<string, CharacterState> = {
  michael:  {
    currently: 'Rehearsing a motivational speech in his office mirror.',
    pad: { p: 0.68, a: 0.78, d: 0.50 },
    needs: { energy: 74, stress: 52, hunger: 61, thirst: 68, social: 28, esteem: 38, stimulation: 71, productivity: 14 },
  },
  dwight:   {
    currently: 'Conducting a threat assessment of the parking lot.',
    pad: { p: 0.32, a: 0.64, d: 0.82 },
    needs: { energy: 92, stress: 28, hunger: 45, thirst: 55, social: 60, esteem: 72, stimulation: 58, productivity: 85 },
  },
  jim:      {
    currently: 'Staring at the back of Dwight\'s head, waiting for something to happen.',
    pad: { p: 0.42, a: -0.10, d: 0.30 },
    needs: { energy: 68, stress: 22, hunger: 58, thirst: 72, social: 44, esteem: 50, stimulation: 35, productivity: 30 },
  },
  pam:      {
    currently: 'Answering the phones and doodling in the margins of the sign-in sheet.',
    pad: { p: 0.36, a: 0.12, d: 0.22 },
    needs: { energy: 65, stress: 30, hunger: 55, thirst: 60, social: 52, esteem: 44, stimulation: 40, productivity: 55 },
  },
  ryan:     {
    currently: 'Pretending to look busy while figuring out where the printer paper goes.',
    pad: { p: -0.08, a: 0.42, d: 0.12 },
    needs: { energy: 70, stress: 62, hunger: 50, thirst: 65, social: 35, esteem: 28, stimulation: 48, productivity: 22 },
  },
  kelly:    {
    currently: 'Recapping last night\'s episode of The OC to no one in particular.',
    pad: { p: 0.62, a: 0.88, d: 0.26 },
    needs: { energy: 80, stress: 35, hunger: 48, thirst: 75, social: 18, esteem: 60, stimulation: 22, productivity: 10 },
  },
  angela:   {
    currently: 'Auditing Kevin\'s spreadsheet for the third time this week.',
    pad: { p: -0.14, a: 0.22, d: 0.58 },
    needs: { energy: 78, stress: 48, hunger: 40, thirst: 50, social: 70, esteem: 66, stimulation: 52, productivity: 74 },
  },
  oscar:    {
    currently: 'Reading a long-form piece in The Atlantic before the day begins in earnest.',
    pad: { p: 0.30, a: 0.06, d: 0.36 },
    needs: { energy: 72, stress: 18, hunger: 52, thirst: 62, social: 48, esteem: 58, stimulation: 30, productivity: 60 },
  },
  kevin:    {
    currently: 'Counting something. It is unclear what.',
    pad: { p: 0.56, a: -0.18, d: 0.12 },
    needs: { energy: 55, stress: 14, hunger: 72, thirst: 68, social: 55, esteem: 42, stimulation: 45, productivity: 18 },
  },
  stanley:  {
    currently: 'Doing the crossword. Actively ignoring everything else.',
    pad: { p: -0.28, a: -0.42, d: 0.22 },
    needs: { energy: 48, stress: 58, hunger: 65, thirst: 55, social: 80, esteem: 30, stimulation: 62, productivity: 25 },
  },
  phyllis:  {
    currently: 'Organizing client files and checking the clock every few minutes.',
    pad: { p: 0.44, a: 0.16, d: 0.26 },
    needs: { energy: 66, stress: 26, hunger: 58, thirst: 60, social: 42, esteem: 52, stimulation: 44, productivity: 58 },
  },
  meredith: {
    currently: 'Refilling her coffee mug. Possibly for the fourth time.',
    pad: { p: 0.12, a: 0.32, d: 0.26 },
    needs: { energy: 50, stress: 40, hunger: 60, thirst: 78, social: 55, esteem: 35, stimulation: 50, productivity: 30 },
  },
  creed:    {
    currently: 'Writing in a personal journal that no one has ever read.',
    pad: { p: 0.72, a: -0.14, d: 0.32 },
    needs: { energy: 62, stress: 8, hunger: 44, thirst: 52, social: 65, esteem: 55, stimulation: 58, productivity: 20 },
  },
  toby:     {
    currently: 'Reviewing an HR compliance form that will almost certainly never be submitted.',
    pad: { p: -0.38, a: -0.24, d: 0.06 },
    needs: { energy: 52, stress: 55, hunger: 60, thirst: 58, social: 72, esteem: 22, stimulation: 48, productivity: 38 },
  },
};

const personalities = personalitiesRaw as Record<string, Personality>;

// ── Sub-components ───────────────────────────────────────────────────────────

function PadBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.round(Math.abs(value) * 50); // 0–50% of half-bar
  const isPos = value >= 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] w-3 shrink-0 font-mono" style={{ color: '#475569' }}>{label}</span>
      <div className="flex-1 flex items-center gap-0" style={{ height: 6 }}>
        {/* negative side */}
        <div className="flex-1 flex justify-end" style={{ height: 6 }}>
          {!isPos && (
            <div style={{ width: `${pct}%`, height: 6, backgroundColor: color, opacity: 0.7, borderRadius: '2px 0 0 2px' }} />
          )}
        </div>
        {/* center tick */}
        <div style={{ width: 1, height: 10, backgroundColor: '#1e293b', flexShrink: 0 }} />
        {/* positive side */}
        <div className="flex-1" style={{ height: 6 }}>
          {isPos && (
            <div style={{ width: `${pct}%`, height: 6, backgroundColor: color, borderRadius: '0 2px 2px 0' }} />
          )}
        </div>
      </div>
      <span className="text-[10px] w-8 text-right tabular-nums font-mono" style={{ color: '#475569' }}>
        {value >= 0 ? '+' : ''}{value.toFixed(2)}
      </span>
    </div>
  );
}

const NEED_CONFIG: { key: keyof Needs; label: string; color: string; invert?: boolean }[] = [
  { key: 'energy',       label: 'Energy',       color: '#f59e0b' },
  { key: 'stress',       label: 'Stress',       color: '#ef4444', invert: true },
  { key: 'hunger',       label: 'Hunger',       color: '#84cc16', invert: true },
  { key: 'thirst',       label: 'Thirst',       color: '#38bdf8', invert: true },
  { key: 'social',       label: 'Social',       color: '#a78bfa', invert: true },
  { key: 'esteem',       label: 'Esteem',       color: '#f472b6' },
  { key: 'stimulation',  label: 'Stimulation',  color: '#fb923c' },
  { key: 'productivity', label: 'Productivity', color: '#34d399' },
];

function NeedBar({ label, value, color, invert }: { label: string; value: number; color: string; invert?: boolean }) {
  const urgency = invert ? value : 100 - value;
  const urgencyAlpha = urgency > 70 ? 1 : urgency > 40 ? 0.7 : 0.4;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] w-20 shrink-0" style={{ color: '#475569' }}>{label}</span>
      <div className="flex-1 rounded-full overflow-hidden" style={{ height: 4, backgroundColor: '#0f172a' }}>
        <div
          style={{ width: `${value}%`, height: 4, backgroundColor: color, opacity: urgencyAlpha, borderRadius: 9999, transition: 'width 0.3s ease' }}
        />
      </div>
      <span className="text-[10px] w-6 text-right tabular-nums font-mono" style={{ color: '#334155' }}>
        {value}
      </span>
    </div>
  );
}

function OceanBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] w-4 shrink-0 font-mono uppercase" style={{ color: '#334155' }}>{label}</span>
      <div className="flex-1 rounded-full overflow-hidden" style={{ height: 3, backgroundColor: '#0f172a' }}>
        <div style={{ width: `${Math.round(value * 100)}%`, height: 3, backgroundColor: '#334155', borderRadius: 9999 }} />
      </div>
      <span className="text-[10px] w-6 text-right tabular-nums font-mono" style={{ color: '#1e293b' }}>
        {value.toFixed(2)}
      </span>
    </div>
  );
}

// ── Main modal ───────────────────────────────────────────────────────────────

export default function CharacterInspectModal() {
  const [owner, setOwner] = useState<string | null>(null);

  useEffect(() => {
    const openHandler = (o: string) => setOwner(o);
    const closeOnObject = () => setOwner(null);
    EventBus.on('character-inspect', openHandler);
    EventBus.on('object-inspect', closeOnObject);
    return () => {
      EventBus.off('character-inspect', openHandler);
      EventBus.off('object-inspect', closeOnObject);
    };
  }, []);

  if (!owner) return null;

  const display = CHARACTER_DISPLAY[owner];
  const state = DUMMY_STATE[owner];
  const pers = personalities[owner];
  const close = () => setOwner(null);

  if (!display || !state) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center" onClick={close}>
      <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }} />

      <div
        className="relative z-10 w-full max-w-lg mx-4 rounded-xl shadow-2xl"
        style={{ backgroundColor: 'rgba(6,13,24,0.97)', border: '1px solid #1e293b' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4" style={{ borderBottom: '1px solid #0f172a' }}>
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex flex-col gap-1 min-w-0">
              <h2 className="text-sm font-semibold leading-tight" style={{ color: '#e2e8f0' }}>
                {display.name}
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-[10px]" style={{ color: '#475569' }}>{display.role}</span>
                {pers && (
                  <span
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                    style={{ color: '#334155', border: '1px solid #1e293b' }}
                  >
                    {pers.mbti}
                  </span>
                )}
              </div>
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
        <div className="px-5 py-4 flex flex-col gap-5">

          {/* Currently */}
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-medium tracking-widest uppercase" style={{ color: '#334155' }}>Currently</p>
            <p className="text-[12px] leading-relaxed italic" style={{ color: '#64748b' }}>
              &ldquo;{state.currently}&rdquo;
            </p>
          </div>

          {/* PAD vectors */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-medium tracking-widest uppercase" style={{ color: '#334155' }}>PAD state</p>
            <div className="flex flex-col gap-1.5">
              <PadBar label="P" value={state.pad.p} color="#34d399" />
              <PadBar label="A" value={state.pad.a} color="#f59e0b" />
              <PadBar label="D" value={state.pad.d} color="#a78bfa" />
            </div>
            <div className="flex justify-between mt-0.5">
              <span className="text-[9px]" style={{ color: '#1e293b' }}>← negative</span>
              <span className="text-[9px]" style={{ color: '#1e293b' }}>positive →</span>
            </div>
          </div>

          {/* Needs */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-medium tracking-widest uppercase" style={{ color: '#334155' }}>Needs</p>
            <div className="flex flex-col gap-1.5">
              {NEED_CONFIG.map(({ key, label, color, invert }) => (
                <NeedBar key={key} label={label} value={state.needs[key]} color={color} invert={invert} />
              ))}
            </div>
          </div>

          {/* OCEAN (collapsed, dim — just for reference) */}
          {pers && (
            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] font-medium tracking-widest uppercase" style={{ color: '#1e293b' }}>Big Five</p>
              <div className="flex flex-col gap-1">
                {(['o','c','e','a','n'] as const).map((k) => (
                  <OceanBar key={k} label={k} value={pers[k]} />
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
