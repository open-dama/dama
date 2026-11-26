# Dama - Ad Marketplace (Auction and Reservation) Bible

Non-technical bible. Who / What / When / Why / Where / How.
Covers how Dama sells ad attention with Auction, Reservation, floors, advertiser levels, packages, agency, and optional live wallet settle.
Companion to `Dama_Ads_And_Admin_Ops_Guide` (full publisher + admin ops) and `Dama_Complete_App_Guide` (all-in-one).
Regular hyphens only. No internal secrets. Live button text may differ slightly because labels come from the database.

---

## 1. What problem this solves

Who: Ad publishers (brands and agencies) and platform admins.
What: A smarter way to price and sell ad views than one flat create fee plus one flat price forever.
Why: Big platforms (Meta, YouTube, LinkedIn) earn more by selling **scarce attention** and letting demand raise the price. They do not invent a higher fee only because a company "looks rich."
Where: Ads shell on web and Flutter; Admin Progression (marketplace settings); Admin Ads console (campaign buying summary).
How (plain idea):
1. Sell better spots and busy times for more.
2. Let advertisers compete (Auction) so prices rise when many want the same eyes.
3. Offer locked premium buys (Reservation and packages) for brands that want certainty.
4. Keep a simple path for small businesses when marketplace is off, or on lower advertiser levels.

One sentence: Dama earns more by charging more for better attention and scarce slots, not by guessing a company's bank account.

---

## 2. Two ways to buy ads (and the old simple way)

| Buying type | Plain meaning | Who it is for | When it is available |
|-------------|---------------|---------------|----------------------|
| **Auction** | You set a **max bid per view**. You compete with others. Higher effective bid wins scarce slots. Floor price is the minimum. | Most self-serve brands | Marketplace on **and** Auction enabled by admin |
| **Reservation** | You lock a **fixed rate per view** (or a package with a fixed rate). More predictable. Often used for premium packages. | Brands that want certainty; higher advertiser levels for reservation unlock | Marketplace on **and** Reservation enabled **and** your advertiser level unlocks reservation |
| **Standard (legacy)** | One create fee + one flat price per view set by the platform. No bid, no package. | Simple / older campaigns | When marketplace is **off**, new campaigns use this. When marketplace is **on**, new campaigns cannot choose Standard. Old Standard campaigns still keep working. |

Important: Names on screen may say "Auction", "Reservation", or "Standard". Rate fields are explained as **per view** (same money units as your daily media budget), so publishers can compare numbers without industry jargon.

---

## 3. Glossary (plain language)

| Term | Meaning |
|------|---------|
| Marketplace | Admin switch that turns on Auction / Reservation buying for new campaigns |
| Create fee | One-time wallet charge when you create a campaign (Ethiopia vs rest of world can differ) |
| Daily media budget (daily spend cap) | How much media spend that campaign may use per day. Required and must be greater than zero. Separate from the create fee. |
| Floor price | Lowest allowed bid or reserved rate right now. Can be higher in Ethiopia vs global, and can rise at peak hours or when the network is busy. |
| Max bid (Auction) | Highest you are willing to pay per view |
| Reserved rate (Reservation) | Fixed rate per view you lock in (or the package sets it) |
| Advertiser level (tier) | Starter / Growth / Enterprise style level based on your **recent media activity**, not on a "we are rich" checkbox |
| Package | Ready-made offer (fixed rate, optional flight fee, which placement, optional exclusivity, minimum level) |
| Exclusive package | Only one active campaign can hold that exclusive slot/category at a time |
| Agency managed | Campaign marked as run by an agency; a small percent may apply to create fee and media pacing when admin enables agency |
| High-rated audience | Views to higher-rated players can cost a bit more when admin turns that premium on (charge / pacing, not "who wins the slot" alone) |
| Placement | Where the ad can show (for example lobby vs in-match) |
| Viewport | Screen size creative (desktop / tablet / phone). Each size plays on matching screens. |
| Impression / view | One counted show of the ad when rules pass |
| Servable | Campaign status that allows delivery when other gates pass |
| Impression wallet settle | Optional admin setting. Off by default. When on, each view also needs enough wallet balance at show time. When off, the create fee is prepaid and daily budget paces views. |
| Buying summary | On campaign detail / admin console: buying type, rates, package, level, agency. Marketplace choices are locked after create. |

---

## 4. Across apps (who does what)

Same product rules on every surface. Nothing below is a separate "second marketplace."

| Surface | Role in marketplace |
|---------|---------------------|
| **API (server)** | Pricing preview, create rules, packages list, floors, advertiser levels, rank who wins a slot, count views, wallet create fee and optional live settle, public error messages |
| **Web** | Publisher create and detail UI: Auction / Reservation, bid or reserved rate, packages, agency, floor and level help text, locked buying summary |
| **Flutter** | Same publisher marketplace create and detail flow as web |
| **Admin** | Marketplace on/off; Auction / Reservation; floors; peak / busy floor; advertiser levels; packages; agency percent; high-rated audience; impression wallet settle; create fees; Ads console read-only Buying summary |

Public publisher screens show floor, bid, reserved rate, packages, and clear errors. Internal knobs (exact percents, multipliers, settle switch) stay admin-only.

---

## 5. Marketplace on vs off

### When marketplace is OFF
- New campaigns use **Standard** buying.
- You still pay the geo create fee (if greater than zero).
- Media uses the platform flat **unit cost per view**.
- No auction bid, no reservation rate, no marketplace packages on create.

### When marketplace is ON
- New campaigns must choose **Auction** or **Reservation** (Standard is blocked for new creates).
- Pricing screen shows floor, your advertiser level, daily media minimum for your level, packages (if unlocked), and agency option (if enabled).
- Create still charges the create fee path (geo base, then level rules, then agency uplift if marked agency, plus package flight fee when a package has one).
- Existing Standard campaigns already in the database keep serving with flat unit cost.

### What does not change
- Map pin / geo targeting still required.
- Daily media budget still required.
- Creatives, schedule, caps, pause/close, auto-close after end date, analytics, invoices, nested ads wallet still work as before.
- Players still only see the creative. They never see publisher money settings.

---

## 6. Before you create (pricing preview)

Who: Publisher on web or Flutter.
Where: Ads → Campaigns → Create (after you place the map pin so geo pricing can resolve).
What you see (when marketplace is on):
- Floor price (per view) for your location / time
- Whether Auction and/or Reservation are available to you
- Your advertiser level name and short blurb
- Minimum daily media budget for your level
- Packages list if your level unlocks packages
- Agency checkbox if agency is enabled (checking it refreshes the create-fee preview)

Why: So you know the minimums before you spend wallet money.

---

## 7. Create step by step (web and Flutter)

Same product rules on both apps.

### Always (marketplace on or off)
1. Sign in and open the Ads shell.
2. Fund the ads wallet enough for the create fee (and later media if live settle is on).
3. Create: title, creative type, **required map pin**, **required daily media budget**.
4. Wallet pays create fee. If balance is too low, create fails and nothing broken is left behind.
5. After create, open detail: upload device creatives, set schedule and caps, set status so it can serve.

### Extra when marketplace is ON

**Auction**
1. Choose Auction.
2. Enter a max bid at or above the floor.
3. Save / create.
4. Cannot pick a marketplace package on Auction (package is cleared).

**Reservation without a package**
1. Choose Reservation (only if unlocked for you).
2. Enter a reserved rate at or above the floor. This is required.
3. Create.

**Reservation with a package**
1. Choose Reservation.
2. Pick an allowed package from the list.
3. The package sets the reserved rate (must clear the floor).
4. If the package is exclusive and another active campaign already holds it, create is blocked with a clear message.
5. Package flight fee (if any) is included in the create fee debit.
6. Create.

**Agency**
1. If shown, you may mark "managed by an agency."
2. Create-fee preview can rise by the admin agency percent.
3. Only saved if admin has agency enabled.

### Locked after create
Buying type, bid, reserved rate, package, and agency flag are set at create and **cannot be edited later**. Screen shows a short locked blurb. To change buying approach, create a new campaign.

### Cannot at create
- Choose Standard while marketplace is on
- Bid or reserve below the floor
- Use Reservation before your level unlocks it
- Use a package before your level unlocks packages
- Skip reserved rate on Reservation when no package is selected
- Steal an exclusive package that is already held
- Set daily media budget below your level minimum

---

## 8. Advertiser levels (tiers)

Who: Every publisher account with media activity.
What: Level based on recent media spend behavior (last period of activity), not a self-declared company size.
Why: Unlocks Reservation, packages, and can change create-fee multiplier, daily media minimum, and list rate multiplier.
Where: Shown on pricing / create; stamped on the campaign at create; visible on buying summary.
How admins set it: Admin → Progression → advertiser tiers (name, monthly spend minimum, create-fee multiplier, media daily minimum, unlock reservation, unlock packages, list multiplier).

Typical pattern (names can change in admin):
- Lower level: Auction, lower minimums
- Mid level: more unlocks
- Higher level: Reservation + packages, higher list rates / minimums

0 create-fee multiplier can mean create fee waived for that level (media money still matters).

---

## 9. Floors, geo, peak, and busy network

Who: All marketplace creates and ranking math.
What: Minimum price per view that bids and reserved rates must meet.
When: Live at pricing and at create. Can move with time of day and fill.
Why: Protects inventory value; raises price when demand or premium geo is higher.
Where: Admin Progression marketplace floors (base, Ethiopia, global) plus peak window and optional dynamic floor when fill is high.

Publisher view: one clear floor number and short help text. Peak / busy can raise the floor.

---

## 10. Packages and exclusivity

Who: Publishers whose level unlocks packages; admins who catalog packages.
What: Named offers with fixed rate, optional flight fee, buying type, minimum level, placement, exclusive flag / category.
When: On Reservation create when packages are unlocked.
Why: Sell tournament / season / premium certainty the way sponsorship packages work elsewhere.
Where: Publisher package picker; Admin Progression packages list.

Exclusive:
- At booking: only one non-archived packaged campaign may hold that exclusive bucket.
- While serving: exclusivity filter keeps one winner per bucket among eligible campaigns.

If exclusive is taken: public error that the exclusive package is already held.

---

## 11. Agency

Who: Publishers working with an agency; admin who enables agency.
What: Optional "agency managed" on create.
When: Only if admin turned agency on.
Why: Agencies managing brands may pay a small percent of create fee and media pacing (percent set by admin).
Where: Create checkbox; buying summary shows agency label; create-fee preview with agency flag refreshes the fee.

Public publisher screens do not show the internal agency percent number to everyone. Admins set that percent in Progression.

---

## 12. While ads run (who wins the slot)

Who: Players seeing lobby or in-match ads; system choosing which campaign shows.
What: Among eligible campaigns, higher **rank score** wins scarce attention.
How eligibility still works (same family as before):
1. Campaign must be servable and match geo / placement / package rules.
2. Schedule and first-show / repeat rules for in-match.
3. Daily media budget and period impression caps.
4. Then rank.

Rank (marketplace Auction / Reservation):
- Uses bid or reserved rate (with floor rules) × placement × viewport × level list multiplier.
- Agency percent and high-rated audience premium are **not** used to decide who wins the slot.
- Those multipliers still affect **how fast budget is used** (and optional live wallet settle).

Exclusive packages: after rank, exclusivity keeps one winner per exclusive bucket.

Players only see the creative. They do not see bids, floors, or wallet math.

---

## 13. On each view (charge and pace)

What happens when a view is counted:
1. System computes the effective cost for that view (base rate, placement, viewport, level list multiplier; plus agency and audience when those apply).
2. View counts toward daily media budget and period caps.
3. If **impression wallet settle** is OFF (default): no extra wallet debit per view. Prepaid create fee already happened; daily budget paces how many views can run.
4. If **impression wallet settle** is ON: wallet must cover that view or the view is blocked with a clear top-up message.

High-rated audience:
- Admin sets a rating threshold and multiplier.
- When the viewer is at or above that rating, media cost for pacing / settle can be higher.
- This does not by itself replace rank competition.

---

## 14. After create / reporting

Who: Publisher and admin.
What:
- Analytics: impressions, reach, clicks, and related publisher metrics as today.
- Invoice PDF: estimate uses base rate × views; notes that create fees and optional live settle are separate.
- Campaign detail buying summary: buying type, rates (per view), package, level, agency, locked blurb.
- Admin Ads console: same buying summary read-only for support and ops.

Cannot: Edit marketplace buying fields after create; reopen auto-closed campaigns; force a show when eligibility fails.

---

## 15. Admin must have / must know / must control

Where: Admin → Progression (marketplace, floors, tiers, packages, agency, audience, create fees, impression settle) and Admin → Ads (runtime + campaign buying summary).

### Master switches
- Marketplace on / off
- Auction on / off
- Reservation on / off
- Default buying type when marketplace is on (Auction or Reservation; not Standard)

### Money and floors
- Ethiopia and global campaign create fees (currencies from payment settings)
- Floor prices (base / Ethiopia / global)
- Peak hours and optional dynamic floor when fill is high
- Placement and viewport multipliers
- Agency on + agency spend percent
- Impression wallet settle on / off (default off)
- Audience high-rating minimum + multiplier

### Advertiser levels
- Code / label / blurb
- Monthly spend minimum to reach the level
- Create-fee multiplier (including waive)
- Media daily minimum
- Unlock reservation
- Unlock packages
- List CPM / list rate multiplier

### Packages catalog
- Code, labels, buying type (Auction or Reservation when marketplace on; Standard packages are not used as marketplace catalog rows)
- Fixed rate (must be greater than zero and sensible vs floors)
- Flight fee
- Minimum level
- Placement
- Exclusive + optional category
- Enabled / disabled

### Ads console
- Read buying summary on campaign detail
- Runtime playback bounds still apply as in the Ads ops bible
- Do not promise publishers they can edit bid/package after create

### Operator habits
1. Confirm marketplace switches match the market you want (SMB simple vs full marketplace).
2. Keep floors and create fees in real currencies.
3. Review exclusive package conflicts when publishers report "package taken."
4. Only turn impression wallet settle on when wallet top-up UX and support are ready.
5. Skim stuck campaigns and runtime as in the daily ads checklist.

---

## 16. End-to-end story (one brand)

1. Admin turns marketplace on, enables Auction and Reservation, sets floors and tiers, adds one exclusive tournament package.
2. Publisher opens Ads on web or Flutter, drops a map pin, sees floor and level.
3. Chooses Reservation, picks the tournament package (or enters reserved rate), sets daily media budget, pays create fee (plus flight fee if any).
4. Uploads desktop / tablet / phone creatives, sets schedule, sets Active.
5. During eligible live games, system picks winners by rank and exclusivity; players see the creative.
6. Daily budget paces views. If settle is off, no per-view debit. If settle is on, wallet must cover each view.
7. Publisher checks analytics and downloads invoice. Buying type stays locked on the campaign.

---

## 17. End-to-end story (two brands compete)

1. Two brands both choose Auction for the same busy lobby inventory.
2. Both bid at or above the floor. The higher rank score gets the scarce slot first.
3. Prices rise with competition and floors without anyone declaring "we are richer."
4. A third brand buys an exclusive package for a cup final so they are not outbid mid-flight.

---

## 18. Do / Do not

### Publishers do
- Read floor and level before creating
- Set daily media budget at or above the minimum
- Upload creatives for the screens you care about
- Top up wallet before create (and before views if settle is on)

### Publishers do not
- Expect to change bid / package after create
- Expect Standard create while marketplace is on
- Expect Reservation or packages before unlock
- Expect refund of create fee on delete

### Admins do
- Price inventory and scarcity (floors, packages, peak)
- Unlock features by spend level
- Keep create fee and media rules clear in Progression

### Admins do not
- Charge more only because a company name "sounds big" with no better inventory
- Leave marketplace on with both Auction and Reservation off (defaults are repaired to a safe pair)
- Put secret keys or internal percents into public publisher copy

---

## 19. Troubleshooting (plain)

| Symptom | Likely meaning | What to try |
|---------|----------------|-------------|
| Cannot choose Standard | Marketplace is on | Use Auction or Reservation, or ask admin if marketplace should be off |
| Bid rejected | Below floor | Raise bid to the shown floor |
| Must enter reserved rate | Reservation without package | Enter reserved rate at or above floor, or pick a package |
| Reservation locked | Level too low or reservation disabled | Grow media activity / ask admin about unlocks |
| Package locked / invalid | Level or catalog | Pick another package or unlock packages |
| Exclusive package taken | Another active campaign holds it | Wait, use another package, or archive the holder (ops) |
| Daily media below minimum | Level rule | Raise daily budget |
| Create failed fee | Wallet short | Top up ads wallet |
| Ad view blocked for balance | Impression settle is on | Top up wallet |
| Buying fields missing on edit | By design | Create a new campaign |

---

## 20. How this connects to the rest of ads

| Topic | Where to read more |
|-------|--------------------|
| Creatives, schedule, caps, auto-close, publisher URLs | Dama_Ads_And_Admin_Ops_Guide |
| Wallet top-up, KYC, receipts, payouts | Dama_Wallet_Payments_And_Compliance_Guide |
| Roles and full product map | Dama_Complete_App_Guide |
| Deploy / env hosts | docs/ops-deploy.md (operators) |

Money still uses the shared wallet ledger under the Ads shell. Marketplace adds **how media is priced and chosen**, without removing the old Standard path when marketplace is off.

---

## 21. Money formula (plain)

Revenue idea:
- Auction spend when brands compete
- Reservation and package premiums for certainty
- Geo and peak floors
- Optional live per-view settle when admin turns it on

Still plus create fees when those are not waived by level.

That is the same playbook as auction + reserved premium inventory elsewhere, adapted to Dama's prepaid wallet and in-match / lobby ads.
