---
name: visual-themes
description: Create high-end visual themes for the Covenant inscriptions marketplace. Two-phase workflow - propose previews, then implement approved themes.
---

# Visual Themes

Create distinctive, production-grade themes for the Covenant inscriptions marketplace. Each theme is a complete experience — visual styling AND layout/UX decisions that express its personality.

## Commands

```
/visual-themes propose [count]    # Generate N theme proposals (default: 4)
/visual-themes implement [names]  # Implement selected themes
```

## Required Plugin

**You MUST use the frontend-design plugin** to generate all theme CSS and templates:
```
Skill tool: skill="frontend-design"
```

---

## Part 1: Design Philosophy

### Core Principle

**Each theme = Visual Identity + UX Personality**

Themes aren't just color swaps. Each theme MUST make STRUCTURALLY DIFFERENT layout and interaction choices.

### The Blindfold Test

**If you removed all colors and fonts, could you still tell themes apart by their LAYOUT ALONE?**

- If YES → themes are properly differentiated
- If NO → themes are just reskins (UNACCEPTABLE)

### Required Structural Variations

Each theme MUST differ in at least 3 of these structural dimensions:

| Dimension | Example Variations |
|-----------|-------------------|
| **Header** | Top bar / Sidebar / Floating minimal / Split (logo left, nav right page) |
| **Home layout** | Bio+grid / Hero+list / Sidebar+content / Single featured item |
| **Grid system** | 2-col / 3-col / 4-col / List/table view / Masonry / Single column |
| **Detail page** | 50/50 split / Stacked (image above) / Media dominant (80/20) / Tabbed panels |
| **Card design** | Square / Portrait / Landscape / Text-only rows / Large preview |
| **Nav pattern** | Horizontal links / Vertical sidebar / Tabs / Breadcrumb trail / Hamburger only |
| **Info density** | Compact data-rich / Spacious minimal / Progressive disclosure |

### UX Archetypes

**Use archetypes as inspiration, not rules.** The goal is structural differentiation — each theme should pass the blindfold test. Archetypes help you think about layout patterns, but you can blend them or create something entirely new. Just don't duplicate an existing theme's structure.

#### Core Archetypes

| Archetype | Header | Home | Grid | Detail | Example Sites |
|-----------|--------|------|------|--------|---------------|
| **Editorial** | Minimal masthead | Hero feature + list | 2-col asymmetric | Stacked, text-rich | Apartamento, Fantastic Man |
| **Archive/Index** | Dense top bar | Table/list view | Compact rows or tight grid | Side-by-side data panels | Bloomberg, Library catalogs |
| **Gallery/Museum** | Hidden/minimal | Single featured piece | Large cards, lots of whitespace | Media dominant, minimal chrome | Gagosian, White Cube |
| **Brutalist** | Bold top block | Stacked sections | Irregular grid, overlapping | Asymmetric layout | Virgil Abloh, Experimental Jetset |
| **Dashboard/Terminal** | Sidebar nav | Stats + panels | Dense grid with status indicators | Tabbed data panels | Trading terminals, IDEs |
| **Catalog/Collector** | Classic nav bar | Cards with metadata | Systematic grid | Detailed provenance panel | Auction houses, rare book dealers |
| **Zine/DIY** | Distressed banner | Collage layout | Irregular, overlapping | Asymmetric, layered | Punk zines, Xerox aesthetic |
| **Swiss** | Minimal wordmark | Mathematical grid | 4-col precise | 2/3 + 1/3 split | Müller-Brockmann |
| **Zen** | Near-invisible | Centered, spacious | 2-col, huge gaps | Stacked, centered | Japanese ma (空白) |

#### High-End & Luxury Archetypes

| Archetype | Header | Home | Grid | Detail | Inspiration |
|-----------|--------|------|------|--------|-------------|
| **Maison** | Centered wordmark, serif | Full-bleed hero + scroll | Portrait cards, generous margins | Split with provenance story | Hermès, Bottega Veneta, Celine |
| **Auction House** | Classic serif nav | Featured lot spotlight | Lot grid with estimate ranges | Detailed provenance + history | Christie's, Sotheby's, Phillips |
| **Private Collection** | Personal monogram | Curated selection, no grid | Salon-style hanging | Object study with annotations | Fondation Louis Vuitton, Pinault Collection |
| **Art Deco** | Geometric logotype | Symmetrical compositions | Decorative borders, gold accents | Framed presentation | Chrysler Building, Claridge's |
| **Neoclassical** | Serif wordmark, rules | Centered, hierarchical | Symmetrical, columned | Pedestal presentation | Metropolitan Museum, British Museum |

#### Pop Culture & Media Archetypes

| Archetype | Header | Home | Grid | Detail | Inspiration |
|-----------|--------|------|------|--------|-------------|
| **Film Credits** | Title card style | Opening sequence scroll | Poster grid | Credits roll layout | Saul Bass, Kyle Cooper title sequences |
| **Record Label** | Label logo | Featured release hero | Album grid, 12" format | Gatefold layout, liner notes | Factory Records, 4AD, ECM |
| **VHS/Analog** | Distorted type | Tracking lines, CRT glow | Tape spine grid | Scan lines, timecode | Video rental aesthetic, analog artifacts |
| **Video Game** | Pixel or UI chrome | Level select / menu | Achievement grid | Stats panel, inventory | Nintendo, PlayStation aesthetic |
| **Manga Panel** | Bold Japanese type | Dramatic splash | Panel grid, speech bubbles | Full-page spread | Shonen Jump, Tezuka |
| **Anime Cel** | Clean Japanese typography | Key frame showcase | Character sheet grid | Production art style | Studio Ghibli, Gainax |

#### Art Movement Archetypes

| Archetype | Header | Home | Grid | Detail | Inspiration |
|-----------|--------|------|------|--------|-------------|
| **Bauhaus** | Geometric sans | Primary shapes | Mathematical 3x3 | Form follows function | Kandinsky, Klee, Moholy-Nagy |
| **Constructivist** | Diagonal bold type | Dynamic diagonals | Angled, overlapping | Propaganda poster | Rodchenko, El Lissitzky |
| **De Stijl** | Mondrian blocks | Primary color grid | Asymmetric balance | Neoplastic composition | Mondrian, Rietveld |
| **Memphis** | Playful, patterned | Squiggle chaos | Irregular, colorful | Maximalist layers | Sottsass, Ettore, Michele De Lucchi |
| **Minimalist** | Single word | One object | Vast whitespace | Object + label only | Donald Judd, Dan Flavin |
| **Pop Art** | Ben-Day dots | Comic enlargement | Repetition grid | Bold outline, flat color | Warhol, Lichtenstein |
| **Surrealist** | Dream typography | Unexpected juxtaposition | Floating arrangement | Dali-esque presentation | Magritte, Dali, Ernst |

#### Institutional & Scientific Archetypes

| Archetype | Header | Home | Grid | Detail | Inspiration |
|-----------|--------|------|------|--------|-------------|
| **Wunderkammer** | Ornate script | Cabinet display | Curio arrangement | Specimen card | Natural history cabinets, curiosity rooms |
| **Scientific Specimen** | Classification header | Taxonomy index | Species grid | Botanical illustration | Linnaean taxonomy, Darwin's notes |
| **Museum Label** | Institution wordmark | Object clusters | Study collection | Extended label with provenance | Smithsonian, Natural History Museum |
| **Academic Press** | University crest | Journal contents | Citation list | Footnoted, referenced | University presses, journals |

#### Nostalgic & Retro Archetypes

| Archetype | Header | Home | Grid | Detail | Inspiration |
|-----------|--------|------|------|--------|-------------|
| **Vaporwave** | Glitched text | Marble busts, palm trees | Pink/cyan gradient grid | Nostalgic digital | Macintosh Plus, early internet |
| **Y2K** | Chrome, bubble text | Futuristic optimism | Translucent cards | Metallic, iridescent | Early 2000s tech aesthetic |
| **Film Noir** | Art deco crime | High contrast shadows | Venetian blind stripes | Dramatic spotlight | Raymond Chandler, noir cinema |
| **Space Age** | Orbit typography | Mission control | Capsule grid | Technical readout | NASA, 1960s futurism |

### Signature Moves

Each theme MUST have:
- One unconventional layout choice
- One distinctive interaction pattern
- Typography with personality
- A signature color relationship

### Design Direction

High-end art gallery / archive / editorial catalog.
Calm, restrained, timeless. Art always dominates.

### Hard Avoid

- Gradient backgrounds with soft blurs
- Rounded corners everywhere
- Blue/purple as default accent
- "Clean and minimal" as the entire personality
- Thin gray borders on white
- Sans-serif monotony
- Hover effects that just change opacity
- Neon, glassmorphism, hype, dashboard vibes, crypto clichés
- **All themes looking the same except for colors**

### Quality Bar

Think: "Would a design-forward collector use this?"
Not: "Does this look professional?"

---

## Part 2: Technical Patterns (CRITICAL)

**READ THIS BEFORE DESIGNING.** These patterns affect design decisions and must be followed during both proposal and implementation.

### App Architecture

Themes consist of:

1. **Tailwind CSS file** at `app/assets/stylesheets/application.{theme-name}.tailwind.css`
   - Uses Tailwind v4 `@theme` directive for CSS custom properties
   - **CRITICAL: ALL theme CSS must go in this single file**

2. **EJS templates** at `app/themes/{theme-name}/`
   - `layout.html`, `home.html`, `inscription.html`, `inscriptions.html`, `activity.html`, `policy.html`
   - `partials/inscription-card.html`, `partials/order.html`

3. **Config** in `config/store.yml` sets active theme via `theme: {theme-name}`

### Build System

```bash
npm run build:css && npm run build:templates
```

**DO NOT create separate theme.css files** — they will NOT be included in the build.

### Transform Effects (CRITICAL)

If you want visual effects like tilted/rotated headers, **apply transforms to pseudo-elements, not the main element**.

`transform`, `filter`, `perspective`, and `will-change` create stacking contexts that trap ALL child elements (modals, dropdowns). This breaks z-index.

```css
/* WRONG - traps all children in stacking context */
.theme-{name} .header {
  transform: rotate(-0.5deg);
}

/* CORRECT - visual effect without trapping children */
.theme-{name} .header {
  position: relative;
  /* NO transform here */
}

.theme-{name} .header::after {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--color-primary);
  border: 4px solid var(--color-primary);
  box-shadow: 6px 6px 0 var(--color-primary);
  transform: rotate(-0.5deg);  /* Transform on pseudo-element */
  z-index: -1;  /* Behind content */
}
```

### Wallet Modal Pattern

The wallet controller toggles `data-state="open"` on the modal. **DO NOT use Tailwind utility classes** like `hidden` or `data-[state=open]:flex`.

**Standard pattern (wallet inside header):**
```html
<div data-controller="wallet" data-action="keydown.esc@window->wallet#close mouseup@document->wallet#closeIfClickedOutside">
  <div data-wallet-target="selector" data-state="closed">
    <div class="wallet-panel">...</div>
  </div>
  <button data-action="wallet#select">Connect</button>
</div>
```

**For themes with header transforms (move wallet to body):**
```html
<body data-controller="store body-class usd wallet"
      data-action="... keydown.esc@window->wallet#close">

  <!-- Modal with backdrop for click-to-close -->
  <div data-wallet-target="selector" data-state="closed" class="wallet-modal-overlay">
    <div class="wallet-backdrop" data-action="click->wallet#close"></div>
    <div class="wallet-panel">...</div>
  </div>

  <header class="header">
    <button data-action="wallet#select">Connect</button>
  </header>
</body>
```

**Wallet modal CSS:**
```css
.theme-{name} [data-wallet-target="selector"] {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 10000;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
}

.theme-{name} [data-wallet-target="selector"][data-state="open"] {
  display: flex;
}

/* For backdrop approach */
.theme-{name} .wallet-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  cursor: pointer;
}

.theme-{name} .wallet-modal-overlay .wallet-panel {
  position: relative;
  z-index: 1;
}
```

### Connection State CSS (CRITICAL)

Use `.theme-{name}` prefix and `!important` to override button display rules:

```css
.theme-{name} .show-on-connected { display: none !important; }
.theme-{name} .hide-on-connected { display: flex; }
.theme-{name}.connected .hide-on-connected { display: none !important; }
.theme-{name}.connected .show-on-connected { display: inline-flex !important; }
.theme-{name}.connected .show-on-connected.btn-block { display: flex !important; }
```

**Why `!important`?** Rules like `.theme-{name} .btn-block { display: block }` have the same specificity and can override connection states.

### Dropdown Pattern

```css
.theme-{name} .dropdown-menu {
  z-index: 9999;
}
.theme-{name} .dropdown-menu.hidden {
  display: none;
}
```

### Mobile Responsiveness (CRITICAL)

1. **Never use inline styles** like `style="display: flex"` on nav elements — they override media queries

2. **Disable sticky positioning on mobile:**
```css
@media (max-width: 768px) {
  .theme-{name} .detail-media { position: static; }
  .theme-{name} .nav-links-desktop { display: none !important; }
}
```

3. **Define base styles in CSS, hide with media queries** — not inline styles

### Required Utilities

```css
.hidden { display: none !important; }
.invisible { visibility: hidden; }
.opacity-0 { opacity: 0; }
.transition-opacity { transition: opacity 0.3s; }
.duration-300 { transition-duration: 300ms; }
```

### Color Variable Convention

```css
@theme {
  /* Backgrounds */
  --color-bg: #...;        /* Page background */
  --color-surface: #...;   /* Cards, panels */

  /* Text */
  --color-primary: #...;   /* Main text */
  --color-secondary: #...; /* Secondary text */
  --color-muted: #...;     /* Faint text, labels */

  /* Accent */
  --color-accent: #...;    /* Links, prices, CTA */

  /* Borders */
  --color-border: #...;

  /* Status */
  --color-success: #...;
  --color-warning: #...;
  --color-error: #...;
}
```

---

## Part 3: Workflow

### Phase 1: Propose

Generate self-contained HTML preview files at `tmp/themes/{name}.html`.

Each preview:
- Self-contained (inline CSS, Google Fonts CDN only)
- Shows ALL pages: Home, Collection, Detail, Activity, Policy
- Includes wireframe diagrams showing layout structure
- No build system, no EJS — just static HTML for review

#### Proposal Workflow

1. **Analyze existing themes** to avoid duplication
2. **Generate N unique theme specs** (different archetypes, colors, layouts)
3. **Spawn N parallel proposal agents** — each creates a preview HTML file
4. **Generate index page** at `tmp/themes/index.html` with wireframe previews
5. **Report**: "Open tmp/themes/index.html to compare all proposals"

#### Proposal Agent Prompt Template

```
You are creating a PREVIEW PROPOSAL for a theme, not implementing it.

## CRITICAL: Read Technical Patterns First

Before designing, understand these constraints from the visual-themes skill:

1. **Transforms on pseudo-elements**: If you want tilted/rotated effects, plan to apply
   transforms to ::after pseudo-elements, NOT the main element. This affects how you
   visualize the design.

2. **Stacking contexts**: Headers with transforms trap dropdowns and modals. Design
   with this in mind.

3. **Mobile responsiveness**: Nav links hide on mobile, hamburger menu shows. Don't
   design assuming both are visible.

## Use the frontend-design Plugin

Invoke the frontend-design skill:
Skill tool: skill="frontend-design", args="Create theme preview for: {name}"

## Theme Specification
{SPEC_YAML}

## Output Requirements

Create a SINGLE self-contained HTML file at: tmp/themes/{name}.html

The file must include:
1. ALL CSS inline in a <style> tag
2. Google Fonts via CDN link only
3. NO external dependencies, NO build step

## Page Sections to Show

### 1. HOME PAGE
- Artist bio with avatar
- Collection grid (show 4-6 fake collection cards)
- Header/nav in context

### 2. COLLECTION PAGE
- Collection header with stats
- Inscription grid (show 6-8 fake cards with prices)
- Pagination controls

### 3. INSCRIPTION DETAIL PAGE
- Media display area
- Provenance/metadata section
- Purchase panel with price and button
- Success/error message states

### 4. ACTIVITY PAGE
- Transaction table/list
- Status badges (pending, confirmed)

### 5. POLICY PAGE
- Wallet address display
- Terms text area

### 6. COMPONENTS
- Wallet connection modal
- Button states (default, hover, disabled)
- Card hover states
- Loading spinner

### 7. LAYOUT WIREFRAME
Show a box diagram of the structural layout:
- Header position and style
- Grid columns
- Detail page split ratio

## Use Realistic Content

- Artist name: "Satoshi Artifacts"
- Collection names: "Genesis Collection", "Rare Sats Series"
- Inscription numbers: #12,345, #67,890
- Prices: 50,000 sats, 100,000 sats
- Wallet address: bc1p...xyz (truncated)

## Design Quality

- Distinctive typography (not Inter/Roboto)
- Intentional color relationships
- Clear structural personality
- Match the archetype's UX philosophy

## DO NOT

- Create multiple files
- Use EJS templates
- Reference external CSS/JS files
- Implement actual functionality
- Create directories in app/themes/

## Output

Return:
- Theme name
- File path created
- Brief description of the aesthetic
- Key structural choices (header style, grid layout, detail split)
```

#### Parallel Execution

Spawn all proposal agents in a SINGLE message:

```
Task(subagent_type="general-purpose", description="Propose swiss theme", prompt="...")
Task(subagent_type="general-purpose", description="Propose zen theme", prompt="...")
```

---

### Phase 2: Implement

After user selects themes from proposals, implement them fully.

#### Implementation Workflow

1. **Read the approved preview** at `tmp/themes/{name}.html`
2. **Invoke frontend-design plugin** with instruction to match the preview
3. **Create all required files** (see below)
4. **Run build and verify**

#### Implementation Agent Prompt Template

```
You are implementing a theme that was approved from a preview.

## Use the frontend-design Plugin

Invoke the frontend-design skill:
Skill tool: skill="frontend-design", args="Implement {name} theme matching preview"

## Required Reading

1. Read the approved preview: tmp/themes/{name}.html
2. This skill file contains all technical patterns in Part 2

## Match the Preview EXACTLY

The preview shows the approved design. Your implementation must match:
- Same colors
- Same typography
- Same layout structure
- Same component styling

## CRITICAL: How to Match the Proposal

**1. Copy CSS directly from the proposal:**
- The proposal HTML contains ALL CSS inline in `<style>` tags
- Extract CSS rules and use them verbatim (only changing CSS variable names)
- DO NOT rewrite or "improve" the CSS - copy it exactly
- Search for specific class names: `grep "inscription-preview" tmp/themes/{name}.html`

**2. Match HTML structure exactly:**
- Use the SAME class names as the proposal (e.g., `two-col` not `detail-two-col`)
- Use the SAME element nesting and hierarchy
- Use the SAME element types (div vs span, etc.)

**3. Implement page by page with verification:**
- For EACH page section in the proposal:
  a. Read that section from the proposal file
  b. Copy the HTML structure
  c. Copy the CSS rules for that section
  d. Replace placeholder content with EJS variables
  e. Verify it matches before moving to the next page

**4. Use grep to find all relevant CSS:**
```bash
# Find all CSS for a specific component
grep -A 20 ".two-col" tmp/themes/{name}.html
grep -A 15 ".inscription-preview" tmp/themes/{name}.html
grep -A 10 ".field-row" tmp/themes/{name}.html
```

**5. Check each page against proposal:**
- Home page layout and components
- Collection page (table vs cards, columns)
- Inscription detail (two-col split, preview box, field rows)
- Activity page (log entries vs table)
- Policy page structure

**Common mistakes to avoid:**
- Renaming classes (proposal uses `two-col`, implementation uses `detail-two-col`)
- Changing layout approach (proposal uses flex, implementation uses grid)
- Inventing new CSS instead of copying from proposal
- Skipping components that exist in the proposal

## Critical Implementation Rules

1. ALL CSS in single file: `app/assets/stylesheets/application.{name}.tailwind.css`

2. Apply transforms to pseudo-elements (see Part 2: Technical Patterns)

3. Use connection state CSS with !important (see Part 2)

4. Follow wallet modal pattern (see Part 2)

5. Handle mobile responsiveness (see Part 2)

## Files to Create

1. `app/assets/stylesheets/application.{name}.tailwind.css`
2. `app/themes/{name}/layout.html`
3. `app/themes/{name}/home.html`
4. `app/themes/{name}/inscriptions.html`
5. `app/themes/{name}/inscription.html`
6. `app/themes/{name}/activity.html`
7. `app/themes/{name}/policy.html`
8. `app/themes/{name}/partials/inscription-card.html`
9. `app/themes/{name}/partials/order.html`

## Reference for Patterns

Use `app/themes/cabinet/` for:
- Stimulus controller attributes
- data-testid attributes
- EJS template variables
- formatSats() helper

## Template Variables

Preserve all EJS variables and Stimulus controllers:
- `title`, `assets.css`, `assets.js`
- `CONFIG.artist_name`, `CONFIG.artist_avatar_url`
- `artist.about`, `artist.socials`
- `collections`, `collection`, `inscription`
- `checkout`, `order`, `pagination`
- `formatSats()` helper
- All `data-controller`, `data-action`, `data-testid` attributes

## Verification

After creating files:
1. Run: npm run build:css && npm run build:templates
2. Report build status
3. Test wallet modal opens and closes
4. Test mobile menu works
5. Test connection states (show/hide buttons)

## Output

Return:
- Theme name
- Files created
- Build status
- Confirmation that design matches preview
```

---

## Part 4: Reference

### Required Page Elements

#### Home Page
- Artist bio text — always visible, styled per theme
- Avatar — sized and positioned per theme
- Social links — if provided in config
- Collection cards/list — with price and availability

#### All Pages
- Connect wallet bar — sticky or inline, with connected state
- Navigation — styled per archetype
- Footer — "Powered by Covenant" attribution

#### Inscription Detail
- Purchase button — prominent, theme-styled
- Success/error/pending message states
- Already sold state

#### Activity Page
- Order list — recent transactions
- Status badges — pending/confirmed/failed

#### Policy Page
- Payment address — with copy functionality
- Policy text

### UI States to Design

1. **Button states**: default, hover, active, disabled, loading
2. **Card states**: default, hover, selected, sold
3. **Form states**: input focus, error, success
4. **Message types**: success, warning, error, info
5. **Loading states**: skeleton, spinner
6. **Empty states**: no items, no results
7. **Connection states**: disconnected, connecting, connected

### Verification Checklist

#### Build & Load
- [ ] `npm run build:css` completes without errors
- [ ] `npm run build:templates` completes without errors
- [ ] Page loads with correct styles
- [ ] No console errors in browser

#### Core Functionality
- [ ] Connect Wallet button opens wallet modal
- [ ] Wallet options (Xverse, Unisat) visible and clickable
- [ ] Close button (×) closes wallet modal
- [ ] ESC key closes wallet modal
- [ ] Click outside modal closes it
- [ ] Prepare Purchase button hidden when disconnected

#### Navigation
- [ ] Home link works
- [ ] Activity link works
- [ ] Policy link works
- [ ] Collection cards link to collection pages
- [ ] Mobile menu opens and links work
- [ ] Desktop nav links hidden on mobile

#### Responsive
- [ ] Desktop layout works (>900px)
- [ ] Tablet layout works (600-900px)
- [ ] Mobile layout works (<600px)
- [ ] Dropdown menus appear above other content

### Common Pitfalls

1. **CSS not loading**: All styles MUST be in the single Tailwind CSS file

2. **Wallet modal broken**: Don't use `hidden` class — use `data-state` CSS selectors

3. **Wallet modal / dropdown behind content**: Transform on header traps children. Use transform on `::after` pseudo-element instead.

4. **Prepare Purchase button visible when disconnected**: CSS specificity issue. Use `!important` on `.show-on-connected` rules.

5. **Nav links AND hamburger both showing on mobile**: Don't use inline `style="display: flex"` — it overrides media queries.

6. **Sticky positioning broken on mobile**: Add media query to set `position: static`.

7. **Click outside modal doesn't close it**: For full-screen overlays, add a backdrop element with `click->wallet#close`.

8. **Buttons not working**: Check `data-action` attributes preserved from reference theme.

9. **Missing styles**: Check `.theme-{name}` prefix on all custom selectors.

10. **Color variables undefined**: Check `@theme` block has all required variables.

11. **Implementation doesn't match proposal**: This is the #1 issue. To fix:
    - Read the proposal HTML file section by section
    - Copy CSS rules directly from the proposal's `<style>` tags
    - Use the exact same class names (don't rename `two-col` to `detail-two-col`)
    - Use grep to find CSS: `grep -A 20 ".class-name" tmp/themes/{name}.html`
    - Compare each page visually against the proposal before moving on

### Inspiration Sources

#### Galleries & Institutions
**Blue Chip Galleries**: Gagosian, White Cube, Pace, David Zwirner, Hauser & Wirth, Zwirner
**Auction Houses**: Christie's, Sotheby's, Phillips, Bonhams, Heritage Auctions
**Museums**: MoMA, Tate Modern, Centre Pompidou, Guggenheim, Whitney, LACMA
**Private Foundations**: Fondation Louis Vuitton, Pinault Collection, Broad, Rubell
**Photography**: Magnum Photos, Aperture, ICP

#### Publications & Editorial
**Art Magazines**: Artforum, Frieze, Mousse, Flash Art, Art in America
**Culture/Lifestyle**: Apartamento, Fantastic Man, The Gentlewoman, MacGuffin, Inventory
**Design**: Eye Magazine, Print, Communication Arts, It's Nice That
**Independent**: Dazed, i-D, AnOther, SSENSE, 032c
**Literary**: The Paris Review, Granta, n+1, McSweeney's

#### Graphic Design Studios
**Legendary**: Peter Saville, M/M Paris, Experimental Jetset, OK-RM
**Contemporary**: Non-Format, Spin, North, Base Design, Pentagram
**Type-Focused**: Emigre, House Industries, Commercial Type, Colophon
**Swiss**: Müller-Brockmann, Weingart, Hofmann, Ruder
**Japanese**: Kenya Hara, Kashiwa Sato, Nagi Noda, Groovisions

#### Fashion Houses
**Luxury**: Hermès, Bottega Veneta, Celine (Phoebe Philo era), The Row, Loro Piana
**Avant-Garde**: Comme des Garçons, Maison Margiela, Rick Owens, Yohji Yamamoto
**Contemporary**: Acne Studios, Jil Sander, Lemaire, Auralee
**Streetwear-Luxury**: Sacai, Undercover, Number (N)ine

#### Fine Art Movements
**Minimalism**: Donald Judd, Dan Flavin, Agnes Martin, Robert Morris, Sol LeWitt
**Pop Art**: Andy Warhol, Roy Lichtenstein, Claes Oldenburg, James Rosenquist
**Abstract Expressionism**: Rothko, de Kooning, Pollock, Franz Kline
**Conceptual**: Lawrence Weiner, Joseph Kosuth, Barbara Kruger, Jenny Holzer
**Contemporary**: Gerhard Richter, Anselm Kiefer, Kara Walker, Julie Mehretu
**Photography**: Richard Avedon, Irving Penn, Helmut Newton, Peter Lindbergh

#### Historical Art & Design
**Movements**: Bauhaus, De Stijl, Constructivism, Suprematism, Futurism, Art Deco
**Schools**: Vienna Secession, Arts & Crafts, Swiss International Style
**Artists**: El Lissitzky, Rodchenko, Moholy-Nagy, Cassandre, A.M. Cassandre
**Typography**: Jan Tschichold, Paul Renner, Adrian Frutiger, Hermann Zapf

#### Film & Cinema
**Title Designers**: Saul Bass, Kyle Cooper, Pablo Ferro, Maurice Binder
**Directors (Visual Style)**: Kubrick, Wong Kar-wai, Wes Anderson, David Lynch, Nicolas Winding Refn
**Cinematographers**: Roger Deakins, Emmanuel Lubezki, Vittorio Storaro
**Genres**: Film Noir, French New Wave, Italian Neorealism, Giallo
**Studios**: A24, Criterion Collection, Arrow Video

#### Music & Record Labels
**Iconic Labels**: Factory Records, 4AD, ECM, Blue Note, Impulse!, Warp
**Album Art**: Hipgnosis, Vaughan Oliver, Peter Saville, Stefan Sagmeister
**Visual Identity**: Sub Pop, Rough Trade, Def Jam, XL Recordings
**Music Videos**: Michel Gondry, Spike Jonze, Chris Cunningham, Hiro Murai

#### Japanese Pop Culture
**Animation Studios**: Studio Ghibli, Gainax, Madhouse, Sunrise, Trigger
**Manga Publishers**: Shonen Jump, Kodansha, Shogakukan
**Artists**: Takashi Murakami, Yoshitomo Nara, Kaws (Japanese influence)
**Aesthetic Concepts**: Wabi-sabi, Ma (空白), Kawaii, Iki

#### Gaming & Digital
**Retro Gaming**: Nintendo (NES/SNES era), Sega Genesis, PlayStation 1
**Modern**: FromSoftware (Dark Souls aesthetic), Remedy (Control), Supergiant
**UI Inspiration**: Bloomberg terminal, early Mac OS, NeXT, BeOS
**Web**: brutalistwebsites.com, Hoverstat.es, siteinspire.com

#### Architecture
**Modernism**: Le Corbusier, Mies van der Rohe, Tadao Ando, Louis Kahn
**Brutalism**: Barbican, Habitat 67, National Theatre London
**Contemporary**: Zaha Hadid, Herzog & de Meuron, OMA, SANAA
**Interiors**: Axel Vervoordt, Vincent Van Duysen, John Pawson

#### Product & Industrial Design
**Iconic Designers**: Dieter Rams, Naoto Fukasawa, Jasper Morrison
**Brands**: Muji, Braun, Vitsœ, Bang & Olufsen
**Contemporary**: Teenage Engineering, Nothing, KINTO

#### Pop Culture References
**Nostalgia**: VHS rental stores, Polaroid, analog photography, film cameras
**Retro-Futurism**: Space Age 1960s, Y2K aesthetic, Vaporwave
**Subcultures**: Punk zines, rave flyers, skateboard graphics, tattoo flash
**Ephemera**: Airline tickets, stamps, receipts, index cards, library cards
