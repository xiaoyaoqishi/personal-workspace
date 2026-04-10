# Trading Workstation Architecture (Domain-Driven Sprint)

## 1) Canonical Active Data Flow

Trading subsystem active model:
1. `Trade`  
- execution / ledger semantics only
2. `TradeReview`  
- structured per-trade review semantics (primary review workflow)
3. `TradeSourceMetadata`  
- source / broker / import semantics (metadata-first)
4. Derived analytics  
- query outputs for review/research, not storage source-of-truth

Request flow (active path):
- List/detail APIs return trade ledger + source/review presence view fields.
- Review editing writes `TradeReview`.
- Source editing writes `TradeSourceMetadata`.
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

## 3) Backend Module Split (this sprint)

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

Goal:
- reduce trading logic concentration in `main.py`
- keep endpoint behavior stable
- make trade domain logic easier to reason about and extend

## 4) Frontend Workspace Split (this sprint)

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

## 5) How this supports trading research

The system now better supports:
- opportunity structure analysis
- edge source analysis
- failure type analysis
- review conclusion vs pnl comparison
- source/broker performance slices
- structured coverage tracking (review/source metadata vs legacy-only)

This shifts the product from “recording trades” toward “researching discretionary edge”.
