# Flambeur: balance fix + what makes Balatro stick

Nov 16 2026. Part 1 is the cautious-bot problem with sim numbers. Part 2 is the research. Part 3 maps it onto what we haven't built yet.

## 1. Why cautious wins

**Doing nothing is break-even.** Every round you get paid whatever you did:

| Source | Per round |
|---|---|
| Paycheck | $2 |
| Interest (cautious sits at ~$20) | $2 |
| Free pack, 3 plain cards sold at $1 | $3 |
| **Total** | **~$7** |

Antes go 2, 3, 4, 5, 6, 8, 10, 12, 15. So folding or forging every hand **makes** money through round 5. Cautious only loses money in rounds 7–9, and by then it has banked enough.

**Forging is free deck thinning.** Cautious forges 87% of hands in round 1. Each forge costs only the ante and removes cards, so the deck drops to 12 supercards (final deck p50 = 13). From then on it only shows down with quads and full houses: about 20% wins and 3% losses per round. That's Slay the Spire's card removal (75g, +25g each time) at ante price.

Greedy has the opposite problem: it buys packs, its deck bloats (p90 = 61 cards) and its best cards rarely come up.

## 2. Sim experiments

Classic box, 600 runs per policy, seed `sim`. These ran in a scratch copy, so **nothing in `src/` has changed yet**.

| Change | greedy | cautious | random |
|---|---|---|---|
| baseline | 47.8 | **64.5** | 22.3 |
| deck floor 16 | 45.7 | 56.7 | 22.5 |
| forge costs the Max stake | 16.0 | 43.8 | 10.3 |
| tournament rounds (3/6/9) can't fold | 32.5 | 44.5 | 15.5 |
| paycheck only on showdown | 30.0 | 35.5 | 10.8 |
| free pack plain cards sell for $0 | 7.3 | 22.3 | 2.0 |
| paycheck on showdown + house pays 1× ante on a win | 36.8 | 36.7 | 12.0 |
| paycheck on showdown + house pays 2× ante on a win | **42.2** | **37.5** | 13.0 |
| **the line above + deck floor 16** | **38.0** | **28.8** | 13.8 |

What the table shows:

- **Taxing folds hurts everyone.** Selling free cards for $0 or making forge cost the Max takes greedy down with cautious.
- **Paying for showing down works.** It's Balatro's model: blind rewards are most of your income, and interest is a capped bonus on top. It's the first change where greedy beats cautious.
- **The floor at 16** stops cautious from shrinking to 12, and greedy barely notices.

The same recommended combo on other boxes (greedy / cautious):

| Box | baseline | recommended combo |
|---|---|---|
| Bargain | 66.0 / 76.5 | **61.8 / 47.7** |
| High Roller | 59.7 / 76.7 | **55.3 / 46.7** |
| Forge Box | 58.2 / 88.5 | **50.2 / 54.0** |

Forge Box is still slightly cautious-favoured because of its starting Forge Hammer. Its twist needs a follow-up.

**Recommendation:**

1. **Paycheck only on showdown.** Fold/forge rounds pay nothing, the same reason a fold already resets your streak.
2. **The house pays the winner 2× ante.** This is the blind reward.
3. **Deck floor 16.** This also fixes Thin Binder: set its threshold to about 18.
4. **Win rates drop about 10 points overall.** Win back the difficulty by easing the blinds, not by bringing passive income back.

Still open:

- **Greedy deck bloat** (p90 = 70+). Make packs keep 1–2 cards, Balatro pick-1-of-N style.
- **Forge Box twist.**
- **`REF_SCORE` recalibration** after the change lands.

## 3. What the research says

### Balatro

- **Short, combinable effects.** LocalThunk aims for joker text of about 4 lines and 20 words. The complexity is in combinations, not in individual cards. Broken combos are fine; the problem is an easy, repeatable strategy that stops exploration. ([Game Informer](https://www.gameinformer.com/interview/2024/03/21/balatro-was-almost-called-joker-poker-and-other-details-from-its-creator))
- **Watch your machine run.** The final score is hidden on purpose so you build a "Rube Goldberg machine" and watch it go. Rising sounds, shaking multipliers and burning numbers turn arithmetic into a payoff. The cost: optimizers start doing homework. ([GMTK "Balatro's Cursed Design Problem"](https://www.youtube.com/watch?v=zk3S3o1qOHo), [podcast transcript](https://sozai.app/transcript/balatro-creator-localthunk-inspirations-jokers/))
- **Interest has a cap.** It's $1 per $5, capped at $5, so saving past $25 does nothing. Meanwhile blind targets go from 300 to 50,000 across 8 antes. **Saving can never replace scoring power.** That's exactly what's broken in our economy. ([interest](https://teemo.dev/game-design/balatro/wiki/mechanics/interest/), [blinds](https://teemo.dev/game-design/balatro/systems/hands-blinds-and-scoring-reference/))
- **Bosses test dependencies.** The Plant debuffs face cards; The Needle gives you one hand. The boss is shown ahead of time so you can prepare.
- **Upgrades multiply.** Baron alone with four Kings is ×5. Add Mime and it's ×25. One new piece re-values everything you already own, and that's the "run breaks open" moment.
- **Familiar poker frame.** Players already know the hands, so the learning cost is near zero. Balatro is played on 5M+ devices ([Playstack](https://www.playstack.com/news/balatro-5-million-copies-sold/)).

### Slay the Spire and other deckbuilders

- **Every card should have a place.** Cards are situational rather than ranked, and balance comes from telemetry plus watching experts. "Data is evidence, but not a conclusion." ([Giovannetti, GDC 2019](https://media.gdcvault.com/gdc2019/presentations/Giovannetti_Anthony_SlayTheSpire.pdf))
- **Removal is priced and limited.** It's once per shop and gets more expensive each time. That's what our free forge-thinning is missing. ([Merchant](https://slaythespire.wiki.gg/wiki/The_Merchant))
- **Elites are opt-in risk.** You trade HP now for a guaranteed relic. Skipping them is safe but leaves you weaker later. ([map](https://slaythespire.wiki.gg/wiki/Map_Locations))
- **Stalling is punished locally.** Gremlin Nob gains Strength when you play Skills, so turtling fails against specific enemies without banning defensive builds.
- **Low win rates are fine.** StS1 population win rate is 9% at A0 ([Mega Crit](https://www.megacrit.com/news/2026-5-22-neowsletter-issue-22/)). Ascension levels give experts a ladder.
- **Simplicity survives.** Cobalt Core cut currency entirely ([Game Developer](https://www.gamedeveloper.com/design/how-cobalt-core-makes-movement-as-exciting-as-fighting-in-its-roguelike-deckbuilder-combat)).
- **Persistent mysteries.** Inscryption gives you reasons to start another run beyond winning ([Game Developer](https://www.gamedeveloper.com/design/how-game-jam-sacrifices-became-inscryption)).
- **Shareable runs.** Monster Train's run links turn discoveries into something players exchange.

### The psychology, honestly

- **Agency drives replay more than rewards do.** Autonomy and competence predict enjoyment and wanting to play again ([Ryan, Rigby & Przybylski 2006](https://selfdeterminationtheory.org/SDT/documents/2006_RyanRigbyPrzybylski_MandE.pdf)).
- **Near-misses need control.** They raise the urge to continue, but only when the player felt in control ([Clark et al. 2009](https://motivation.site.wesleyan.edu/files/2016/06/Clark-2009-Neuron1.pdf)).
- **Rarer rewards make people persist longer** after rewards stop ([James et al. 2016](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2016.00046/full)).
- **Not proof of addiction.** These are gambling and lab studies, not evidence that deckbuilders are addictive. The useful lesson: random rewards hook people, but **choices that matter** keep them.

### Market

The genre is crowded: Steam roguelike deckbuilder releases went from 143 to 224 in a year, and the top titles take most of the revenue ([GameDiscover](https://newsletter.gamediscover.co/p/why-did-this-excellent-roguelike), [How To Market A Game](https://howtomarketagame.com/2026/01/27/what-the-hell-happened-in-2025/)). The ones that break out have a hook you can explain in one sentence. Ours is "rip packs, gamble on your hand."

## 4. What to build, in priority order

1. **The economy fix from section 2.** Saving gets a cap and showing down pays. This is the core loop.
2. **Tournament rounds as boss blinds.** We already have Sealed Only, Face Cards Don't Score, Ban Wave and High Stakes.
   - Show the next one **in the shop before it happens**, so the shop becomes preparation.
   - Make the rounds no-fold. That lands about −13 points on cautious by itself.
3. **The pack rip is our Rube Goldberg moment.**
   - Reveal cards one at a time, with rarity rising through tone and shake.
   - Show the god pull last.
   - This is Flambeur's version of Balatro's scoring count-up, and the thing nobody else in the genre has.
4. **Visible near-misses.** At showdown, show the margin ("lost by 40").
   - After a fold, flash what the rival had and what you would have scored.
   - It's a near-miss the player controlled, which is exactly the kind that makes them want to retry.
5. **Pick 1–2 from each pack** instead of keeping everything. This fixes greedy bloat and turns every pack into a decision rather than a pure loot drop.
6. **Collectible combos that multiply.**
   - Keep text short: 20 words or less.
   - Make sure at least a few pairs multiply each other (retriggers × Signed, Grade sources × each other) so runs can break open.
7. **An opt-in risky table, like StS elites.**
   - Before a round, choose "High Roller table": a tougher rival, but a guaranteed rare collectible or Collector pack.
   - Cautious players skip it and pay for it later.
8. **Meta layer: Stakes plus a Binder.**
   - **Stakes:** an ascension-style ladder per starter box.
   - **Binder:** a collection page that fills with every card, finish and stamp you've ever pulled. It suits a trading-card game perfectly and gives a reason to run again even after a loss. Cosmetics unlock from it.
9. **Shareable seeds.** We already have dailies; add a share button.

**Ethics note for the pitch:** all of this stays in-game. There's no real money, and nothing is bought, only unlocked. Judges will ask, and "gacha feel without gacha monetization" is a strong answer.
