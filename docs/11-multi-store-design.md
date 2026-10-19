# 11 · Multi-store (chain) design

**Status:** proposed. Owners: Lane A (stores, switching, transfers, warehouse) and Lane B (central purchasing, consolidated reports, per-GSTIN GST). Built in Phase 3.

## What already exists

- `tenants` = the business (the chain). `stores` = branches, each with its own `state_code`, `gstin`, `drug_license_no` and `invoice_prefix`.
- `memberships.all_stores` / `memberships.store_ids`: which branches a user may access.
- `sessions.store_id`: the branch the user is working in right now.
- The catalogue (`medicines`) is **tenant-wide**. Stock (`batches`) is **per store**. That's the right split: one item master, stock per branch.

## Concepts to add

### Store kinds
Add `stores.kind`: `retail | warehouse`. A warehouse (central godown) has stock, receives purchases and dispatches transfers, but **has no POS**. The POS route rejects warehouse stores.

### Store switching
- `switchStore(storeId)` server action (Lane A). It checks that `membership.allStores || membership.storeIds.includes(storeId)`, then updates `sessions.store_id`. Revalidate the layout.
- `StoreSwitcher` component in the Topbar, replacing the README's "branch switcher" placeholder. Hotkey `Ctrl+Shift+S`.
- Login picks the **last used store** (new column `memberships.last_store_id`), else the first allowed store. **Fix:** login today ignores `store_ids`.

### Stock transfers (branch ↔ branch, warehouse → branch)

New tables (`schema/inventory.ts`):

```
stock_transfers
  id, tenant_id, transfer_no, from_store_id, to_store_id,
  status: draft | dispatched | received | cancelled,
  doc_kind: delivery_challan | tax_invoice,   -- decided by GSTINs (below)
  gst_document_id (nullable), e_way_bill_no (nullable),
  created_by, dispatched_by, dispatched_at, received_by, received_at, notes, created_at

stock_transfer_items
  id, tenant_id, transfer_id, medicine_id,
  from_batch_id, batch_no, expiry_date, qty, received_qty,
  unit_cost, mrp, sale_rate, to_batch_id (set on receive)
```

Lifecycle:
1. **Draft**: the source store picks items and batches (FEFO suggested).
2. **Dispatch**: in one transaction, for each line, `recordStockMovement(type: "transfer_out", refType: "stock_transfer")`. Stock is now **in transit**: it belongs to neither store. Number from `nextDocNumber(…, "stock_transfer")`.
3. **Receive** (by the destination store): for each line, find or create the destination batch with the same `batch_no`, expiry, MRP and cost in `to_store`, then `recordStockMovement(type: "transfer_in")`. Short-received quantities create a **discrepancy** that a manager resolves: write off as damage, or return to source.
4. **Cancel**: allowed only in draft, or after dispatch with an automatic reverse `transfer_in` to the source.

**GST treatment** (doc 05 §2): if `from_store.gstin === to_store.gstin`, generate a **delivery challan** with no tax. If they're different GSTINs, it's a **taxable supply**: generate a tax invoice from source to destination at cost (Lane B hook `createGstDocumentFromTransfer`). It's also an inward purchase for the destination GSTIN, with ITC. If the value is over ₹50,000, prompt for an e-way bill.

In-transit stock report: transfers in `dispatched` status, valued at cost.

### Branch requisitions (Phase 3, stretch)
A branch requests items from the warehouse (`stock_requisitions`, `stock_requisition_items`, status `requested → approved → fulfilled`). Fulfilling creates a transfer pre-filled with the approved quantities. Reorder suggestions (Lane B) can auto-create requisitions.

### Central purchasing (Lane B)
- A PO can be raised **for the warehouse**, followed by transfers to branches. Alternatively, a **split PO** for several branches creates one PO per branch from a single screen.
- **Reorder suggestions:** per store, `reorder_level` vs on-hand plus in-transit plus open PO quantity. Optionally use sales velocity: average daily sales over 30 days × supplier lead time × safety factor.
- **Per-store reorder levels:** add `store_medicine_settings (store_id, medicine_id, reorder_level, max_stock, rack_id)` and fall back to `medicines.reorder_level`. Racks are already per store, so `medicines.rack_id` is wrong for chains. Move it to this table.

### Per-store prices
The selling price already lives on `batches.sale_rate`, which is per store. Add an optional `store_medicine_settings.sale_price_override`. Price-change permission is `medicine.manage` at tenant level.

### Consolidated reporting (Lane B)
- Every report gets a store filter: *This store* (default), *All stores* or *Choose stores*. "All stores" needs a new permission, `report.all_stores`.
- Owner dashboard: sales, margin and stock value by branch; expiry risk by branch; **expiry redistribution suggestions** ("Branch 2 holds 40 strips of X expiring in 60 days; Branch 5 sells 30/month → transfer").
- GST returns are **per GSTIN**: the GSTR-1 screen picks a GSTIN, not a store, and aggregates every store under that GSTIN.

### Permissions to add (`src/lib/permissions.ts`)
`store.switch_any` (bypasses store_ids, for owners), `inventory.transfer` (exists), `inventory.transfer_receive`, `report.all_stores`, `store.manage`.

## UI map

| Page | Lane |
|---|---|
| `/dashboard/settings/stores` (list, create, edit; kind, GSTIN, licence, invoice prefix with 16-char validation) | A |
| `/dashboard/settings/users` (invite, role, allowed stores) | A |
| `/dashboard/inventory/transfers` (list, new, dispatch, receive) | A |
| `/dashboard/inventory/transfers/[id]/print` (delivery challan) | A |
| `/dashboard/purchases/reorder` (suggestions → PO / requisition) | B |
| `/dashboard/reports/chain` (owner cross-store dashboard) | B |
