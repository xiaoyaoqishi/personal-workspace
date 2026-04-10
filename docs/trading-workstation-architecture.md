# Trading Workstation Architecture (Domain-Driven Sprint)

## 1) Canonical Active Data Flow

Trading subsystem active model:
1. `Trade`  
- execution / ledger semantics only
2. `TradeReview`  
- structured per-trade review semantics (primary review workflow)
3. `TradeSourceMetadata`  
- source / broker / import semantics (metadata-first)
4. `Review` + `ReviewTradeLink`  
- multi-trade / periodic / themed review session object
- explicit many-trade association for “best/worst/representative/linked” samples
5. `TagTerm` + link tables  
- canonical multi-tag model for `TradeReview` / `Review` / `KnowledgeItem`
- API active contract is `tags: string[]` (legacy text tag fields are compatibility-only mirrors)
6. `KnowledgeItem`  
- trading-oriented knowledge/reference object (pattern/playbook/regime/risk/etc.)
7. Derived analytics  
- query outputs for review/research, not storage source-of-truth

Request flow (active path):
- List/detail APIs return trade ledger + source/review presence view fields.
- Review editing writes `TradeReview`.
- Source editing writes `TradeSourceMetadata`.
- Periodic/theme review editing writes `Review`, and sample binding writes `ReviewTradeLink`.
- Linked-trade reads use backend-assembled `trade_summary` (no frontend N+1 lookup).
- Tag writes use link-table sync; API returns normalized `tags` arrays.
- Information maintenance writes `KnowledgeItem` (broker is one category, not the whole model).
- Dashboard analytics reads explicit dimensions from `Trade`, `TradeReview`, `TradeSourceMetadata`.

## 2) Compatibility-Only Paths

Still preserved:
- Paste import entry workflow (`/api/trades/import-paste`)
- Core matching semantics:
  - same-batch close-before-open
  - partial close split
  - broker-scoped matching
- Existing statistics/positions business meaning
- `notes` / `review_note` as compatibility fields

Demoted to secondary role:
- Parsing source from `notes` is fallback only when explicit metadata is absent.
- `review_note` is no longer the primary review path.
- `review_tags` / `reviews.tags` / `knowledge_items.tags` text columns are compatibility snapshots only.
- “信息维护=仅券商” is no longer primary mental model; broker maintenance is now compatibility/auxiliary path.

## 3) UI Read/Edit Dual-State Rule (Active UX Contract)

All trading-domain editable content should have clear two states:
1. Read-only (default)
- strong readability, card/description-first layout
- optimized for quick scan
2. Edit
- focused controls only when needed
- explicit save/cancel

Applied in active paths:
- Trade detail drawer: structured review / source metadata / legacy compatibility fields (section-level edit)
- Review workspace: review content + linked-trade editing in edit mode, content cards in read mode
- Knowledge workspace: knowledge and broker modules now support read-only default + edit mode switch

## 4) Backend Module Split (this sprint)

New domain modules:
- `backend/trading/source_service.py`
  - source extraction/merge logic
  - source keyword filter
  - trade view enrichment fields
- `backend/trading/analytics_service.py`
  - multi-dimensional analytics aggregation
- `backend/trading/import_service.py`
  - staged paste import pipeline internals:
    1. parse + open dedup
    2. close precheck
    3. apply opens/closes + metadata write
- `backend/trading/review_service.py`
  - review scope normalization
  - review-trade link role normalization
  - review link attach/sync logic
- `backend/trading/knowledge_service.py`
  - knowledge list/query helpers
  - knowledge payload normalization
  - category discovery endpoint helper

Goal:
- reduce trading logic concentration in `main.py`
- keep endpoint behavior stable
- make trade domain logic easier to reason about and extend

## 5) Frontend Workspace Split (this sprint)

Trade workspace orchestration moved to:
- `frontend/src/features/trading/workspace/useTradeWorkspace.js`

Page composition:
- `TradeList.jsx` = shell + component wiring only
- workspace components keep focused concerns:
  - filter bar
  - fills table
  - positions table
  - detail drawer
  - import modal
  - batch edit modal

Result:
- lower page-level orchestration bloat
- less duplicate load/save logic
- faster iteration on review-first and metadata-first workflows

Additional workspace upgrades:
- `ReviewList` rebuilt into review research workspace:
  - list + editor + linked-trades panel
  - supports explicit review-trade association workflow
  - supports `review_scope` filtering
  - read-mode linked trades are rendered as content cards (date/symbol/direction/qty/open-close/pnl/source/role)
- `BrokerManage` rebuilt into information maintenance workspace:
  - knowledge module (primary)
  - broker module (compatible auxiliary)
  - reduced modal-heavy operations for daily maintenance
  - read-only/edit dual-state and real multi-tag editing/filtering

## 6) How this supports trading research

The system now better supports:
- opportunity structure analysis
- edge source analysis
- failure type analysis
- review conclusion vs pnl comparison
- source/broker performance slices
- structured coverage tracking (review/source metadata vs legacy-only)
- linking periodic/themed conclusions back to concrete trade samples
- converting recurring conclusions into reusable knowledge items

This shifts the product from “recording trades” toward “researching discretionary edge”.
