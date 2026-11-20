# Flambeur multiplayer architecture

> This is the multiplayer plan as of Nov 17. The engine sections (section 2 and the rule examples elsewhere) predate the v2 rules: `src/engine/match.ts` is the source of truth for the engine, and DESIGN.md for the rules.

How Flambeur goes multiplayer-first: friends live this week, online dailies with a shared leaderboard, then the 10-player battle royale, without painting us into a corner if it ever gets big.

This is a recommendation and a plan, not a survey. It was checked against a deep research pass on 2026-11-17 (6 research tracks plus local benchmarks), and the "Why not the alternatives" section near the end says what that changed. Every section is a pick and the reason for it. Things I couldn't verify about the cluster are marked **unverified** with the command that settles them.

## Decisions log (2026-11-17)

Everything below is decided. Evan said to make the remaining calls from what he's said; the ones he answered directly are marked.

- **Build order: engine core first.** The server is thin glue around `step` / `view` / `legal`, and the hard-to-reverse items (rng, card ids, `engineVersion`) all live in the engine. Day one, the main session lands the `Action` / `SeatView` / `Match` types first (a few hours), then the server can be built in parallel against those types while `match.ts` fills in. Two writers never share files: the engine session owns `src/engine/` and `main.ts`, the server work owns `server/`, `deploy/`, `src/net.ts`.
- **Work on the laptop, not on the server.** The repo, `pnpm test`, the Vite preview and docker are here. The cluster is one `ssh precision01 kubectl ...` away, so cluster credentials never get copied to the laptop. A Claude session on precision01 is only worth it for long cluster-side jobs.
- **Deploys:** agents may create and change anything inside the `flambeur` namespace and import images on precision02 without asking (**Evan**). Nothing outside that namespace gets touched.
- **Tunnel:** built by the agent with the Cloudflare API token already on the control-plane node (checked 2026-11-17: active, sees the `example.com` zone, lists the account's 11 tunnels and the DNS records). A new tunnel `flambeur`, hostname `flambeur.example.com` (free today). Whether the token can *create* tunnels and DNS records is untested; if it can't, the agent writes Evan a short handoff with the dashboard clicks (**Evan**).
- **1v1 friend duel is bust only** (**Evan**). A duel doesn't stop at round 12. Proposed rule for the main session, since rounds past 12 aren't defined yet: every round after 12 is a sudden-death round, a forced showdown like a boss round with the ante doubling each round, so a duel always ends within a few rounds. Battle royale is bust only too, same rule.
- **Dailies: unlimited replays, best score counts** (**Evan**), with a first-try board next to it (section 4).
- **AWS later is a move, not a rewrite.** Nothing here is homelab-specific except the precision02 pins and `local-path`. Moving means: the same manifests on EKS (or plain EC2 running k3s), RDS for Postgres via `pg_dump` / restore, ECR for images, EBS volumes instead of `local-path`, and Cloudflare stays in front (or an ALB). The match directory and lease (section 6, Phase 3) are what let it run on many pods there. Cloudflare Durable Objects is the other big-scale path; keeping the engine free of Node-only APIs keeps that open too.
- **Backups:** the nightly `pg_dump` CronJob runs pinned to precision03 and writes to a `local-path` volume there, so a dead precision02 disk doesn't take the backups with it. That matches how the rest of the homelab keeps off-host copies.

## The picks in one table

| Question | Pick | Why |
|---|---|---|
| Authority | **Server-authoritative.** The server holds the only full `Match`, clients send intents, each seat gets back only its own view | Lockstep needs every client to hold every seat's hand and pile, which leaks exactly the info the game hides |
| Engine | **Rewrite the game layer as a phase state machine (`match.ts`: `step`, `view`, `legal`), keep the rule modules.** A match = seed + action log | The rules are pure and tested. The round flow lives in `main.ts` and can be called out of order. Replay, crash recovery and debugging fall out of the new core |
| Online daily | **Runs on the server** like a match with one bot seat, not client-side with a replay check | A client that knows the seed can sim thousands of lines offline and submit the best one. A replay check can't catch that |
| Server | **Plain Node 24 + `ws`, our own ~500 lines.** Not Colyseus, Nakama, Bun/uWS, BEAM or Durable Objects | The things that matter (log before broadcast, replay recovery, `view()`) live outside every framework. Runtime speed isn't the bottleneck at this load |
| Transport | **One WebSocket per player**, JSON messages, full seat view plus an event list after every step | Even a 10-seat match is tens of KB/s. The real risk is a redaction bug, not bandwidth, so one `view()` choke point beats a diff engine |
| Match hosting | **One process, matches in memory, one actor per match.** Every action is written to Postgres before it's broadcast | Simple now. The log is what makes a dead pod recoverable later |
| Data | **Postgres only.** No Redis until there's more than one game pod | One store to run, back up and debug |
| Accounts | **Username + password, plus guests.** scrypt from `node:crypto`, session token in an httpOnly cookie | Evan's call. No auth provider to set up before Friday |
| Edge | **A new Cloudflare Tunnel, cloudflared running in the cluster**, straight to the Service | Evan's call. The existing tunnels are host services for other apps |
| Deploy | **Build on the laptop, pipe the image into precision02's containerd, `kubectl set image`** | Evan's call. The cluster has no registry, and pinning to one node means it doesn't need one until CI |
| Runtime deps | Server only: **`ws`** (WebSocket server) and **`pg`** (Postgres client). The browser bundle stays dependency-free | Node 24 ships a WebSocket client but no server. Both are small and boring |
| Match ids | **Opaque UUIDs** (`crypto.randomUUID`). Which pod owns a match lives in one Postgres row, never in the id | Ids end up in URLs, logs and the leaderboard, so this is the hardest choice to undo |

## 1. Authority model

**Pick: server-authoritative `step()`.** The server owns the `Match`. A client sends "I want to do X", the server runs `step(match, action)`, and every connected seat gets `view(match, seat)`.

Why not lockstep (every client runs the engine and only inputs are shared):
- Lockstep needs the full state on every client: the rival's hand, their locked cards, their pile order, the seed. Flambeur's whole betting game is hidden info. "The rival sees your hand size and mulligan count, never how many cards you locked or which ones" can't be true if the rival's browser has your hand in memory.
- Lockstep saves bandwidth and server CPU. We need neither: a step is a few function calls, and a view is a few KB.

What the client still does:
- Renders the view, animates the count-up from the events the server sends, and pre-selects the best hand locally from its *own* cards (it has them, so this leaks nothing).
- Never decides an outcome, a price, a draw or a bankroll.

**Offline solo stays exactly as it is today**, fully client-side, unranked. That's the "play on a plane" mode and the dev harness.

### Why dailies run on the server too

The brief floated "client plays the daily, sends seed + action log, server replays it to verify". That catches impossible actions but not the real cheat:
- The daily seed is the same for everyone. If the client knows it, someone can run the open engine locally against that seed, try every line, and submit the best log. It replays perfectly. It's still cheating.
- The rival bot's hand sits in browser memory, so devtools shows you whether to fold.

So the daily is a server match with a bot seat. The seed stays on the server until the day closes. Replay verification still matters, but as a server-side tool (crash recovery, audits, bug repro), not as the trust boundary.

## 2. Engine contract (for the main session)

The main session owns `src/engine/` and is refactoring it behind `step()`. This section is what the server needs from that refactor. **I didn't touch the engine.** File and line refs below are from commit 706b025.

### Rewrite the core, keep the rules

Evan asked whether the engine is the right architecture at all, and whether a full rewrite would be more bulletproof. My pick: **rewrite the game layer from scratch as a state machine, keep the rule modules.** Here's how the code splits today:

- **The rules are fine.** `cards`, `hands`, `scoring`, `forge`, `betting` (the stake math), `deck`, `shop`, `economy`, `starters`, `collectibles`, `twists`, `sleeves`: pure functions, fail loud (45 throws), tested with hand-computed numbers, and the sim tunes them. Rewriting these throws away the balance work and buys nothing. They need mechanical fixes only (rng as data, no global card id, see below).
- **The game itself isn't in the engine yet.** Who acts when, the round order, the peek roll, the showdown appraisal, the bot's turns: all of that is sequenced by `main.ts` (`startRound`, `lockIn`, `botTurns`, `resolveRound`, lines 567-890) in module-level `let` variables, mixed with rendering and `await sleep()`. `run.ts` is a bag of functions the UI calls in the right order. Nothing stops calling them in the wrong order. That's the layer a server can't reuse and a cheater would poke at, so that's the layer to rewrite.

So the new core is one file pair, roughly `src/engine/match.ts` + `match.test.ts`, that owns the whole flow, and the leaf modules stay underneath it. `run.ts` and the flow half of `main.ts` get deleted once it works. The solo UI then drives the same `step()` locally, so offline solo, the daily and live matches are one code path.

The phase machine (from DESIGN.md's Round flow and Timers table):

```
draft ─► [ shop ─► deal ─► lock ─► bet ─► (forgePick) ─► settle ] × 12 ─► over
           │        │       │       │                       │
       all seats  mulligan  all    per pair, in      bust or round 12 ends it.
       at once,   any       seats  parallel. first   round 1 skips the shop
       'leave'    number    at     to act = richer   (free pack instead)
       to ready             once   seat
```

`phase` is a tagged union stored in the match (`{ kind: 'shop', ready: boolean[] }`, `{ kind: 'bet', pairs: Betting[] }`, ...). `step` is one `switch (match.phase.kind)`. Each case says which action types it takes and from which seats, and anything else throws. It's a plain switch, not a state machine library or a registry.

What makes it bulletproof (these are in the must-haves below as items 11-13):
- **Atomic steps.** `step` works on a copy and only returns it if nothing threw. Copy with a JSON round trip, not `structuredClone`: on a realistic 2-seat state (~25 KB, 170 cards) I measured `structuredClone` ~590 µs, JSON ~360 µs, a hand-written copy ~19 µs (Node 24, laptop, one run). Any of them is fine at human pace. A hand-written `cloneMatch` comes later if bots or the fuzz test need the speed. Today a throw halfway through (say `binBulk` after `takeOut`) leaves the state half-changed. With a clone, an illegal or buggy action can't corrupt a live match.
- **One list of legal moves.** `legal(match, seat)` enumerates every legal action. The UI greys buttons from it, bots pick from it, and the fuzz test plays from it. `step` validates each action directly with the same predicates `legal` uses (cheaper than searching 218 lock combos), and a test checks the two agree. Bots score candidate plays with pure functions like `appraise`, never by stepping a clone per candidate (218 clones per decision adds up).
- **Invariants after every step.** Every card id is in exactly one place (hand, pile, discard, binder, grading, or the forged-away list), no bankroll is negative, `pending` matches the phase. Breaking one throws. That catches dupe bugs before a player finds them.
- **Fuzz it.** Thousands of seeded matches of random legal moves, 2 and 10 seats: no throws, invariants hold, replay matches, views don't leak.

The cost is real: it's the main session's whole week, and the Friday demo needs the solo UI moved onto `step()` too. It's still cheaper than shipping multiplayer on the current flow and debugging desyncs and leaks live.

### Shape

```ts
type SeatId = number // 0..n-1

type MatchConfig = {
  mode: 'solo' | 'daily' | 'duel' | 'br'
  seed: string
  seats: { kind: 'human' | 'bot'; name: string; difficulty?: Difficulty }[] // 2 for duel, up to 10 for br
}

function newMatch(config: MatchConfig): Match
function step(match: Match, seat: SeatId, action: Action): StepResult // throws on illegal
function view(match: Match, seat: SeatId): SeatView
function pending(match: Match): SeatId[]                    // who owes an action right now
function phase(match: Match): Phase                         // drives the timer table
function defaultAction(match: Match, seat: SeatId): Action  // what a timeout does
function botAction(match: Match, seat: SeatId): Action      // bot.ts policy, as a normal action
function result(match: Match): MatchResult | null           // null until over

type StepResult = { match: Match; events: { to: SeatId | 'all'; event: Event }[] }

// replay = fold step over the log. used for recovery, audits and the determinism test
function replay(config: MatchConfig, log: { seat: SeatId; action: Action }[]): Match
const ENGINE_VERSION: string // bump on any rule or rng change. a log only replays on its own version
```

`step` clones, applies, checks invariants, and returns the new match. On a throw the caller still holds the untouched old one. A 2-seat match is ~25 KB and a JSON clone is well under a millisecond, so this is cheap at human pace.

### Must-haves

1. **N seats, no you/rival.** `players: Player[]` instead of `you` / `rival`, `SeatId = number` instead of `Seat = 0 | 1` (`betting.ts:1`). Betting, settle and finishRound take a **pair** `[SeatId, SeatId]`. A duel is one fixed pair. Battle royale is a list of pairs per round (seeded pairing, a bot or a bye on odd counts, rule TBD), and all pairs bet at once (Timers section says so). The bot is just a seat with `kind: 'bot'`.

2. **All state is plain JSON.** `JSON.parse(JSON.stringify(match))` must give back an equal, working match. Today that breaks in three places:
   - `Rng` is a closure (`rng.ts`). Make it data, and **switch generators while doing it**: sfc32 (4 × 32-bit words of state, passes PractRand/BigCrush per its maintainer) seeded per stream by a cyrb128 hash of the stream name, instead of mulberry32 (one 32-bit word, can't produce about a third of 32-bit values). Keep named streams (`seed:round:seat:purpose`) so a shop restock still never changes a deal. The stream names need a well-mixing hash: Slay the Spire 2 shipped correlated derived streams and had to patch it. This changes every seed, so do it **before the first daily is recorded**, and the sim/balance numbers need a re-run after.
   - `ShopMemory.seen` is a `Set` (`shop.ts:24`). Use a `string[]` or a `Record<string, true>`.
   - The shop itself lives in `main.ts` today, not in `Run`. The current offer, restock count and per-shop flags (one grade per visit, free pack) have to move into `Match`, per seat.

3. **No module-level state.** `cards.ts:35` has a global `let nextId = 1`. On a server running many matches, two matches hand out ids from the same counter, and a replay gets different ids than the live match did, so a logged `lock [14, 17]` points at the wrong cards. Move it to `match.nextCardId`.

4. **Per-seat randomness everywhere.** `run.rng` is shared: seat 0's grading (`run.ts:258`), the bot's shop (`bot.ts:134`) and the Damaged tear roll (`run.ts:326`) all pull from it. In a live match both seats shop at the same time, so whoever clicks first changes the other's roll. Every random draw a seat causes must come from that seat's own stream. Rule of thumb: in a simultaneous phase, a seat's action only touches that seat's state and streams.

5. **Typed actions, one union, each with a seat.** The real types now live in `src/engine/match.ts` (landed 2026-11-17, uncommitted, function bodies still stubs) and that file is the source of truth, not this doc. Compared to the first sketch: one `buy {slot}` covers packs, collectibles and sleeves; a ripped pack sits in `shop.open` until `sortPack {toDeck: ids}` closes it; bet choices are `fold | forge | min | max | match`; `sellCollectible {slot}` exists; `LogEntry` is `{ seat, action, auto? }`. `Match.players` is `unknown[]` for now, and the server treats `Match` as opaque: it only passes through these functions and JSON.
   Card references are ids, never indexes into a hand (indexes shift; ids don't). `step` validates everything a hostile client could send (ids it doesn't own, locking 0 or 6 cards, betting out of turn) and **throws**. The server catches, rejects that one message, and counts it.

6. **Timeouts are actions, the engine has no clock.** The server owns time. When a timer runs out it calls `defaultAction(match, seat)` and steps it like anything else, logged with `auto: true`. The defaults are the Timers table in DESIGN.md: first offered box + autoDraft, auto-rip and keep the default sort, lock the pre-selected best hand, **Min then Match** on bets, autoKeep on the trait pick. Because the default is a normal logged action, replay never needs to know a timeout happened.

7. **Bot moves are logged actions too.** The server asks `botAction` and steps it like a human move. Replay then doesn't depend on the bot's code, so tuning `bot.ts` never breaks old logs.

8. **`view(match, seat)` is the only thing that leaves the server.** It's what makes hidden info real. It contains:
   - **Own seat:** hand, locked cards, display case, binder, sleeves, bankroll, shop offer. The pile and discard **sorted** (the deck viewer already sorts so it doesn't leak draw order; the view has to as well).
   - **Other seats:** name, bankroll, hand size, mulligan count, display case, sleeves, deck size, whether they're done with the current phase. Not their locked count, not their cards, not their pile.
   - **Betting:** both seats' choices so far, prices, what's legal for me, Peek (one rival locked card) only when the engine says I'm 2× behind, Marked knockoffs face-up.
   - **Showdown:** both played hands and appraisals. A fold or forge reveals nothing (it's a muck).
   - **Never:** the seed (for daily and ranked), any rng state, any other seat's hidden cards.
   - Events (count-up steps, pack rips) get the same filter via `to`.

9. **Determinism is tested.** One test plays a full match with bots, then checks `replay(config, log)` deep-equals the live match, and that the state survives a JSON round trip mid-match. One more checks a seat's `view` JSON contains no card id from another seat's hand or pile. That pair of tests is the "done when" for the refactor as far as the server is concerned.

10. **`result(match)`** gives placement per seat and the score. Solo/daily: margin × difficulty plus the bust bonus (Decisions log). BR: bust order.

11. **`legal(match, seat): Action[]`** enumerates every legal action for that seat right now. `step` checks actions directly with the same predicates, and a test asserts `step` accepts exactly what `legal` lists. Locking is at most 218 combos (1-5 of 8) and a mulligan at most 255, so plain enumeration is fine. The UI, bots, server and fuzz test all use it.

12. **Atomic step with invariants.** Clone, apply, `check(match)`, return. `check` throws if a card id is in two places or none, a bankroll is negative, or `pending` doesn't fit the phase. Keep it on in production: it costs little and it's what catches dupe bugs live.

13. **Fuzz test.** Seeded random-legal-move matches (2 seats and 10) run in `pnpm test`: no throws, `check` holds, `replay` matches, JSON round trip works, no view leaks. Keep the count small enough that `pnpm test` stays fast, and add a `--long` run for before deploys. Later, upgrade it to fast-check model-based tests (`fc.commands` driven by `legal`), which shrink a failing game down to the shortest action sequence that breaks it.

14. **Determinism rules for engine code.** No `Math.sin/cos/exp/log/pow` and friends (the spec doesn't pin their results, and V8 versions have differed); `Math.sqrt`, `floor` and integer math are fine. Money stays integers. Every sort breaks ties by card id. No `Map`, `Set` or `Date` in state. Same-build replay is what we rely on; cross-engine lockstep is not needed because clients never run the authoritative step.

15. **`engineVersion` everywhere.** On every match, log row and daily. `replay` throws on a mismatch. Old replays stay viewable from stored views or an archived build, never by keeping old rules in new code (Factorio's rule).


**Duel end (decided by Evan):** live duels and battle royale are bust only. Rounds past 12 need a rule; the proposal (decisions log) is sudden death, forced showdown with the ante doubling each round. The main session owns writing that into DESIGN.md.

## 3. Transport and match hosting

### Messages

One WebSocket per browser tab at `/ws`, authed by the session cookie on the upgrade request. JSON both ways, max message size 4 KB.

```ts
// client -> server
{ t: 'join', matchId, lastN }          // also the resume: server sends the view plus events after lastN
{ t: 'act', matchId, seq, action }     // seq: client counter, server ignores duplicates
{ t: 'ping' }

// server -> client
{ t: 'view', matchId, n, view, events, deadline } // n = action count, deadline = server ms epoch
{ t: 'reject', seq, reason }
{ t: 'pong', now }                     // lets the client correct clock skew for the timer
{ t: 'restarting' }                    // server going down, reconnect in a moment
```

The server sends the **full view** after every step. No diffs: a view is small, and full views mean a reconnect is "send the latest view", nothing to reconcile.

Pings every 25s keep idle sockets alive through Cloudflare, which drops idle WebSockets after a while (exact cutoff unverified for this account's plan, 25s is well under the usual one).

### Match actors

Each live match is one object in memory (`server/match.ts`) holding the `Match`, the action log length, the per-seat sockets, and one timer. It processes one action at a time (Node is single-threaded, so that's free). The flow for every action:

1. validate it's from a seat in this match, `step()` (throws = reject)
2. append `{ n, seat, action, auto }` to `match_actions` in Postgres and **wait for the write**
3. send each seat its `view` and its events
4. reset the timer from `phase()` and `pending()`

Writing before broadcasting means no player ever sees a state that isn't on disk.

Lobby pieces live in the same process:
- **Room codes:** 5 letters (no vowels, so no rude words), in memory, expire after 10 min unfilled. Host shares the link `https://<host>/r/BXKQT`.
- **Quick match:** a FIFO queue of players waiting for a 1v1. Two in the queue = a match. No rating yet.
- **Daily:** `POST /api/daily/start` makes a match with a bot seat and returns its id.

### Reconnect

The client keeps `matchId` in `sessionStorage`. When the socket drops it retries with backoff (0.5s, 1s, 2s, then every 5s) and sends `join` again. The server re-attaches the socket to that seat and sends the current view.

**Timers don't pause** for a disconnect. That's the Timers rule: an AFK player bleeds money through default actions, not the table's time. A friend who refreshes mid-bet loses at most one 10s decision.

### When a pod dies mid-match

- **Phase 0** (in memory, no Postgres yet): the match is gone. Clients show "server restarted, match lost". Acceptable for a few days of friends testing, and I'd rather say it plainly than pretend.
- **Phase 1 on:** on startup the server loads every match with `status = 'live'`, replays its log with `replay()`, and starts fresh timers with the full phase time. Clients reconnect into the same state. If the stored `engine_version` doesn't match the running one, that match is ended as **abandoned** (no result, no leaderboard entry) and logged loudly. Never replay a log on the wrong rules.
- **Deploys** send `{ t: 'restarting' }` on SIGTERM, then exit. With one replica a deploy is a few seconds of reconnect spinner, and matches resume from the log.

## 4. Data

### In memory only
Live `Match` objects, sockets, timers, the quick-match queue, room codes. All of it is rebuilt from Postgres or simply recreated after a restart.

### Postgres

```sql
players (
  id bigserial primary key,
  name text not null unique,            -- 3-16 chars, [a-z0-9_]
  kind text not null,                   -- 'guest' | 'account'
  pass_hash text,                       -- scrypt, null for guests
  created_at timestamptz not null default now()
)
sessions (
  token_hash bytea primary key,         -- sha256 of a random 32-byte token, the raw token only lives in the cookie
  player_id bigint not null references players,
  expires_at timestamptz not null
)
matches (
  id text primary key,
  mode text not null,
  config jsonb not null,                -- MatchConfig, includes the seed
  engine_version text not null,
  status text not null,                 -- 'live' | 'done' | 'abandoned'
  owner text,                           -- pod that runs it. one pod for now, the directory later
  lease_until timestamptz,
  result jsonb,
  created_at timestamptz not null default now(),
  ended_at timestamptz
)
match_seats (match_id text references matches, seat int, player_id bigint references players, primary key (match_id, seat))
match_actions (
  match_id text references matches,
  n int,                                -- 0, 1, 2... gap = bug
  seat int not null,
  action jsonb not null,
  auto boolean not null,                -- timeout default or bot
  at timestamptz not null default now(),
  primary key (match_id, n)
)
daily_best (
  day date, difficulty text, player_id bigint references players,
  match_id text not null references matches, -- the run that set it, so the best can be replayed
  score int not null,
  first_score int not null,             -- the first finished run of the day, the "skill" board
  attempts int not null,                -- every finished run counts, best or not
  achieved_at timestamptz not null,     -- tie-break: whoever got there first
  engine_version text not null,         -- one version per daily, pinned at day start
  primary key (day, difficulty, player_id)
)
```

- The **leaderboard is a query**, `daily_best` ordered by score, joined to `players` for the name and the guest tag. With one primary-key lookup per insert and an index on `(day, difficulty, score desc)` this is fine for a long time. Cache the top 50 in process for 10s if it ever matters.
- **Unlimited replays, best score counts** (Evan's call, 2026-11-17). Each finished run upserts `daily_best`: keep the higher score, always bump `attempts`, and never touch `first_score`. The board shows best with attempts next to it, and a second tab shows first-try scores, since memorizing the day's draws makes best-of-N partly a grind contest.
  ```sql
  insert into daily_best (day, difficulty, player_id, match_id, score, first_score, attempts, achieved_at, engine_version)
  values ($1, $2, $3, $4, $5, $5, 1, now(), $6)
  on conflict (day, difficulty, player_id) do update set
    attempts = daily_best.attempts + 1,
    score = greatest(daily_best.score, excluded.score),
    match_id = case when excluded.score > daily_best.score then excluded.match_id else daily_best.match_id end,
    achieved_at = case when excluded.score > daily_best.score then now() else daily_best.achieved_at end
  ```
- **One engine version per day.** A deploy mid-day doesn't change that day's daily; it switches at the next UTC midnight. If a rules hotfix can't wait, that day's board gets a note.
- **Commit, then reveal.** At day start the board shows `sha256(seed)`. At day end it shows the seed, so anyone can check the deals were fair by replaying offline. Live match seeds come from `crypto.randomBytes`, not `randomSeed()` (that uses `Math.random`, fine for solo only).
- **Daily seed** = `hmac(DAILY_SECRET, 'YYYY-MM-DD')` in UTC. It can't be predicted from the date, so nobody pre-sims tomorrow from home. Replays mean players learn the day's draws by playing, which is fine: that's the game now. What the secret seed still blocks is an offline solver searching thousands of lines with no server in the loop.
- **Migrations** are plain numbered `.sql` files in `server/migrations/`, applied at startup inside a transaction, tracked in a `schema_migrations` table. No ORM.

### Accounts and guests

- **Guest:** first visit makes a `players` row with `kind = 'guest'` and a name the player picks (or `guest-xxxx`), plus a session cookie. Guests can play everything, and show on the leaderboard tagged **guest**.
- **Account:** username + password. "Claim this guest" = set a password on the existing row, so history carries over.
- Passwords: `crypto.scrypt` with a random salt. No email, so no password reset for now. Say so on the signup form.
- Cookie: `httpOnly`, `Secure`, `SameSite=Lax`, 30 days.

## 5. Kubernetes layout

### What the cluster is (checked 2026-11-17, read-only, over `ssh precision01`)

| Thing | What's there |
|---|---|
| Distro | k3s v1.36.4, control plane on `precision01` |
| Nodes | `precision01`-`04` (amd64, Ubuntu 22.04), a desktop (amd64, Ubuntu 24.04), a Raspberry Pi 5 (**arm64**) |
| Storage | `local-path` is the default StorageClass. Volumes live on whichever node the pod lands on first |
| Ingress | Traefik (k3s default), LoadBalancer on the precision nodes' LAN IPs. No Ingress objects yet |
| Tunnels | cloudflared runs **on the hosts**, not in the cluster: a systemd unit on precision01 (Pterodactyl, token file) and a process on precision03 (probably Life Dial) |
| Registry | none (no `registries.yaml`, no registry pod) |
| Metrics | `metrics-server` only. No Prometheus or Grafana |
| Other apps | namespace `hermes`, otherwise empty |
| kubectl | on precision01, not on the laptop. Laptop has docker |

Free memory isn't an issue: the precision nodes sit at 23-50% memory and ~1-3% CPU.

### Resources (namespace `flambeur`)

```
deploy/k8s/
  namespace.yaml
  app.yaml          Deployment + Service: flambeur
  postgres.yaml     StatefulSet + Service + PVC: flambeur-db
  backup.yaml       CronJob: nightly pg_dump
  cloudflared.yaml  Deployment: the flambeur tunnel
```

**Every pod gets a `nodeSelector`.** The Pi is arm64, so an amd64 image scheduled there fails to start. For Phases 0-1 the app and Postgres are both pinned to `precision02` (`kubernetes.io/hostname: precision02`, lowest memory use of the precision nodes). Pinning is also what makes the no-registry deploy below work. If precision02 is down, Flambeur is down. That's fine for a homelab demo, and Phase 3 drops the pin.

Plain YAML, applied with `kubectl apply -f deploy/k8s/`. No Helm chart for one app.

**`flambeur` Deployment**
- `replicas: 1`, `strategy: Recreate`. Two pods at once would split the in-memory queue and rooms, so a deploy stops the old pod before starting the new one.
- One image serves everything on port 8080: the Vite build as static files, `/api/*`, `/ws`. Splitting static files out is a later problem.
- Image: `node:24-slim` base, `pnpm build` output + `server/` + prod deps. Runs `node server/main.ts` (type stripping, same as the sim).
- Requests `100m` CPU / `128Mi`, memory limit `512Mi`. Starting numbers, not measured.
- Probes: `GET /healthz` (liveness: process answers) and `GET /readyz` (readiness: Postgres answers and migrations ran).
- `terminationGracePeriodSeconds: 30`, SIGTERM handler sends `restarting`, closes sockets, exits.
- Env from a ConfigMap (`PUBLIC_URL`, `LOG_LEVEL`) and a Secret (`DATABASE_URL`, `DAILY_SECRET`).

**`flambeur-db` StatefulSet**
- `postgres:17`, one replica, a 5Gi PVC on `local-path`. local-path means the data is a folder on precision02's disk, so the pod can never move to another node. The pin makes that explicit instead of a surprise.
- Secret `flambeur-db` holds the password. Created by hand with `kubectl create secret`, never committed.
- `backup.yaml`: nightly `pg_dump` CronJob pinned to precision03, writing to a `local-path` volume there (off the db's node), keeping 14 days.
- Not an operator like CloudNativePG yet: it's a framework for a problem one Postgres pod doesn't have.

**Edge**
- **A new tunnel just for Flambeur, with cloudflared running in the cluster.** The existing tunnels are host services tied to Pterodactyl and Life Dial, and I'd rather not touch them. The agent creates a tunnel named `flambeur` through the Cloudflare API (token on precision01, see the decisions log), routes `flambeur.example.com` -> `http://flambeur.flambeur.svc.cluster.local:80`, and puts the tunnel token in a Secret. `cloudflared.yaml` runs it (2 replicas, it's stateless; the image is multi-arch so the Pi is fine).
- Traefik isn't in the path. The tunnel talks to the Service directly, so there's no Ingress object to keep in sync.
- TLS ends at Cloudflare. Inside the cluster it's plain HTTP.
- WebSockets work through tunnels with no extra config. The 25s ping covers idle timeouts.

**Images**
- Built on the laptop with `docker build --platform linux/amd64`, tagged `flambeur:<git short sha>`.
- **No registry for Phases 0-1.** The image is piped straight into precision02's containerd, and the Deployment uses `imagePullPolicy: Never` plus the precision02 pin. No registry to run, no pull secret. Phase 2 (CI) moves to GHCR, because CI can't pipe into a node.
- Not tested yet: `sudo k3s ctr images import` on precision02.

### Deploy

```bash
docker build --platform linux/amd64 -t flambeur:$(git rev-parse --short HEAD) .
```

```bash
docker save flambeur:$(git rev-parse --short HEAD) | ssh precision02 sudo k3s ctr images import -
```

```bash
ssh precision01 kubectl -n flambeur set image deploy/flambeur app=docker.io/library/flambeur:$(git rev-parse --short HEAD)
```

```bash
ssh precision01 kubectl -n flambeur rollout status deploy/flambeur
```

(containerd names an imported `flambeur:abc123` as `docker.io/library/flambeur:abc123`.) These steps are now `deploy/deploy.sh` (it builds the client, the image, imports it, applies every manifest but the secrets, and waits for the rollout).

Rollback is `kubectl -n flambeur rollout undo deploy/flambeur`. A rollback can change `ENGINE_VERSION`, in which case live matches end as abandoned (section 3). Don't deploy mid-friends-match.

**CI later (Phase 2):** GitHub Actions runs `pnpm test`, `tsc`, the determinism test, builds and pushes the image. Deploy stays a manual `set image` until a tool like Flux earns its keep.

### Observability and debugging

- **Logs:** one JSON line per thing that matters, to stdout: server start, match start/end (id, mode, seats, result), rejected action (match, seat, reason), timeout default taken, reconnect, errors with stack. `kubectl -n flambeur logs -f deploy/flambeur`.
- **Metrics:** a hand-written `/metrics` in Prometheus text (live matches, connected sockets, actions/s, rejects, step time p50/p99), no client library. The cluster has no Prometheus, so this waits until Phase 2 and comes with a small Prometheus + Grafana in its own namespace. Until then, `kubectl top pod` (metrics-server is there) and the logs.
- **The best debugging tool is the log.** Any match can be pulled from Postgres and replayed locally, step by step, on the same engine: a small `sim/replay.ts <matchId>` that reads the log (via `kubectl port-forward` to the db) and prints each step. A bug report from a friend = a match id.
- Poking: `kubectl -n flambeur port-forward svc/flambeur-db 5432` then `psql`, and `kubectl -n flambeur exec -it deploy/flambeur -- sh`.

## 6. Phases

The new engine core (`match.ts`, section 2) is the critical path. The server can be written against the contract in parallel, but nothing plays end to end until `step`, `view`, `legal` and `defaultAction` exist. The engine half of Phase 0 is the main session's job.

### Built so far (2026-11-17)

- **Live** (the `flambeur.example.com` hostname in this doc is a placeholder, not the real one). The `flambeur` namespace on k3s has the app and Postgres pinned to precision02, 2 cloudflared replicas, and the nightly backup CronJob on precision03. The tunnel, its route, the DNS record and the secrets were created by script; the secrets never left the cluster.
- **Server:** `server/` (`app.ts` http + ws, `actor.ts` match actor, `lobby.ts` rooms/queue/daily/recovery, `auth.ts`, `db.ts`, `migrations/`). Client: `src/net.ts`. Postgres went in from the start instead of an in-memory Phase 0, since the engine wasn't playable yet anyway.
- **Checked:**
  - `pnpm test:server` passes 8/8 against a real Postgres with a toy engine: 401 without a session, a room-code duel with per-seat views and a rejected illegal move, the log on disk, daily best/first/attempts, an AFK timeout playing the default, restart recovery from the log, the same login error for a wrong name or password, no future-day board, and a foreign Origin refused.
  - Over the public tunnel with the real engine (partly built), two guests made a room, joined, and each got their own draft view with 45s clocks.
- **Real engine, end to end (local Postgres):** a full daily against the bot over the WebSocket, with the human playing random legal moves at human speed. The server restarted at action 40, the match was recovered with an identical view, and it finished, was marked done, and its score landed on the board.
- **Hardened after a fresh-context review:**
  - the daily seed can't leak through the board's `day` parameter
  - every live match is recovered after a pod change, and a match that died right after its last action is finished on recovery
  - timeout and bot moves are picked inside the queue from the state they apply to
  - a failed auto move re-arms the clocks
  - saving a result can't eat the final view
  - logins count attempts before the slow hash, with per-IP limits on every scrypt path
  - a foreign `Origin` is refused
  - a bad URL is a 400
  - backups are `pg_dump -Fc`
  - starting a new daily ends your unfinished one; live matches are capped at 3 per player
  - NetworkPolicies let only cloudflared reach the app and only the app and the backup job reach Postgres. Checked on the cluster: a stray pod in the namespace is refused, and a manual backup wrote a dump on precision03.
- **Accepted for now:** every opponent action bumps the `n` a seat sees, so a seat can count how many shop actions its rival made. Mulligans and hand size are public anyway, and a lock is one action no matter how many cards it holds.
- **Not done:** the UI doesn't use `src/net.ts` yet (main.ts belongs to the engine session), so the live site still serves the last committed solo client. Battle royale lobby isn't built. No load test yet.

### Phase 0: friends live (target Wed Nov 18)

- Engine: `match.ts` with the phase machine, `step`, `view`, `legal`, `check`, and the fuzz + replay tests passing. The solo UI drives `step()` too.
- `server/`: HTTP + `/ws`, match actors **in memory**, room codes, quick-match queue, timers with default actions, bot seat.
- Guest-only identity: a name and a random token in `localStorage`. No Postgres yet.
- Client: `src/net.ts` (socket, reconnect, send intents), and the UI renders from `view` instead of from `Run`. Vite dev proxies `/api` and `/ws` to the server on 8787.
- Deploy to the cluster: namespace, Deployment + Service pinned to precision02, the `flambeur` tunnel.
- Pod death = matches lost. Known and accepted.

**Done when:** two people on different networks open `flambeur.example.com`, one makes a room, the other joins by code, and they play all 12 rounds to a result. Two others find each other through quick match. Neither browser's devtools (Network tab, WebSocket frames) shows the other player's cards before a showdown. `pnpm test` runs the fuzz test clean.

### Phase 1: dailies, accounts, leaderboard (target Thu Nov 19, shown at the demo Fri Nov 20)

- Postgres StatefulSet, migrations, action log written before broadcast.
- Accounts (username + password) and guests in `players`, session cookies.
- Server-run daily with the HMAC seed, unlimited replays with best score kept, leaderboard page with guest tags.
- Crash recovery: live matches replay from the log on startup.
- Rate limits and per-account login throttling (section 7).
- Lock in the hard-to-reverse choices before the first public daily: opaque match ids, sfc32 + stream hashing, `engineVersion` on every match/log/daily, `lastN` resume in the protocol, daily rules (UTC day, `achieved_at` tie-break, first-try + best, one version per day).
- If Thursday slips, cut crash recovery, not the list above. Recovery can be added later to logs that were versioned correctly. It can't be added to logs that weren't.

**Done when:** I play the daily as an account and a friend plays it as a guest, both show on the leaderboard (theirs tagged guest), a better second run replaces my score and a worse one doesn't, and `kubectl delete pod` in the middle of a friends match comes back to the same state after reconnect.

### Phase 2: battle royale

- Engine: N seats, per-round pairing, all pairs bet in parallel (contract item 1).
- Server: a BR lobby that fills to 10 with a countdown, bots fill empty seats; eliminated players stay as spectators (spectator betting is its own later piece).
- CI in GitHub Actions, images move to GHCR, the precision02 pin on the app goes away (Postgres stays pinned while it's on local-path). `/metrics` with a small Prometheus + Grafana.
- Load script: N fake clients playing defaults against the real server, to find how many matches one pod actually holds. Today that number is unknown and I'm not guessing it.

**Done when:** 10 seats (some real friends, rest bots) play a BR to one survivor, every pair's betting runs in parallel, and the load script reports a measured matches-per-pod number.

### Phase 3: path to big scale

Only when the Phase 2 measurement says one pod isn't enough. Nothing here needs a rewrite, because matches are already actors with a durable log.

- **Many game pods, one directory row.** A StatefulSet (`flambeur-0`, `-1`, ...). The owner lives only in `matches.owner` + `lease_until` (renewed every few seconds), read through one `findOwner(matchId)` function. The client asks `/api/match/<id>` where to connect and gets back a pod path like `/ws/2`, routed by cloudflared/ingress rules to that pod. Colyseus, Agones and Discord all look the owner up rather than baking it into the id, and a lookup is what lets a match move.
- **Failover is the same code as Phase 1 recovery:** a pod takes expired leases and replays those logs. The match keeps its id; only the directory row changes, and clients re-ask where to connect on reconnect.
- Add the `owner` / `lease_until` columns in Phase 1 already (one pod just always owns everything), so this step is additive.
- **Lobby leaves the game pods:** queue and rooms move to Postgres (`select ... for update skip locked`) or Redis, whichever measurement says. That's the first time Redis earns a place.
- **Drain on deploy:** on SIGTERM a pod stops taking new matches and exits once its matches end. Kubernetes kills a pod 30s after SIGTERM by default, and a 12-round match runs several minutes, so the grace period goes up to ~20 minutes. With lease failover in place, a shorter grace also works: the pod exits and another one replays its matches.
- **Static files** to Cloudflare's cache or Pages, so game pods only do sockets.
- **Postgres:** a managed one or CloudNativePG, and finished matches' logs move to cheap storage after N days.

**Done when:** killing any one game pod during a load test loses no matches, and adding a pod raises capacity without touching live matches.

## 7. Cheating and abuse basics

What a cheater would actually try, and what stops it:

| They try | What stops it |
|---|---|
| Read the rival's hand or locked cards from devtools | The server never sends it. `view` is the only output, and the view-leak fuzz test guards it |
| Read their own upcoming draws | Own pile is sent sorted. Seed and rng state never leave the server |
| Send a fake action (bet out of turn, lock a card they don't own, buy with money they don't have) | `step` only accepts what's in `legal(match, seat)`. Anything else is rejected, logged, counted |
| Send a fake score or bankroll | There's no message for it. Every number comes from the engine on the server |
| Pre-sim the daily offline | The seed is an HMAC of the date with a server secret, revealed only after the day ends |
| Retry the daily until it's good | Allowed on purpose: unlimited replays, best counts. Attempts are shown on the board |
| Script the server to grind the daily (a bot playing thousands of runs) | Rate limit daily starts per player and per IP (loose, tuned from real play), and the action log keeps every run for later review |
| Collude in a 1v1 (feed chips to a friend) | Nothing to win yet: friend rooms are unranked, quick match has no rating, no trades. Watch it if BR gets ranked |
| Bot the game (script perfect play) | Not stopped, and not worth stopping yet. The action log makes it findable later (inhumanly fast, perfect timing) |
| Hammer login or flood sockets | Rate limits below, Cloudflare in front |

The rules behind that table:

- **The server is the only authority.** Clients send intents. Every number that matters (bankroll, prices, draws, appraisals, results) is computed by the engine on the server. A client never sends a score, an amount or a card it claims to have.
- **Views, never state.** The full `Match` is never serialized to a client. The view test (contract item 9) guards against leaks, and the own pile is sorted so even your own draw order stays hidden.
- **Reject loud.** An illegal action throws, gets a `reject`, gets logged with the match and seat. 20 rejects in a match closes that socket (a normal client almost never sends one).
- **Dailies:** secret HMAC seed revealed after the day, server-run, unlimited replays with best score counted, attempts shown.
- **No real money anywhere,** no trades (already decided, collusion), friend rooms are unranked, and quick match has no rating yet, so colluding wins nothing. If BR gets a ranked mode, two friends throwing chips to each other becomes the abuse to watch.
- **Rate limits** (in process, per IP and per player; numbers are starting points to tune from real traffic):
  - failed logins counted **per account**, with growing back-off, same error and timing for a wrong name or a wrong password (OWASP). Per-account counting is also what keeps the demo working: a room of judges on one KSU wifi IP doesn't trip anything
  - account creation: a loose per-IP limit only
  - passwords: at least 8 characters, no composition rules (OWASP; 15 is their bar without MFA, which is a lot to ask of a game)
  - daily starts: per player and per IP, loose, so a script can't grind the board through thousands of guests
  - socket messages: a small token bucket, about 10/s sustained
  - max 4 KB per message, max 3 open sockets per player
  - Cloudflare in front for floods
- **No admin endpoint that shows match state, ever.** The Absolute Poker scandal was insiders with a "superuser" view of hole cards. Debugging goes through `sim/replay.ts` on a port-forward, offline, never served.
- **Names:** 3-16 chars, `[a-z0-9_]`, unique, a short blocklist. Guests can't take a name an account owns.
- **Timing:** bots answer after a short fixed delay, and the server only tells the rival "locked" yes/no, never how many cards.

## Why not the alternatives

From the 2026-11-17 research pass. The full report with sources is a research note, not in the repo.

| Option | Why not, for now |
|---|---|
| Deterministic lockstep | Clients would need the seed, and the seed is every future deal plus the rival's hand |
| Mental poker / crypto shuffles | The papers themselves report long, unpredictable delays per shuffle |
| Clients replay actions themselves (Swords & Ravens style) | Needs the seed on the client. Its good idea, an event list for animation, is already in the plan |
| Colyseus 0.18 | Its state sync (StateView) duplicates `view()` and has open desync bugs. No crash recovery outside dev mode. ~88 packages. Multi-process needs Redis and a public address per process. Its matchmaking is good, but ours is small |
| Nakama | Its TypeScript runtime is ES5 on goja, and clustering is the paid tier |
| Bun / uWebSockets.js | ~1.1-1.7× Node+ws in an independent 2026 test (the "7×" is Bun's own old benchmark). Not the bottleneck, and uWS is a native addon that needs an arm64 build for the Pi |
| Elixir/BEAM, Orleans | Means writing the rules twice |
| Rust/Go engine as WASM | Measured slower at the JS boundary in published ports, and the engine isn't compute-bound |
| Cloudflare Durable Objects | One object per match fits perfectly and would run the engine unchanged. It means leaving the homelab and locking into one vendor (Hathora shut down in May 2026, taking games with it). It's the most credible "very big" escape hatch, so keep the engine runtime-agnostic and don't build for it now |
| Redis, NATS, Kafka | Flambeur's whole load is ~10-50 log writes/s at 1,000 matches. Postgres covers queue, log and leaderboard until a measurement says otherwise |

## Still open

Every decision is made (decisions log at the top). What's left is only what measurement or a first try settles:

| Unknown | How it gets settled |
|---|---|
| Can the precision01 Cloudflare token create tunnels and DNS records? | First try during the build. If not, a handoff with the dashboard steps |
| Does `sudo k3s ctr images import` work on precision02? | First deploy |
| Rules for rounds past 12 in a bust-only duel | The main session writes it into DESIGN.md (sudden-death proposal above) |
| Unknowns only measurement settles | Matches per pod, real view size, Postgres commit rate on the homelab disk, Cloudflare's idle timeout (only a third-party ~100s figure). The Phase 2 load test answers the first three |
