# MediFlow Database Disaster Recovery & Restore Runbook

> **Target Environment:** Managed PostgreSQL (AWS RDS / Neon in Mumbai `ap-south-1`)  
> **Recovery Objectives:** RPO $\le 15\text{ min}$ · RTO $\le 60\text{ min}$  
> **Classification:** Confidential · Operational Runbook  

---

## 1. Objectives & Recovery Metrics

| Metric | Target | Implementation Mechanism |
| :--- | :--- | :--- |
| **RPO (Recovery Point Objective)** | $\le 15\text{ minutes}$ | Continuous Write-Ahead Log (WAL) archiving to encrypted S3 with automated Point-in-Time Recovery (PITR). |
| **RTO (Recovery Time Objective)** | $\le 60\text{ minutes}$ | Automated snapshot restoration and container re-targeting with scripted health validation. |
| **Backup Retention** | 30 days (Daily) · 12 months (Monthly) | AWS S3 Lifecycle Policy with KMS encryption (`aws:kms`) in `ap-south-1`. |

---

## 2. Backup Architecture & Policies

### 2.1 Automated Continuous WAL Archiving (PITR)
- Managed PostgreSQL automatically ships WAL segments to durable S3 storage every 5 minutes or 16 MB.
- Enables point-in-time recovery to any second within the retention window (default 30 days).

### 2.2 Daily Logical Snapshots (`pg_dump`)
In addition to physical WAL archiving, a logical snapshot is taken every midnight IST (18:30 UTC):
```bash
# Automated cron backup script
TIMESTAMP=$(date -u +%Y%m%d_%H%M%SZ)
pg_dump -Fc --no-owner --no-privileges "$DATABASE_URL" \
  | aws s3 cp - "s3://mediflow-backups-mumbai/logical/mediflow_${TIMESTAMP}.dump" \
      --sse aws:kms --sse-kms-key-id "$BACKUP_KMS_KEY_ARN"
```

---

## 3. Step-by-Step Recovery Drill Procedure

> [!CAUTION]
> **Safety Rule:** Never execute a recovery drill against the active production database! Always restore into an isolated recovery instance (e.g. `mediflow_restore_drill`).

### Step 1: Provision Isolated Recovery Target
```bash
# Example local or staging recovery database
createdb -h localhost -p 5433 -U mediflow mediflow_recovery_drill
```

### Step 2: Retrieve and Restore Logical Dump
```bash
# 1. Download target backup snapshot from S3
aws s3 cp s3://mediflow-backups-mumbai/logical/mediflow_YYYYMMDD_HHMMSSZ.dump ./recovery.dump

# 2. Restore schema and data using pg_restore
pg_restore -h localhost -p 5433 -U mediflow -d mediflow_recovery_drill \
  --clean --if-exists --no-owner --no-privileges recovery.dump
```

### Step 3: Or Trigger Point-In-Time Recovery (PITR)
On AWS RDS:
```bash
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier mediflow-prod-db \
  --target-db-instance-identifier mediflow-restored-db \
  --restore-time "2026-11-06T15:30:00Z" \
  --db-instance-class db.t4g.medium \
  --publicly-accessible false \
  --region ap-south-1
```

---

## 4. Post-Restore Invariant Verification Drill

Immediately after restoration, execute the automated business invariant verification suite:

```bash
DATABASE_URL="postgres://mediflow:mediflow@localhost:5433/mediflow_recovery_drill" \
  npx tsx scripts/verify-restore-invariants.ts
```

### Required Verification Checklist
1. **Double-Entry General Ledger Balance**:
   - `SUM(debit) == SUM(credit)` across all journal lines. Discrepancy must equal 0 paise.
2. **Inventory Stock Ledger Reconciliation**:
   - Every batch's `qty_on_hand` equals the sum of its ledger movements plus opening balance.
3. **Zero Negative Stock**:
   - `SELECT COUNT(*) FROM batches WHERE qty_on_hand < 0` must return 0.
4. **Sales vs. Payment Matching**:
   - For all completed sales, `total_amount == paid_amount + credit_amount`.
5. **Multi-Tenant Boundary Scoping**:
   - No rows link across tenant boundaries (e.g. batch `tenant_id` matches medicine `tenant_id`).
6. **PostgreSQL Sequence Synchronization**:
   - All sequence counters are $\ge \text{MAX}(id)$ to prevent primary key collision errors on new inserts.

---

## 5. Cutover & Service Re-targeting

Once all invariants pass:
1. Update database connection string in AWS Secrets Manager (`DATABASE_URL`).
2. Execute a pre-traffic readiness probe:
   ```bash
   npx tsx scripts/verify-deployment-health.ts --url "https://app.mediflow.in"
   ```
3. Issue an ECS rolling update to point application containers to the newly restored instance.
4. Verify application logs and outbox queue processing resume cleanly.
