# Dama - Ad Marketplace Bible (Day-one plain English)

This guide is for someone on their **first day**.
You do not need advertising experience. You do not need coding knowledge.

If a word feels hard, look it up in **Section 3** (picture dictionary). Screen button text may differ slightly because labels come from the database.

Companion guides:
- Ads day-to-day ops: `Dama_Ads_And_Admin_Ops_Guide`
- Whole product map: `Dama_Complete_App_Guide`

Regular hyphens only.

---

## 1. Read this first (the whole idea in one story)

Imagine Dama is a busy game hall.

Players are people sitting at tables.
An **ad** is a short poster or video that can appear:
- in the lobby (before / around play), or
- during a live match (in-match),

when rules allow.

A **campaign** is your plan for one ad job: which creative, where, how long, how much money per day.

### The old simple way (still exists)
1. You pay a **create fee** once to open the campaign (like a small setup fee).
2. The platform has one **flat price per view**.
3. Your **daily media budget** is the max you allow that campaign to use per day for views.

That simple way is called **Standard**.

### The smarter way (Marketplace)
Some days many brands want the same busy eyes (big cup, peak hours, popular lobby).
Dama can then sell attention more like big platforms:

- **Auction** = you say the most you will pay per view. If others want those eyes too, the higher offer usually wins the scarce slot.
- **Reservation** = you lock a fixed price per view (or buy a ready-made **package**) so you know the price up front. More like booking a VIP table.

Important fairness rule:
Dama does **not** ask "is this company rich?" and invent a higher fee for the name alone.
Dama charges more for **better / busier / scarcer attention**, and lets brands **compete** when they want the same slots.

---

## 2. Who should read which part

| You are... | Read |
|------------|------|
| Brand or person creating ads (publisher) | Sections 1 to 8, then 11 FAQ |
| Admin / operator | Sections 1 to 3, then 9 and 10 |
| Support answering tickets | Section 3 + Section 11 |

Where publishers work: Ads area on **web** and **Flutter** (same rules).
Where admins work: **Admin Console** → Progression (money switches) and Ads (campaign summary).

Players who only play the game never fill bid or package fields. They only see the creative.

---

## 3. Picture dictionary (every important word)

Read this like a menu. One row = one idea.

| Word you will see | In everyday life | On Dama | Tiny example |
|-------------------|------------------|---------|--------------|
| **Campaign** | One advertising job | Your ad project with creative + schedule + money limits | "Spring coffee promo" |
| **Create fee** | Setup fee to open the job | Money taken from ads wallet **once** when create succeeds | 50 taken at create |
| **Daily media budget** (also called daily spend cap) | Max you allow for views today | Required number greater than zero. Separate from create fee | "Spend at most 200 today on views" |
| **View** (impression) | One time someone actually saw the ad | One counted show when rules pass | 1 view |
| **Marketplace** | Switch from "one flat price" to "Auction / Reservation options" | Admin turns this on or off for new campaigns | On = choose Auction or Reservation |
| **Buying type** | How you agree to pay for views | Standard, Auction, or Reservation | Dropdown on create |
| **Standard** | Fixed menu price | Flat platform price per view. No bid, no package | Marketplace off → new campaigns use this |
| **Auction** | Bidding at a market stall | You set a **max bid per view**. You compete for scarce slots | Max bid 3 per view |
| **Reservation** | Booking a VIP table at a set price | You lock a **reserved rate per view**, or pick a **package** that sets it | Reserved rate 5 per view |
| **Floor price** | Lowest price the stall accepts today | Your bid or reserved rate must be **at least** this number. Can change by country, peak time, or busy network | Floor is 2 → you cannot bid 1 |
| **Max bid** | "I will not pay more than this per view" | Auction field. Must be ≥ floor | Bid 4 when floor is 2 |
| **Reserved rate** | "I agree to this fixed price per view" | Reservation field when you do **not** pick a package. Must be ≥ floor | Reserved 5 |
| **Package** | Ready-made combo meal | Admin-made offer: fixed rate, maybe extra setup money (flight fee), where it shows, maybe exclusive, minimum advertiser level | "Tournament Finals Pack" |
| **Flight fee** | Extra package setup charge | Added into the create-fee payment when the package has one | Package adds 100 at create |
| **Exclusive package** | Only one brand gets that VIP corner | Only one active campaign can hold that exclusive slot/category | Soft-drink exclusivity for one cup |
| **Advertiser level** (tier) | Customer level from recent spending activity | Unlocks Reservation and/or packages; can change minimums. **Not** a "we are rich" checkbox | Starter → Growth → Enterprise style |
| **Agency managed** (agency flag) | "An agency is running this for the brand" | Optional checkbox if admin enabled agency. May add a **small percent** on create fee and on how fast media budget is used | Checkbox on create |
| **Agency percent** | Agency service cut | Set by **admin only**. Publishers see the checkbox, not a secret internal dump | Admin sets 10% |
| **Placement** | Where the poster hangs | Lobby vs in-match (and package may lock a placement) | In-match only |
| **Viewport** (device creative) | Poster size for phone vs desktop | Desktop / tablet / phone creative slots. Each plays on matching screens | Upload phone creative for phones |
| **Schedule** | When the poster is allowed to show | First show delay, repeat interval, optional non-skippable time | First show after 60s in match |
| **Period caps** | Max views per day/week/month/year | Optional limits on how many views | Max 1000 views / day |
| **Servable / Active** | "This job is allowed to show" | Status that allows delivery when other gates pass | Set Active after creatives |
| **Rank / who wins the slot** | Who gets the scarce wall space when many want it | Higher score from bid or reserved rate × placement × screen size × level list multiplier. **Agency and high-rated audience do not decide the winner.** | Higher bid-ish score wins |
| **High-rated audience** | Showing to stronger / higher-rated players | May cost a bit more for pacing / optional live pay. Does **not** replace who wins the slot | Premium on high rating views |
| **Impression wallet settle** | Pay-per-view from wallet live | Admin option, **default OFF**. ON = each view needs wallet money now. OFF = create fee already paid; daily budget only limits how many views | Usually leave OFF at first |
| **Buying summary** | Receipt of how you bought | On campaign detail (and admin console): buying type, rates, package, level, agency. **Locked after create** | Read-only card |
| **Invoice** | Bill / estimate PDF | Estimate ≈ base rate × views. Create fees and optional live settle are separate notes | Download from Ads |

If you remember only five words: **create fee**, **daily media budget**, **buying type**, **floor**, **view**.

---

## 4. Marketplace ON vs OFF (what changes for you)

### Marketplace OFF
- New campaign buying type = **Standard**
- You pay create fee (if any)
- Views use the platform flat price
- You do **not** fill max bid, reserved rate, package, or agency marketplace fields

### Marketplace ON
- New campaign must be **Auction** or **Reservation**
- You **cannot** pick Standard for a new campaign
- You see floor price and your advertiser level after the map pin
- Old Standard campaigns that already exist still keep working

Nothing else weird: you still need map pin, daily media budget, creatives, schedule, and an Active-style status before ads can show.

---

## 5. Your first campaign (publisher walkthrough)

Same on **web** and **Flutter**.

### Step A - Prepare money
1. Open Ads.
2. Put enough money in the **ads wallet** for the create fee (and later for views only if admin turned live settle ON).

### Step B - Start create
1. Campaigns → Create.
2. Drop the **map pin** (required). This is how Dama knows location pricing.
3. Read the pricing help: floor, level, minimum daily media budget, packages (if unlocked).

### Step C - Fill the simple fields
1. Title and creative type.
2. **Daily media budget** (must be greater than zero, and at least your level minimum when marketplace is on).

### Step D - Choose buying type (only if marketplace ON)

**If you choose Auction**
1. Enter **max bid** ≥ floor.
2. Do not expect a marketplace package on Auction (packages are for Reservation-style locks).

**If you choose Reservation**
- Option 1: pick a **package** from the list (if your level unlocks packages). The package sets the rate. Exclusive packages fail if already taken.
- Option 2: no package → type a **reserved rate** ≥ floor (required).

**Agency checkbox** (only if shown)
- Turn on if an agency runs this campaign for the brand.
- Create fee preview may go up a little.
- Leave off if you are the brand yourself.

### Step E - Create
1. Confirm.
2. Wallet pays create fee (+ package flight fee if any).
3. If wallet is short, create fails cleanly. Top up and try again.

### Step F - After create (still required)
1. Upload creatives (desktop / tablet / phone as you need).
2. Set schedule and caps.
3. Set status so it can serve (Active / servable).
4. Notice **Buying summary** is locked. You cannot edit buying type, bid, reserved rate, package, or agency later. Need a different buy? Create a new campaign.

---

## 6. What happens when a player might see your ad

Think of a gate checklist, then a "who wins" step.

1. Is the campaign Active / servable?
2. Does location match?
3. Does placement match (lobby or in-match)?
4. Does schedule allow showing now?
5. Is daily media budget still available?
6. Are period view caps still OK?
7. If several campaigns pass: **higher rank wins** the scarce slot.
8. Exclusive package rule: only one winner per exclusive bucket.
9. Player sees only the creative. They never see your bid or wallet.

### Paying for that view
- **Live settle OFF (default):** no extra wallet pull per view. Daily media budget just limits how many views can run. Create fee was already paid.
- **Live settle ON:** wallet must cover that view or the show is blocked with a top-up message.

Agency percent and high-rated audience can make each view "use up" budget faster. They do **not** pick the winner by themselves.

---

## 7. After the campaign runs (reporting)

1. Open analytics: how many views, clicks, and related numbers.
2. Download **invoice** PDF if you need a document. Estimate uses base rate × views. Create fees and optional live settle are called out separately.
3. Pause / close when needed. Auto-closed after end date cannot reopen.

---

## 8. Across apps (same product, four seats)

| Seat | What it does in plain words |
|------|-----------------------------|
| **Server (API)** | The referee. Checks prices, create rules, who wins, counts views, takes wallet money when allowed, returns clear error text |
| **Web** | Browser Ads screens for create + detail |
| **Flutter** | Phone/tablet Ads screens. Same rules as web |
| **Admin** | Turns marketplace on/off, sets floors and packages, reviews campaign Buying summary |

Public screens: floor, bid, reserved rate, packages, friendly errors.
Admin-only: exact percents, deep multipliers, settle switch, catalog editing.

---

## 9. Admin chapter (must know / must control)

If you are not an admin, skip to Section 11.

### What you control (Progression + Ads)
| Control | Plain meaning |
|---------|---------------|
| Marketplace on/off | Offer Auction/Reservation on new creates, or keep Standard only |
| Auction on/off | Allow bidding style |
| Reservation on/off | Allow fixed-rate / package style |
| Default buying type | Suggested choice when marketplace is on |
| Create fees (Ethiopia / global) | Setup fee amounts |
| Flat unit cost | Standard path price per view |
| Floor prices | Minimum bid / reserved rate |
| Peak / busy floor | Raise minimum when time is hot or fill is high |
| Placement / viewport multipliers | Make some slots or screens cost more in the math |
| Advertiser levels | Unlock Reservation/packages; set minimums from recent activity |
| Packages | Ready-made offers, exclusive flags, flight fees |
| Agency on + percent | Allow agency checkbox and the small percent |
| High-rated audience | Extra cost when viewer rating is high |
| Impression wallet settle | OFF = budget pacing only; ON = pay each view from wallet |
| Ads console Buying summary | Read-only support view of how a campaign was bought |

### Admin do
- Price scarce attention (floors, packages, peak).
- Unlock features by real activity levels.
- Keep settle OFF until support and top-up flow are ready.

### Admin do not
- Charge more only because a company name "sounds big."
- Leave marketplace on with both Auction and Reservation disabled.
- Expect publishers to edit bid/package after create.

---

## 10. Two short end-to-end stories

### Story A - Small brand, marketplace off
1. Creates Standard campaign, pays create fee.
2. Uploads creatives, sets daily media budget, goes Active.
3. Views use flat platform price. Daily budget stops overspending.

### Story B - Two brands want the same busy lobby (marketplace on)
1. Both choose Auction and bid above the floor.
2. Higher rank gets the scarce slot first.
3. A third brand buys an exclusive Reservation package for a cup final so they are not outbid mid-event.
4. Nobody was taxed for "looking rich." They paid for scarce attention or certainty.

---

## 11. FAQ (first-day confusion)

**What is buying type?**
How you agree to pay for views: Standard (simple flat), Auction (max bid), or Reservation (fixed rate / package).

**What is max bid?**
On Auction: the most you will pay per view. Must be at least the floor.

**What is reserved rate?**
On Reservation without a package: the fixed per-view price you lock. Must be at least the floor.

**What is a package?**
A ready-made offer admin created. It usually sets the rate for you. May cost an extra flight fee at create. May be exclusive.

**What is the agency flag?**
Optional "managed by an agency." May add a small percent. Only if admin enabled it.

**Why can't I edit bid later?**
By design. Buying choices are locked after create so the deal stays clear. Create a new campaign to change them.

**Why was Standard missing?**
Marketplace is on. New campaigns must use Auction or Reservation.

**Why did create fail?**
Common reasons: wallet short for create fee; bid/rate below floor; daily budget below level minimum; exclusive package taken; Reservation not unlocked yet.

**Do players see my bid?**
No. Players only see the creative.

**Is this Meta/YouTube copy-paste?**
Same money idea (sell scarce attention + competition + VIP locks), built for Dama's wallet and in-game ads. Not a copy of their screens.

---

## 12. Cheat sheet (print this)

1. **Create fee** = pay once to open the campaign.
2. **Daily media budget** = max for views per day.
3. **Marketplace off** = Standard only (simple).
4. **Marketplace on** = Auction (max bid) or Reservation (reserved rate or package).
5. **Floor** = minimum allowed price per view right now.
6. **Package** = ready-made Reservation offer; exclusive means only one active holder.
7. **Agency flag** = optional; may add a small percent.
8. **Rank** = who wins scarce slots (bid/rate math). Agency/audience affect cost pacing, not that winner pick.
9. **Settle default OFF** = no live per-view wallet pull.
10. **Locked after create** = buying type, bid, reserved rate, package, agency.

---

## 13. Related reading

| Need | Guide |
|------|-------|
| Creatives, schedule, pause, auto-close, publisher URLs | `Dama_Ads_And_Admin_Ops_Guide` |
| Wallet top-up, KYC, receipts | `Dama_Wallet_Payments_And_Compliance_Guide` |
| Whole app roles | `Dama_Complete_App_Guide` |

Money still uses the shared ads wallet. Marketplace only changes **how views are priced and chosen**, and keeps Standard when marketplace is off.
