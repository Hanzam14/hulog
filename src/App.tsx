import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Link, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { load, rpc, supabase } from './data'
import type { Cycle, Snapshot } from './data'
import { addDays, csv, money, parsePesos, phaseDisplay } from './helpers'

type Run = (action: () => Promise<unknown>) => Promise<void>
interface ViewProps { data: Snapshot; user: string; run: Run; busy: boolean }
const closed = (c: Cycle) => c.phase === 'settling' || c.phase === 'ended'
const name = (d: Snapshot, id: string) => d.profiles.find(p => p.id === id)?.display_name ?? 'Member'
const byNewest = (a: Cycle, b: Cycle) => b.created_at.localeCompare(a.created_at)

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [data, setData] = useState<Snapshot | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState('')
  const location = useLocation()
  const refresh = useCallback(async () => { const next = await load(); setData(next) }, [])
  useEffect(() => {
    if (!supabase) return
    let alive = true
    supabase.auth.getSession().then(({ data: result, error: authError }) => {
      if (alive) { setSession(result.session); setReady(true); if (authError) setError(authError.message) }
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setData(null); setReady(true) })
    return () => { alive = false; listener.subscription.unsubscribe() }
  }, [])
  useEffect(() => {
    if (!session) return
    let alive = true
    const reload = () => load().then(next => { if (alive) setData(next) }).catch(e => { if (alive) setError(String(e.message)) })
    void reload()
    const timer = window.setInterval(() => { void reload() }, 30000)
    window.addEventListener('focus', reload)
    return () => { alive = false; clearInterval(timer); window.removeEventListener('focus', reload) }
  }, [session])
  const run: Run = async action => {
    setBusy(true); setError(''); setSuccess('')
    try { await action(); if ((await supabase!.auth.getSession()).data.session) await refresh(); setSuccess('Saved. Salamat!') }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }
  const signIn = () => run(async () => {
    const { error: authError } = await supabase!.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}${location.pathname}` } })
    if (authError) throw authError
  })
  const signOut = () => run(async () => { const { error: authError } = await supabase!.auth.signOut(); if (authError) throw authError; setData(null) })
  if (!supabase) return <main className="welcome"><h1>Hulog</h1><p>Our pot, one day at a time.</p><section><h2>Connect your Supabase project</h2><p>Copy .env.example to .env and follow SETUP.md, then restart the app.</p></section></main>
  const own = data?.memberships.find(m => m.user_id === session?.user.id)
  return <div className="app"><header><Link to="/" className="brand">hulog<span>our daily promise</span></Link>{session && <button className="quiet" disabled={busy} onClick={signOut}>Sign out</button>}</header>
    {error && <div role="alert" className="notice error">{error}<button className="quiet" onClick={() => setError('')}>Dismiss</button></div>}
    {success && <div role="status" className="notice">{success}</div>}
    {!ready ? <main><p>Loading…</p></main> : !session ? <main className="welcome"><span className="eyebrow">Para sa ating dalawa</span><h1>Little by little.<br />Together.</h1><p>Keep track of your two-person paluwagan.<br />You hold the money. Hulog keeps the record.</p><button disabled={busy} onClick={signIn}>Continue with Google</button>{location.pathname.startsWith('/join/') && <p>Your invite will be here after sign-in.</p>}</main>
      : !data ? <main><p>Loading your group…</p><button disabled={busy} onClick={() => run(refresh)}>Try again</button></main>
      : own && own.status !== 'active' ? <main><h1>{own.status === 'pending' ? 'Konting hintay.' : 'Request denied'}</h1><p>{own.status === 'pending' ? 'Your holder will review your join request. This screen refreshes automatically.' : 'Ask the group owner about your request. Your membership must be removed before you can join elsewhere.'}</p><button disabled={busy} onClick={() => run(refresh)}>Refresh status</button></main>
      : !own ? <main><Routes><Route path="/join/:token" element={<Join run={run} busy={busy} />} /><Route path="*" element={<NoGroup run={run} busy={busy} />} /></Routes></main>
      : <><nav><NavLink to="/" end>Home</NavLink><NavLink to="/history">History</NavLink><NavLink to="/changes">Changes {data.changes.some(h => h.unread) && <span className="badge">{data.changes.filter(h => h.unread).length}</span>}</NavLink><NavLink to="/settings">Group</NavLink></nav><main><Routes>
        <Route path="/" element={<Home data={data} user={session.user.id} run={run} busy={busy} />} />
        <Route path="/propose" element={<Propose data={data} user={session.user.id} run={run} busy={busy} />} />
        <Route path="/cycles/:id" element={<Detail data={data} user={session.user.id} run={run} busy={busy} />} />
        <Route path="/history" element={<History data={data} user={session.user.id} run={run} busy={busy} />} />
        <Route path="/changes" element={<Changes data={data} run={run} busy={busy} />} />
        <Route path="/settings" element={<Settings data={data} user={session.user.id} run={run} busy={busy} />} />
        <Route path="*" element={<p>You already have a group. <Link to="/">Go home</Link></p>} />
      </Routes></main></>}
    <footer>Records only. No money moves through Hulog.</footer>
  </div>
}
function Join({ run, busy }: { run: Run; busy: boolean }) {
  const { token } = useParams()
  return <section><h1>You’re invited.</h1><p>Request to join this paluwagan. The holder approves your request.</p><button disabled={busy} onClick={() => run(() => rpc('claim_invite', { p_token: token }))}>Join this group</button></section>
}
function NoGroup({ run, busy }: { run: Run; busy: boolean }) {
  const navigate = useNavigate()
  return <><h1>Start your daily promise.</h1><section><h2>Create group</h2><form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void run(() => rpc('create_group', { p_name: f.get('name'), p_pot_location: f.get('pot') })) }}><label>Group name<input name="name" required placeholder="Our little pot" /></label><label>Pot held at<input name="pot" placeholder="MariBank, cash…" /></label><button disabled={busy}>Create group</button></form></section><section><h2>I have an invite link</h2><form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); const value = String(f.get('link')).trim(); const token = value.split('/join/').pop()?.split(/[?#]/)[0]; if (token) navigate(`/join/${encodeURIComponent(token)}`) }}><label>Paste the invite link<input name="link" required /></label><button disabled={busy} className="secondary">Open invite</button></form></section></>
}
function CycleCard({ c, data }: { c: Cycle; data: Snapshot }) {
  return <><div className="row"><span className="eyebrow">{phaseDisplay(c.phase, c.days_left)}</span><Link to={`/cycles/${c.id}`}>Details →</Link></div><h2>{money(c.daily_amount_centavos)} / day · {c.num_days} days</h2><p>{c.start_date} → {c.end_date}<br />Receiver: <strong>{name(data, c.receiver_id)}</strong></p><div className="pot"><span>Our pot</span><strong>{money(c.pot_centavos)}</strong><span>Target {money(c.target_centavos)}</span></div><progress aria-label="Pot progress" value={c.pot_centavos} max={c.target_centavos} /></>
}
function Proposal({ c, user, run, busy }: { c: Cycle; user: string; run: Run; busy: boolean }) {
  return <div className="actions">{c.proposed_by === user ? <button className="secondary" disabled={busy} onClick={() => run(() => rpc('respond_cycle', { p_id: c.id, p_action: 'cancel' }))}>Cancel proposal</button> : <><button disabled={busy} onClick={() => run(() => rpc('respond_cycle', { p_id: c.id, p_action: 'accept' }))}>Accept terms</button><button className="secondary" disabled={busy} onClick={() => run(() => rpc('respond_cycle', { p_id: c.id, p_action: 'decline' }))}>Decline</button></>}</div>
}
function Payout({ c, user, run, busy }: { c: Cycle; user: string; run: Run; busy: boolean }) {
  if (!closed(c)) return null
  return <section><span className="eyebrow">Payout</span><h2>{c.payout_state}</h2>{c.payout_state !== 'Received' && c.receiver_id === user && <button disabled={busy} onClick={() => run(() => rpc('receive_payout', { p_id: c.id }))}>Got it</button>}</section>
}
function Home(props: ViewProps) {
  const { data, user, run, busy } = props
  const group = data.groups[0]
  const cycles = [...data.cycles].sort(byNewest)
  const live = cycles.find(c => c.status === 'proposed' || (c.status === 'accepted' && !closed(c)))
  const c = live ?? cycles.find(c => c.status === 'accepted')
  return <><span className="eyebrow">{group.name} · {data.today} Manila</span><h1>Hulog today.</h1>{!live && <Link className="button" to="/propose">Propose next cycle</Link>}{!c ? <section><h2>A fresh start.</h2><p>Invite your partner from Group, then agree on your first cycle.</p></section> : <><section><CycleCard c={c} data={data} />{c.status === 'proposed' ? <Proposal c={c} user={user} run={run} busy={busy} /> : <><div className="members">{data.progress.filter(p => p.cycle_id === c.id).map(p => <div key={p.member_id}><strong>{name(data, p.member_id)}{p.member_id === user && ' (you)'}</strong><p>{p.confirmed_days} / {c.num_days} days paid<br />{p.pending_count} pending ({p.pending_days} days)</p><progress aria-label={`${name(data, p.member_id)} days paid`} value={p.confirmed_days} max={c.num_days} /></div>)}</div>{!closed(c) && <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void run(() => rpc('record_payment', { p_cycle_id: c.id, p_days: Number(f.get('days')) })) }}><label>How many days?<input name="days" type="number" min="1" max={c.num_days} defaultValue="1" required /></label><button disabled={busy}>Hulog · record payment</button></form>}</>}</section><Payout c={c} user={user} run={run} busy={busy} /></>}{group.owner_id === user && <section><h2>To confirm</h2>{data.payments.filter(p => p.status === 'pending' && !p.deleted_at).length === 0 && <p>All caught up. Salamat!</p>}{data.payments.filter(p => p.status === 'pending' && !p.deleted_at).map(p => { const cycle = data.cycles.find(cycle => cycle.id === p.cycle_id)!; const allowed = cycle.phase !== 'ended' || p.was_confirmed; return <div className="list-row" key={p.id}><div><strong>{name(data, p.member_id)} · {money(p.amount_centavos)}</strong><p>{p.days} days · {cycle.start_date}<br />{!allowed ? 'Unconfirmed — not counted' : 'Waiting for confirmation'}</p></div>{allowed && <button disabled={busy} onClick={() => run(() => rpc('confirm_payment', { p_id: p.id }))}>Confirm</button>}</div> })}</section>}<p className="muted">Pot held at: {group.pot_location || 'Ask your holder'}</p></>
}
function Propose({ data, run, busy }: ViewProps) {
  const navigate = useNavigate()
  const accepted = data.cycles.filter(c => c.status === 'accepted').sort(byNewest)[0]
  const defaultReceiver = accepted ? data.memberships.find(m => m.status === 'active' && m.user_id !== accepted.receiver_id)?.user_id : data.groups[0].owner_id
  const submit = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const f = new FormData(e.currentTarget); void run(async () => { await rpc('propose_cycle', { p_daily_amount_centavos: parsePesos(String(f.get('amount'))), p_num_days: Number(f.get('days')), p_start_date: f.get('start'), p_receiver_id: f.get('receiver') }); navigate('/') }) }
  return <><h1>Agree on the next pot.</h1><section><form onSubmit={submit}><label>Daily amount (₱)<input name="amount" inputMode="decimal" defaultValue="50" required /></label><label>Number of days<input name="days" type="number" min="1" max="366" defaultValue="15" required /></label><label>Start date<input name="start" type="date" min={data.today} defaultValue={addDays(data.today, 1)} required /></label><label>Receiver<select name="receiver" defaultValue={defaultReceiver}>{data.memberships.filter(m => m.status === 'active').map(m => <option key={m.user_id} value={m.user_id}>{name(data, m.user_id)}</option>)}</select></label><p>Your partner accepts before this cycle begins.</p><button disabled={busy}>Propose cycle</button></form></section></>
}
function Detail({ data, user, run, busy }: ViewProps) {
  const { id } = useParams()
  const c = data.cycles.find(cycle => cycle.id === id)
  const [editing, setEditing] = useState<string | null>(null)
  if (!c) return <p>Cycle unavailable. <Link to="/">Go home</Link></p>
  return <><h1>Cycle detail</h1><section><CycleCard c={c} data={data} />{c.status === 'proposed' && <Proposal c={c} user={user} run={run} busy={busy} />}</section><section><h2>Payments</h2>{data.payments.filter(p => p.cycle_id === id).map(p => <article className="entry" key={p.id}><div className="row"><strong>{name(data, p.member_id)} · {p.days} days</strong><span className="chip">{p.deleted_at ? 'Deleted' : p.status === 'pending' && c.phase === 'ended' && !p.was_confirmed ? 'Unconfirmed — not counted' : p.status}</span></div><p>{money(p.amount_centavos)} · {p.created_at.slice(0, 10)}</p>{!p.deleted_at && <><div className="actions"><button className="quiet" disabled={busy} onClick={() => setEditing(editing === p.id ? null : p.id)}>Edit days</button><button className="quiet danger" disabled={busy} onClick={() => { if (window.confirm('Delete this payment record? The change stays in history.')) void run(() => rpc('edit_payment', { p_id: p.id, p_delete: true })) }}>Delete</button>{data.groups[0].owner_id === user && p.status === 'pending' && (c.phase !== 'ended' || p.was_confirmed) && <button disabled={busy} onClick={() => run(() => rpc('confirm_payment', { p_id: p.id }))}>Confirm</button>}</div>{editing === p.id && <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void run(async () => { await rpc('edit_payment', { p_id: p.id, p_days: Number(f.get('days')) }); setEditing(null) }) }}><label>Correct number of days<input name="days" type="number" min="1" max={c.num_days} defaultValue={p.days} required /></label><button disabled={busy}>Save correction</button></form>}</>}</article>)}</section><Payout c={c} user={user} run={run} busy={busy} /></>
}
function History({ data, user, run, busy }: ViewProps) {
  const [editing, setEditing] = useState<string | null>(null)
  return <><h1>Past pots & debts</h1>{data.cycles.filter(c => closed(c) || c.status === 'declined' || c.status === 'cancelled').sort(byNewest).map(c => <section key={c.id}><CycleCard c={c} data={data} /><p><strong>{c.payout_state ?? c.status}</strong></p>{data.progress.filter(p => p.cycle_id === c.id && p.member_id !== c.receiver_id).map(p => <div key={p.member_id}><h3>{name(data, p.member_id)} · Owes {money(p.debt_centavos)}</h3>{p.debt_centavos > 0 && <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void run(() => rpc('record_repayment', { p_cycle_id: c.id, p_debtor_id: p.member_id, p_amount_centavos: parsePesos(String(f.get('amount'))) })) }}><label>Repayment amount (₱)<input name="amount" inputMode="decimal" required defaultValue={(p.debt_centavos / 100).toFixed(2)} /></label><button disabled={busy}>Record repayment</button></form>}</div>)}{data.repayments.filter(r => r.cycle_id === c.id).map(r => <article className="entry" key={r.id}><strong>{name(data, r.debtor_id)} → {name(data, r.creditor_id)}</strong><p>{money(r.amount_centavos)} · {r.deleted_at ? 'Deleted' : r.status}</p>{!r.deleted_at && <><div className="actions">{r.status === 'pending' && r.creditor_id === user && <button disabled={busy} onClick={() => run(() => rpc('confirm_repayment', { p_id: r.id }))}>Confirm repayment</button>}<button className="quiet" disabled={busy} onClick={() => setEditing(editing === r.id ? null : r.id)}>Edit amount</button><button className="quiet danger" disabled={busy} onClick={() => { if (window.confirm('Delete this repayment record?')) void run(() => rpc('edit_repayment', { p_id: r.id, p_delete: true })) }}>Delete</button></div>{editing === r.id && <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void run(async () => { await rpc('edit_repayment', { p_id: r.id, p_amount_centavos: parsePesos(String(f.get('amount'))) }); setEditing(null) }) }}><label>Correct amount (₱)<input name="amount" inputMode="decimal" defaultValue={(r.amount_centavos / 100).toFixed(2)} required /></label><button disabled={busy}>Save correction</button></form>}</>}</article>)}</section>)}{!data.cycles.some(c => closed(c) || ['declined', 'cancelled'].includes(c.status)) && <p>Past cycles will appear here.</p>}</>
}
function Changes({ data, run, busy }: { data: Snapshot; run: Run; busy: boolean }) {
  const fields: Record<string, string> = { name: 'Group name', pot_location: 'Pot held at', status: 'Status', days: 'Days', amount_centavos: 'Amount', daily_amount_centavos: 'Daily amount', num_days: 'Cycle length', start_date: 'Starts', end_date: 'Ends', receiver_id: 'Receiver', deleted_at: 'Deleted', received_at: 'Received', used_at: 'Invite used', revoked_at: 'Invite revoked' }
  const value = (key: string, v: unknown) => v == null ? '—' : key.endsWith('_centavos') ? money(Number(v)) : key === 'receiver_id' ? name(data, String(v)) : key.endsWith('_at') ? 'Yes' : String(v)
  return <><div className="row"><h1>Changes</h1><button className="secondary" disabled={busy} onClick={() => run(() => rpc('mark_history_seen'))}>Mark read</button></div><p>Every correction leaves a record.</p>{[...data.changes].reverse().map(h => <section key={h.id}><div className="row"><strong>{name(data, h.actor_id)} · {h.action} {h.entity}</strong>{h.unread && <span className="badge">New</span>}</div><p>{new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(new Date(h.created_at))} Manila</p><details><summary>What changed</summary>{Object.entries(fields).filter(([key]) => h.before?.[key] !== h.after?.[key]).map(([key, label]) => <p key={key}><strong>{label}</strong><br />{value(key, h.before?.[key])} → {value(key, h.after?.[key])}</p>)}</details></section>)}</>
}
function Settings({ data, user, run, busy }: ViewProps) {
  const group = data.groups[0]
  const owner = group.owner_id === user
  const [invite, setInvite] = useState('')
  const [qr, setQr] = useState('')
  const exportCsv = async () => {
    const fresh = await load()
    for (const [file, rows] of [['cycles', fresh.cycles], ['payments', fresh.payments], ['repayments', fresh.repayments]] as const) {
      const url = URL.createObjectURL(new Blob(['\ufeff', csv(rows as unknown as Record<string, unknown>[])], { type: 'text/csv;charset=utf-8' }))
      const a = document.createElement('a'); a.href = url; a.download = `hulog-${file}.csv`; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
  }
  return <><h1>Our group</h1><section><h2>{group.name}</h2><p>Pot held at: {group.pot_location || 'Not set yet'}</p>{data.memberships.filter(m => m.status === 'active').map(m => <p key={m.user_id}><strong>{name(data, m.user_id)}</strong> · {m.user_id === group.owner_id ? 'Owner / holder' : 'Member'}</p>)}{owner && <form key={group.pot_location} onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void run(() => rpc('update_group', { p_name: group.name, p_pot_location: f.get('pot') })) }}><label>Pot held at<input name="pot" defaultValue={group.pot_location} /></label><button disabled={busy}>Save pot location</button></form>}</section>{owner && <><section><h2>Invite your partner</h2><p>One use, valid for 24 hours. A new link revokes older unused links.</p><button disabled={busy} onClick={() => run(async () => { const token = await rpc('create_invite') as string; const link = `${window.location.origin}/join/${token}`; setInvite(link); const { default: QRCode } = await import('qrcode'); setQr(await QRCode.toDataURL(link, { width: 240, margin: 2 })) })}>Create invite</button>{invite && <div className="invite">{qr && <img src={qr} alt="Scan to join this Hulog group" width="240" height="240" />}<label>Invite link<input readOnly value={invite} onFocus={e => e.target.select()} /></label><button className="secondary" disabled={busy} onClick={() => run(async () => navigator.clipboard.writeText(invite))}>Copy link</button></div>}{data.invites.filter(i => !i.used_at && !i.revoked_at).map(i => <div className="list-row" key={i.id}><p>Expires {new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(new Date(i.expires_at))}</p><button className="quiet danger" disabled={busy} onClick={() => run(async () => { await rpc('revoke_invite', { p_id: i.id }); setInvite(''); setQr('') })}>Revoke</button></div>)}</section><section><h2>Join requests</h2>{!data.memberships.some(m => m.status === 'pending') && <p>No requests right now.</p>}{data.memberships.filter(m => m.status === 'pending').map(m => <div className="entry" key={m.user_id}><p>Join request from <strong>{name(data, m.user_id)}</strong> ({data.profiles.find(p => p.id === m.user_id)?.email})</p><div className="actions"><button disabled={busy} onClick={() => run(() => rpc('review_member', { p_user_id: m.user_id, p_accept: true }))}>Accept</button><button className="secondary" disabled={busy} onClick={() => run(() => rpc('review_member', { p_user_id: m.user_id, p_accept: false }))}>Deny</button></div></div>)}</section></>}<section><h2>Keep a copy</h2><p>Download cycles, payments and repayments as three CSV files. Amounts are in centavos.</p><button className="secondary" disabled={busy} onClick={() => run(exportCsv)}>Export CSV</button></section></>
}
