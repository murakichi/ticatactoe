// オリジナルスキルの作成画面。選択肢（対象・選び方・効果・代償）から選ぶだけで、コストは自動で出る。
// 保存した1枚は、人間席のデッキ編集で「オリジナル」として1枚だけ入れられる。AIは使わない。
import React, { useState } from 'react';
import {
    COUNTS,
    CustomKind,
    CustomOp,
    CustomPick,
    CustomSkillSpec,
    DAMAGE_AMOUNTS,
    DRAWBACK_AMOUNTS,
    DRAWBACK_CHOICES,
    DRAWBACK_COUNTS,
    DRAWBACK_STATUSES,
    Drawback,
    HEAL_AMOUNTS,
    KIND_DEFS,
    MAX_DRAWBACKS,
    MAX_OPS,
    NAME_MAX,
    PICK_DEFS,
    STATUS_DEFS,
    StatusEffect,
    autoName,
    costBeforeDrawbacks,
    customSkillCost,
    defaultOp,
    describeCustom,
    drawbackCut,
    normalizeSpec,
    opAllowedFor,
    sanitizeName,
    statusDef,
} from './game/customSkill';
import styles from '../App.module.css';

type Props = {
    /** 保存済みのスキル（なければ新規） */
    initial: CustomSkillSpec | undefined;
    /** 保存を押した。保存できたら true を返す */
    onSave: (spec: CustomSkillSpec) => boolean;
    onDelete: () => void;
};

const NEW_SPEC: CustomSkillSpec = {
    name: '',
    kind: 'enemy',
    pick: 'select',
    count: 1,
    ops: [{ op: 'damage', amount: 2, destroyOnZero: false }],
    drawbacks: [],
    endTurn: false,
};

const chip = (active: boolean) => `${styles.gearChip} ${active ? styles.gearChipActive : ''}`;

export const CustomSkillCreator = (props: Props) => {
    const [spec, setSpec] = useState<CustomSkillSpec>(props.initial ?? NEW_SPEC);
    const [message, setMessage] = useState<string>('');
    // 名前が空のままなら選択肢から自動で付ける
    const shown = normalizeSpec(spec);
    const set = (patch: Partial<CustomSkillSpec>) => {
        setSpec((prev) => ({ ...prev, ...patch }));
        setMessage('');
    };
    const setKind = (kind: CustomKind) => set({ kind, ops: spec.ops.filter((o) => opAllowedFor(o, kind)).length > 0 ? spec.ops.filter((o) => opAllowedFor(o, kind)) : [defaultOp(kind)] });
    const setPick = (pick: CustomPick) => set({ pick });
    const setOp = (i: number, op: CustomOp) => set({ ops: spec.ops.map((o, k) => (k === i ? op : o)) });
    const addOp = () => set({ ops: [...spec.ops, defaultOp(spec.kind)] });
    const removeOp = (i: number) => set({ ops: spec.ops.filter((_, k) => k !== i) });
    const setDrawback = (i: number, d: Drawback) => set({ drawbacks: spec.drawbacks.map((x, k) => (k === i ? d : x)) });

    const before = costBeforeDrawbacks(shown);
    const cut = drawbackCut(shown, before);
    const cost = customSkillCost(shown);
    const dirty = JSON.stringify(shown) !== JSON.stringify(props.initial);

    const onSave = () => {
        const final = { ...shown, name: sanitizeName(spec.name) || autoName(shown) };
        setMessage(props.onSave(final) ? `「${final.name}」を保存しました。デッキ編集の「オリジナル」から入れられます` : '保存できませんでした');
        setSpec(final);
    };

    return (
        <details className={styles.gearBox} open={!props.initial}>
            <summary className={styles.gearHead}>
                <span>🛠 オリジナルスキル {props.initial ? `（保存済み: ${props.initial.name}）` : '（未作成）'}</span>
            </summary>
            <div className={styles.gearNote}>選択肢から効果を組み立てます。効果を重ねるほどコストは重く、代償（ネガティブな効果）を付けると軽くなります。デッキに1枚まで入れられ、AIは使いません。</div>

            <div className={styles.deckGroupLabel}>どこに（対象）</div>
            <div className={styles.gearGrid}>
                {KIND_DEFS.map((k) => (
                    <button key={k.id} className={chip(spec.kind === k.id)} aria-pressed={spec.kind === k.id} onClick={() => setKind(k.id)}>
                        {k.label}
                    </button>
                ))}
            </div>

            <div className={styles.deckGroupLabel}>どう決める（選択系 / 即発動系）</div>
            <div className={styles.gearGrid}>
                {PICK_DEFS.map((p) => (
                    <button key={p.id} className={chip(spec.pick === p.id)} aria-pressed={spec.pick === p.id} onClick={() => setPick(p.id)}>
                        {p.mode === 'select' ? '選択系: ' : '即発動: '}
                        {p.label}
                    </button>
                ))}
                {spec.pick !== 'all' && (
                    <select
                        className={styles.deckInput}
                        aria-label='マスの数'
                        value={shown.count}
                        onChange={(e) => set({ count: Number(e.target.value) })}
                    >
                        {COUNTS.map((n) => (
                            <option key={n} value={n}>
                                {n}マス
                            </option>
                        ))}
                    </select>
                )}
            </div>

            <div className={styles.deckGroupLabel}>効果（{shown.ops.length}/{MAX_OPS}）</div>
            {shown.ops.map((op, i) => (
                <div key={i} className={styles.gearGrid} style={{ marginBottom: 4, alignItems: 'center' }}>
                    <select
                        className={styles.deckInput}
                        aria-label={`効果${i + 1}の種類`}
                        value={op.op === 'effect' ? `effect:${op.effect}` : op.op}
                        onChange={(e) => {
                            const v = e.target.value;
                            if (v === 'damage') setOp(i, { op: 'damage', amount: 2, destroyOnZero: false });
                            else if (v === 'destroy') setOp(i, { op: 'destroy' });
                            else if (v === 'heal') setOp(i, { op: 'heal', amount: 3 });
                            else setOp(i, { op: 'effect', effect: v.slice(7) as StatusEffect, count: 1 });
                        }}
                    >
                        {(['damage', 'destroy', 'heal'] as const)
                            .filter((o) => opAllowedFor(o === 'destroy' ? { op: 'destroy' } : o === 'heal' ? { op: 'heal', amount: 1 } : { op: 'damage', amount: 1, destroyOnZero: false }, spec.kind))
                            .map((o) => (
                                <option key={o} value={o}>
                                    {o === 'damage' ? 'ダメージを与える' : o === 'destroy' ? '駒を破壊する' : 'ライフを加算する'}
                                </option>
                            ))}
                        {STATUS_DEFS.filter((d) => opAllowedFor({ op: 'effect', effect: d.id, count: 1 }, spec.kind)).map((d) => (
                            <option key={d.id} value={`effect:${d.id}`}>
                                {d.icon}{d.label}を乗せる
                            </option>
                        ))}
                    </select>
                    {op.op === 'damage' && (
                        <>
                            <select className={styles.deckInput} aria-label={`効果${i + 1}のダメージ量`} value={op.amount} onChange={(e) => setOp(i, { ...op, amount: Number(e.target.value) })}>
                                {DAMAGE_AMOUNTS.map((n) => (
                                    <option key={n} value={n}>
                                        {n}ダメージ
                                    </option>
                                ))}
                            </select>
                            <label className={styles.gearNote}>
                                <input type='checkbox' checked={op.destroyOnZero} onChange={(e) => setOp(i, { ...op, destroyOnZero: e.target.checked })} /> 0になった駒を破壊する
                            </label>
                        </>
                    )}
                    {op.op === 'heal' && (
                        <select className={styles.deckInput} aria-label={`効果${i + 1}の加算量`} value={op.amount} onChange={(e) => setOp(i, { ...op, amount: Number(e.target.value) })}>
                            {HEAL_AMOUNTS.map((n) => (
                                <option key={n} value={n}>
                                    ライフ+{n}
                                </option>
                            ))}
                        </select>
                    )}
                    {op.op === 'effect' && (
                        <select className={styles.deckInput} aria-label={`効果${i + 1}の個数`} value={op.count} onChange={(e) => setOp(i, { ...op, count: Number(e.target.value) })}>
                            {statusDef(op.effect).counts.map((n) => (
                                <option key={n} value={n}>
                                    {n}つ
                                </option>
                            ))}
                        </select>
                    )}
                    <button className={styles.gearMiniBtn} onClick={() => removeOp(i)} disabled={spec.ops.length <= 1} aria-label={`効果${i + 1}を外す`}>
                        ✕
                    </button>
                </div>
            ))}
            <button className={styles.gearMiniBtn} onClick={addOp} disabled={spec.ops.length >= MAX_OPS}>
                ＋ 効果を足す
            </button>

            <div className={styles.deckGroupLabel} style={{ marginTop: 8 }}>
                代償（コストが下がる・{shown.drawbacks.length}/{MAX_DRAWBACKS}）
            </div>
            {shown.drawbacks.map((d, i) => (
                <div key={i} className={styles.gearGrid} style={{ marginBottom: 4, alignItems: 'center' }}>
                    <span className={styles.gearNote}>{d.side === 'own' ? '自陣のランダムな1コマに' : '敵のランダムな1コマに'}</span>
                    {d.side === 'own' ? (
                        <select
                            className={styles.deckInput}
                            aria-label={`代償${i + 1}の種類`}
                            value={d.op.op === 'effect' ? `effect:${d.op.effect}` : d.op.op}
                            onChange={(e) => {
                                const v = e.target.value;
                                if (v === 'damage') setDrawback(i, { side: 'own', op: { op: 'damage', amount: 2, destroyOnZero: false } });
                                else if (v === 'destroy') setDrawback(i, { side: 'own', op: { op: 'destroy' } });
                                else setDrawback(i, { side: 'own', op: { op: 'effect', effect: v.slice(7) as StatusEffect, count: 1 } });
                            }}
                        >
                            <option value='damage'>ダメージ</option>
                            <option value='destroy'>破壊</option>
                            {DRAWBACK_STATUSES.map((s) => (
                                <option key={s} value={`effect:${s}`}>
                                    {statusDef(s).icon}{statusDef(s).label}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <span className={styles.gearNote}>ライフ回復</span>
                    )}
                    {d.op.op === 'damage' && (
                        <select className={styles.deckInput} aria-label={`代償${i + 1}のダメージ量`} value={d.op.amount} onChange={(e) => setDrawback(i, { side: 'own', op: { op: 'damage', amount: Number(e.target.value), destroyOnZero: false } })}>
                            {DRAWBACK_AMOUNTS.map((n) => (
                                <option key={n} value={n}>
                                    {n}ダメージ
                                </option>
                            ))}
                        </select>
                    )}
                    {d.op.op === 'heal' && (
                        <select className={styles.deckInput} aria-label={`代償${i + 1}の回復量`} value={d.op.amount} onChange={(e) => setDrawback(i, { side: 'enemy', op: { op: 'heal', amount: Number(e.target.value) } })}>
                            {DRAWBACK_AMOUNTS.map((n) => (
                                <option key={n} value={n}>
                                    +{n}
                                </option>
                            ))}
                        </select>
                    )}
                    {d.op.op === 'effect' && (
                        <select
                            className={styles.deckInput}
                            aria-label={`代償${i + 1}の個数`}
                            value={d.op.count}
                            onChange={(e) => d.op.op === 'effect' && setDrawback(i, { side: 'own', op: { ...d.op, count: Number(e.target.value) } })}
                        >
                            {DRAWBACK_COUNTS.map((n) => (
                                <option key={n} value={n}>
                                    {n}つ
                                </option>
                            ))}
                        </select>
                    )}
                    <button className={styles.gearMiniBtn} onClick={() => set({ drawbacks: spec.drawbacks.filter((_, k) => k !== i) })} aria-label={`代償${i + 1}を外す`}>
                        ✕
                    </button>
                </div>
            ))}
            <div className={styles.gearGrid}>
                {DRAWBACK_CHOICES.map((c) => (
                    <button key={c.label} className={styles.gearChip} disabled={spec.drawbacks.length >= MAX_DRAWBACKS} onClick={() => set({ drawbacks: [...spec.drawbacks, c.make()] })}>
                        ＋ {c.label}
                    </button>
                ))}
            </div>

            <div className={styles.gearGrid} style={{ marginTop: 8 }}>
                <button className={chip(spec.endTurn)} aria-pressed={spec.endTurn} onClick={() => set({ endTurn: !spec.endTurn })}>
                    使うと手番を終える（コスト-2）
                </button>
            </div>

            <div className={styles.deckSave}>
                <input
                    className={styles.deckInput}
                    value={spec.name}
                    maxLength={NAME_MAX}
                    placeholder={`名前（空なら「${autoName(shown)}」）`}
                    aria-label='オリジナルスキルの名前'
                    onChange={(e) => set({ name: e.target.value })}
                />
                <button className={styles.gearMiniBtn} onClick={onSave} disabled={!dirty && !!props.initial}>
                    保存
                </button>
                <button className={styles.gearMiniBtn} onClick={props.onDelete} disabled={!props.initial}>
                    削除
                </button>
            </div>
            <div className={styles.deckInfo} aria-live='polite'>
                <strong>
                    {shown.name}（基礎コスト {cost}）
                </strong>
                {cut > 0 && `　効果ぶん ${before} − 代償の割引 ${cut}`}
                <br />
                {describeCustom(shown)}
            </div>
            {message && <div className={styles.gearNote}>{message}</div>}
        </details>
    );
};
