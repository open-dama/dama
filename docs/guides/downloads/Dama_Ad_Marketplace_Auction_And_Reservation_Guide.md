# Dama - Ad Marketplace Bible (Day-one plain English)

This guide is for someone on their **first day**.
You do not need advertising experience. You do not need coding knowledge.

How to use this file:
1. Read **Section 1** (big picture).
2. Read **Section 4** (buying types end to end). This answers most confusion.
3. Use **Section 3** whenever a word is unclear.
4. Use **Section 12 FAQ** and **Section 13 cheat sheet** as quick lookup.

Screen button text may differ slightly because labels come from the database.

Companion guides:
- Ads day-to-day ops: `Dama_Ads_And_Admin_Ops_Guide`
- Whole product map: `Dama_Complete_App_Guide`

Regular hyphens only.

---

## 1. Read this first (the whole idea in one story)

Imagine Dama is a busy game hall.

Players sit at tables and play.
An **ad** is a short poster or video that can appear:
- in the **lobby** (around play), or
- **in a live match**,

when rules allow.

A **campaign** is your one advertising job: creative, where it can show, schedule, and money limits.

### Money always has two different buckets
1. **Create fee** = one-time setup payment when you successfully create the campaign (like opening a stall).
2. **Daily media budget** = the most that campaign may use **today** for views (like a daily spending limit for the stall). These are not the same thing.

### Three ways to agree the price of a view
| Way | Everyday picture | One line |
|-----|------------------|----------|
| **Standard** | Fixed menu price | Platform sets one flat price per view |
| **Auction** | Bidding at a market | You set the most you will pay per view; you compete for busy slots |
| **Reservation** | Booking a VIP table | You lock a fixed price per view, or buy a ready-made **package** |

**Marketplace** is the admin switch that turns on Auction and Reservation for **new** campaigns.
When Marketplace is off, new campaigns use Standard only.

Fairness rule in one sentence:
Dama does not tax a company for "looking rich." Dama sells better / busier / scarcer attention, and lets brands compete when they want the same eyes.

---

## 2. Who should read which part

| You are... | Read these sections |
|------------|---------------------|
| Brand or person creating ads (publisher) | 1, 3, **4**, 5, 6, 7, 8, then **12** and **13** |
| Admin / operator | 1, 3, **4**, 10, 11, then **12** and **13** |
| Support answering tickets | 3, **4**, **12**, **13** |

Where publishers work: Ads on **web** and **Flutter** (same rules).
Where admins work: **Admin Console** → Progression (money switches) and Ads (campaign Buying summary).

Players who only play never fill bid or package fields. They only see the creative.

---

## 3. Full term cards (what / why / advantage / difference)

Each card answers: What is it? Why do we need it? Advantage? How is it different from nearby words?

### Campaign
- **What:** One advertising job with creative, targeting, schedule, and money limits.
- **Why we need it:** Without a campaign there is nothing to schedule or measure.
- **Advantage:** Keeps one brand effort clean and pause-able.
- **Different from:** A single **view** (one show) or a **package** (a pricing offer you can attach at create).

### Create fee
- **What:** One-time wallet charge when create succeeds.
- **Why:** Covers setup / access to run ads; can differ by Ethiopia vs global.
- **Advantage:** Simple upfront cost; create fails cleanly if wallet is short.
- **Different from:** **Daily media budget** (ongoing daily limit for views) and **flight fee** (extra package setup added into create payment).

### Daily media budget (daily spend cap)
- **What:** Max media money that campaign may use per day for views. Required and greater than zero.
- **Why:** Stops one campaign from spending without a daily limit.
- **Advantage:** Publisher controls burn rate.
- **Different from:** Create fee (once) and period **view caps** (count of views, not money).

### View (impression)
- **What:** One counted time the ad actually showed under the rules.
- **Why:** This is the unit of attention you are buying.
- **Advantage:** Clear counting for analytics and invoices.
- **Different from:** A click (someone tapped) or a campaign (the whole job).

### Marketplace
- **What:** Admin on/off for Auction / Reservation on new campaigns.
- **Why:** Lets Dama move from one flat price to competition + VIP locks when the market is ready.
- **Advantage:** More ways to price scarce attention; Standard remains when off.
- **Different from:** Buying type (the choice on one campaign). Marketplace is the master switch.

### Buying type
- **What:** How this campaign agrees to pay for views: Standard, Auction, or Reservation.
- **Why:** Different brands need either simplicity, flexibility, or certainty.
- **Advantage:** One clear deal per campaign (locked after create).
- **Different from:** Floor (minimum price) or package (optional Reservation offer).
- **Full deep dive:** Section 4.

### Floor price
- **What:** Lowest allowed max bid or reserved rate right now.
- **Why:** Protects inventory value; can rise by country, peak hours, or busy fill.
- **Advantage:** Stops unrealistically low offers from winning scarce slots.
- **Different from:** Your bid/rate (must be ≥ floor). Floor is the minimum gate, not your offer.

### Max bid
- **What:** Auction only. Highest you will pay per view.
- **Why:** You compete without writing a blank check above your number.
- **Advantage:** Flexible; good when demand changes.
- **Different from:** Reserved rate (fixed lock) and floor (minimum).

### Reserved rate
- **What:** Reservation without a package. Fixed price per view you type yourself.
- **Why:** Certainty when you do not want a catalog package.
- **Advantage:** Predictable planning.
- **Different from:** Max bid (ceiling for competition) and package fixed rate (admin catalog sets it).

### Package
- **What:** Admin ready-made offer: fixed rate, optional flight fee, placement, min advertiser level, optional exclusivity.
- **Why:** Sell premium moments (cup finals, season, category exclusivity) as clear products.
- **Advantage:** Faster buy; clearer premium; less guessing.
- **Different from:** Typing your own reserved rate; different from Auction (no package on Auction create).

### Flight fee
- **What:** Extra package setup money, added into the create-fee debit.
- **Why:** Some premium packages need an upfront package charge beyond the normal create fee.
- **Advantage:** Clean prepaid package economics.
- **Different from:** Create fee base and daily media budget.

### Exclusive package
- **What:** Only one active campaign may hold that exclusive slot/category.
- **Why:** Brands pay more for "only us in this category / moment."
- **Advantage:** Real scarcity and sponsorship-style value.
- **Different from:** Normal package (many campaigns may buy non-exclusive offers if rules allow).

### Advertiser level (tier)
- **What:** Level from recent media activity (Starter / Growth / Enterprise style names may vary).
- **Why:** Unlock Reservation/packages and set minimums using real behavior, not self-declared wealth.
- **Advantage:** Fair progression; protects premium inventory.
- **Different from:** Agency flag (who manages the campaign) and buying type (how you pay).

### Agency managed (agency flag)
- **What:** Optional checkbox: an agency runs this for the brand (only if admin enabled agency).
- **Why:** Agencies manage many brands; a small percent may apply.
- **Advantage:** Supports agency workflows without a separate product.
- **Different from:** Advertiser level. Flag does not mean "richer company."

### Agency percent
- **What:** Admin-only percent that can uplift create fee and media pacing cost when agency flag is on.
- **Why:** Capture agency-managed spend fairly.
- **Advantage:** Controlled by admin; not inventable by publishers.
- **Different from:** Floor (minimum rate) and list level multiplier (level pricing).

### Placement
- **What:** Where the ad may show (lobby vs in-match; package may lock one).
- **Why:** Different places have different value and rules.
- **Advantage:** Brands buy the context they care about.
- **Different from:** Viewport (screen size creative).

### Lobby tile rotation
- **What:** While someone stays on the home lobby, the single lobby ad tile can refresh every N seconds (admin setting, separate from in-match interval). Pauses when the tab/app is not visible.
- **Why:** Long lobby dwell can show more than one brand over time without stacking ads.
- **Advantage:** More inventory; still one tile; soft format (not full-screen interrupt).
- **Different from:** In-match breaks (match clock). Different from Playit-style mid-navigation overlays (later premium phase, not default).

### Viewer frequency caps
- **What:** Limits how often one viewer sees the same campaign or placement (hour/day/session) plus a min gap between any two shows. Applies across lobby and in-match. Session caps use `session_key` stored on each impression event (one shared session key per browser tab on web, one shared process key on Flutter for lobby + in-match). Serve and eligibility rank with these caps; impression re-checks when keys are present so a direct impress cannot write past the limit.
- **Why:** Stops one Auction winner from feeling spammy on every surface, including within one browse session.
- **Advantage:** Professional multi-placement hygiene. Zero on a cap disables that rule.
- **Different from:** Campaign period impression caps (campaign totals, not per-viewer).

### Viewport (device creative)
- **What:** Creative slot for desktop / tablet / phone.
- **Why:** Same campaign needs the right shape on each device.
- **Advantage:** Better player experience; each size plays on matching screens.
- **Different from:** Placement (lobby vs match).

### Schedule
- **What:** When showing is allowed (first show delay, repeat, optional non-skippable).
- **Why:** Avoid spam and respect match flow.
- **Advantage:** Controllable pacing inside a game.
- **Different from:** Daily media budget (money) and period caps (view counts).

### Period caps
- **What:** Optional max views per day/week/month/year.
- **Why:** Hard count limits beyond money budget.
- **Advantage:** Extra safety.
- **Different from:** Daily media budget (money limit).

### Servable / Active
- **What:** Status that allows delivery when other gates pass.
- **Why:** Draft campaigns should not show.
- **Advantage:** Clear on/off for delivery.
- **Different from:** Auto-closed (ended by system after end date; cannot reopen).

### Rank (who wins the slot)
- **What:** Score used when several eligible campaigns want the same scarce slot.
- **Why:** Need a fair winner when inventory is limited.
- **How (plain):** Higher from bid or reserved rate × placement × screen size × level list multiplier.
- **Important:** Agency percent and high-rated audience do **not** pick the winner. They affect how fast money/budget is used.
- **Different from:** Eligibility gates (geo, schedule, budget) which happen before rank.

### High-rated audience
- **What:** Extra cost when the viewer's rating is high (admin threshold + multiplier).
- **Why:** Those eyes can be more valuable.
- **Advantage:** Prices valuable audiences without guessing company wealth.
- **Different from:** Rank winner selection.

### Impression wallet settle
- **What:** Admin option to debit wallet on each view. **Default OFF.**
- **Why ON:** Strict live prepaid per view.
- **Why OFF (default):** Create fee already paid; daily media budget paces views without per-view debit.
- **Advantage of default OFF:** Simpler first-day ops.
- **Different from:** Create fee (once at create).

### Buying summary
- **What:** Read-only card of buying type, rates, package, level, agency.
- **Why:** Everyone sees the deal after create; support can help.
- **Advantage:** Locked clarity.
- **Different from:** Analytics (performance numbers).

### Invoice
- **What:** PDF estimate document.
- **Why:** Brands need paperwork.
- **What it uses:** Base rate × views estimate; create fees and optional live settle noted separately.
- **Different from:** Live wallet ledger lines.

---

## 4. Buying types end to end (full chapter)

This is the heart of the guide.

### 4.1 What "buying type" means
Buying type = the **contract style** for how views are priced on that campaign.

You pick it at create (when Marketplace is on).
It is **locked** after create.
If you need a different style later, create a new campaign.

### 4.2 Side-by-side comparison

| Question | Standard | Auction | Reservation |
|----------|----------|---------|-------------|
| Everyday picture | Fixed menu price | Bidding at a stall | Booking a VIP table |
| What you type for price | Nothing (platform flat price) | **Max bid** per view | **Reserved rate** or choose a **package** that sets the rate |
| Price certainty | High (flat) | Medium (you set a ceiling; competition decides who wins scarce slots) | High (fixed rate / package) |
| Best when | Marketplace off; simplest SMB path | You want flexibility and can compete | You want predictability or a premium package |
| Needs Marketplace on? | No (and when Marketplace on, new creates cannot choose it) | Yes + Auction enabled | Yes + Reservation enabled + level unlock |
| Can use marketplace package? | No | No | Yes (if packages unlocked) |
| Floor applies? | Uses flat unit cost path instead | Yes (bid ≥ floor) | Yes (rate / package rate ≥ floor) |
| Who usually wins scarce slots | Flat cost campaigns still compete under serve rules; no bid field | Higher rank from bid math | Higher rank from reserved/package rate math; exclusive packages limited to one holder |
| Main advantage | Easiest | Competitive access to busy inventory | Certainty + sponsorship-style packages |
| Main tradeoff | Leaves premium upside on the table | Less fixed certainty; must watch floor and competition | Often higher / locked cost; Reservation may require higher advertiser level |

### 4.3 Standard (full)

**What**
Simple path. Create fee + platform flat price per view. No max bid, no reserved rate, no marketplace package.

**Why we have it**
- Day-one simplicity.
- Small businesses and early markets.
- Safe fallback when Marketplace is off.
- Old campaigns keep working after Marketplace turns on.

**When to use**
- Admin left Marketplace **off**, or
- You are looking at an **old** Standard campaign that already exists.

**When you cannot use it**
- Marketplace is **on** and you are creating a **new** campaign.

**End to end**
1. Create with map pin + daily media budget.
2. Pay create fee.
3. Upload creatives, schedule, set Active.
4. Views use flat unit cost; daily budget paces spend.
5. Analytics + invoice as usual.

**Do**
- Use when you want simplest path.

**Do not**
- Expect bid/package fields on Standard.
- Expect to pick Standard for new creates while Marketplace is on.

### 4.4 Auction (full)

**What**
You set a **max bid** = highest you will pay per view.
You compete with other eligible campaigns for scarce slots.
**Floor** is the minimum bid allowed right now.

**Why we have it**
- Busy moments should earn more when many brands want the same eyes.
- Brands control their ceiling.
- Same idea as auction ads on big platforms, adapted to Dama.

**Advantages**
- Flexible.
- Good for testing and always-on presence.
- Competition can raise platform revenue fairly.

**Tradeoffs**
- You may lose a slot to a higher rank.
- You must keep bid ≥ floor.
- Less "guaranteed VIP" feeling than Reservation packages.

**When to use**
- Marketplace on, Auction enabled.
- You want reach and can accept competition.
- You do not need an exclusive package.

**When not to use**
- You need a locked sponsorship package.
- Your level/tools only unlock Reservation packages you care about (then use Reservation).

**What you fill**
- Buying type = Auction
- Max bid ≥ floor
- Daily media budget ≥ level minimum
- No marketplace package

**End to end**
1. Pin map → see floor and level.
2. Choose Auction → enter max bid.
3. Pay create fee → upload creatives → schedule → Active.
4. At show time: pass gates → rank uses bid math → higher score wins scarce slot.
5. Budget paces views; optional live settle only if admin ON.
6. Buying summary shows Auction + bid (locked).

**Do**
- Bid at or above floor.
- Raise daily budget if you want more room to compete.

**Do not**
- Bid below floor.
- Expect package picker on Auction.
- Expect to edit bid later.

### 4.5 Reservation (full)

**What**
You lock a known price per view:
- type a **reserved rate**, or
- pick a **package** that sets the fixed rate (and maybe flight fee / exclusivity / placement).

**Why we have it**
- Brands often pay more for certainty (cup finals, season, category exclusivity).
- Packages turn premium inventory into clear products.

**Advantages**
- Predictable planning.
- Packages are easy to understand.
- Exclusive packages create real scarcity value.

**Tradeoffs**
- Usually needs higher advertiser level unlock.
- Exclusive package may already be taken.
- Locked price may be higher than a low auction bid.

**When to use**
- Marketplace on, Reservation enabled, level unlocks Reservation.
- You need predictability or a named package.
- You want exclusivity for a moment/category.

**When not to use**
- Level has not unlocked Reservation yet.
- You only want flexible competition (use Auction).

**Two Reservation paths**

**Path A - Package**
1. Choose Reservation.
2. Pick package (if unlocked).
3. Package sets rate (must clear floor).
4. If exclusive and taken → create blocked with clear message.
5. Flight fee (if any) is included in create payment.
6. Create → creatives → schedule → Active.

**Path B - Own reserved rate**
1. Choose Reservation.
2. Do not pick a package.
3. Type reserved rate ≥ floor (required).
4. Create → creatives → schedule → Active.

**End to end after create**
- Rank uses reserved/package rate math for scarce slots.
- Exclusive filter keeps one winner per exclusive bucket.
- Buying summary shows Reservation + rate/package (locked).

**Do**
- Read package details before buying exclusive.
- Enter reserved rate if no package.

**Do not**
- Leave reserved rate empty when no package.
- Assume exclusive is always free.
- Expect to change package after create.

### 4.6 How to choose (decision helper)

| Your need | Choose |
|-----------|--------|
| Simplest; Marketplace off | Standard |
| Flexible competition for busy inventory | Auction |
| Fixed price without a catalog package | Reservation + reserved rate |
| Named premium / exclusive offer | Reservation + package |
| "We are rich" checkbox | None. Use activity level + real inventory instead |

### 4.7 Same journey after the buying type
No matter which buying type you picked, you still must:
1. Pay create fee (when greater than zero).
2. Upload creatives.
3. Set schedule / caps.
4. Set Active / servable.
5. Pass geo, placement, schedule, budget gates before any view.
6. Accept that buying fields are locked.

Buying type changes **how price is agreed and how scarce slots compete**.
It does not remove creatives, schedule, or wallet basics.

---

## 5. Marketplace ON vs OFF

### OFF
- New campaigns = Standard.
- No bid / reserved rate / marketplace package fields.
- Flat platform price per view.

### ON
- New campaigns = Auction or Reservation only.
- Standard blocked for new creates.
- Floor + advertiser level appear after map pin.
- Existing Standard campaigns still run.

---

## 6. Your first campaign (publisher walkthrough)

Same on **web** and **Flutter**.

### A. Prepare money
Fund ads wallet for create fee (and for live settle only if admin turned that ON).

### B. Start create
Campaigns → Create → map pin → read floor / level / minimums / packages.

### C. Basics
Title, creative type, daily media budget (≥ level minimum when Marketplace on).

### D. Buying type
- Auction → max bid ≥ floor.
- Reservation → package **or** reserved rate ≥ floor.
- Agency checkbox only if shown and an agency truly runs it.

### E. Create
Confirm. Wallet pays create fee (+ flight fee if package has one).

### F. After create
Creatives → schedule/caps → Active.
Buying summary locked.

---

## 7. When a player might see the ad

Gate checklist:
1. Active / servable
2. Location match
3. Placement match
4. Schedule allows
5. Daily media budget OK
6. Period caps OK
7. Rank picks winner if several pass
8. Exclusive package: one winner per bucket
9. Player sees creative only

Pay for the view:
- Settle OFF (default): no per-view wallet pull; daily budget paces.
- Settle ON: wallet must cover that view.

---

## 8. After it runs

Analytics → invoice (base rate × views estimate; create fees / live settle noted separately) → pause/close as needed.
Auto-closed after end date cannot reopen.

---

## 9. Across apps

| Seat | Plain role |
|------|------------|
| Server (API) | Referee: pricing, create rules, rank, views, wallet, errors |
| Web | Publisher create/detail |
| Flutter | Same publisher flow |
| Admin | Switches, floors, levels, packages, agency, settle, Buying summary |

Public: floor, bid, reserved rate, packages, clear errors.
Admin-only: exact percents, deep multipliers, settle switch, catalogs.

---

## 10. Admin chapter

| Control | Why it exists |
|---------|----------------|
| Marketplace on/off | Choose simple Standard market vs Auction/Reservation market |
| Auction / Reservation toggles | Enable each buying style safely |
| Default buying type | Suggested choice when Marketplace on |
| Create fees | Setup economics by geo |
| Flat unit cost | Standard view price |
| Floors + peak/busy | Minimum value of attention |
| Levels | Unlock premium tools by activity |
| Packages | Sell certainty products |
| Agency % | Agency-managed uplift |
| High-rated audience | Price valuable viewers |
| Impression settle | Optional live per-view debit (default off) |
| Buying summary | Support visibility |

Admin do: price scarcity; unlock by activity; keep settle off until support-ready.
Admin do not: tax "rich names"; enable Marketplace with both styles off; promise editable bids after create.

---

## 11. Two end-to-end stories

### Story A - Standard (Marketplace off)
Create Standard → pay create fee → creatives → Active → flat price views → daily budget paces.

### Story B - Auction vs Reservation package
Two brands Auction-bid for busy lobby; higher rank wins.
Third brand buys exclusive Reservation package for cup final for certainty.
No one paid extra only for sounding big.

---

## 12. FAQ (first-day confusion)

**What is buying type, really?**
The contract style for view pricing on that campaign: Standard, Auction, or Reservation. See Section 4.

**Why do we need three buying types?**
Different needs: simplicity (Standard), flexible competition (Auction), certainty / packages (Reservation). One style cannot serve all brands well.

**What is the difference between max bid and reserved rate?**
Max bid = Auction ceiling while competing.
Reserved rate = Reservation fixed price you type when not using a package.

**What is the difference between reserved rate and package?**
Reserved rate = you type the number.
Package = admin offer that sets the number (and maybe flight fee / exclusivity / placement).

**What is the difference between create fee and daily media budget?**
Create fee = once at create.
Daily media budget = max for views that day.

**What is the difference between floor and my bid/rate?**
Floor = minimum allowed.
Your bid/rate = your offer, must be ≥ floor.

**Why agency flag?**
Marks agency-managed campaigns when admin allows it. May add a small percent. Not a wealth badge.

**Why advertiser level?**
Unlocks Reservation/packages using recent activity. Stops fake "we are enterprise" claims.

**Why lock buying fields after create?**
So the deal stays clear for billing, support, and fairness. New needs → new campaign.

**Why is Standard missing on create?**
Marketplace is on. New creates must be Auction or Reservation.

**Why did create fail?**
Wallet short; bid/rate below floor; daily budget below level minimum; exclusive package taken; Reservation not unlocked; package invalid.

**Do players see bids?**
No.

**Does Auction always cost less than Reservation?**
Not always. Auction can rise with competition. Reservation can be higher for certainty/exclusivity. Compare floor, your number, and package details.

**Does higher bid always show more?**
Only among campaigns that already pass geo/schedule/budget gates. Then higher rank helps win scarce slots. Caps and budget still limit volume.

**What if Marketplace turns on while I have old Standard campaigns?**
Old ones keep working. New ones must use Auction or Reservation.

**Is settle required?**
No. Default off.

**Where is Section 4 vs FAQ?**
Section 4 = full buying-type textbook.
This FAQ = short answers. Cheat sheet = shortest memory list.

---

## 13. Cheat sheet (print this)

### Money
1. **Create fee** = pay once to open campaign.
2. **Daily media budget** = max for views today (required).
3. **View** = one counted show.
4. **Floor** = minimum allowed bid/rate now.
5. **Invoice** ≈ base rate × views (fees/settle noted separately).

### Buying types (remember this block)
6. **Standard** = flat platform price. Marketplace off for new creates. Simplest.
7. **Auction** = max bid ≥ floor; compete for scarce slots; flexible.
8. **Reservation** = reserved rate ≥ floor **or** package; certainty; packages may be exclusive.
9. **Marketplace on** = new creates are Auction or Reservation only.
10. **Locked after create** = buying type, bid, reserved rate, package, agency.

### Other common fields
11. **Package** = ready-made Reservation offer; may add flight fee.
12. **Exclusive** = only one active holder.
13. **Agency flag** = optional; may add small percent.
14. **Advertiser level** = unlocks tools from activity, not "rich" claims.
15. **Rank** = who wins scarce slot (bid/rate math). Agency/audience affect cost pacing, not winner pick.
16. **Settle default OFF** = no live per-view wallet pull.

### Pick quickly
17. Want simple → Standard (Marketplace off).
18. Want flexible competition → Auction.
19. Want fixed price → Reservation + reserved rate.
20. Want named/exclusive premium → Reservation + package.

---

## 14. Related reading

| Need | Guide |
|------|-------|
| Creatives, schedule, pause, auto-close | `Dama_Ads_And_Admin_Ops_Guide` |
| Wallet, KYC, receipts | `Dama_Wallet_Payments_And_Compliance_Guide` |
| Whole app roles | `Dama_Complete_App_Guide` |

Marketplace changes how views are **priced and chosen**.
It keeps Standard when Marketplace is off, and does not remove creatives, schedule, or wallet basics.
