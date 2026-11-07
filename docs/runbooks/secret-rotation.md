# Secret Rotation Runbook (Phase 6.4 - A6.4)

> **Document Version:** 1.0  
> **Applies to:** Production & Staging AWS Environments (`ap-south-1`)  
> **Target Audience:** DevOps, Security Operations, and On-Call Engineers

---

## 1. Overview & Key Inventory

MediFlow relies on cryptographic keys and service tokens to protect patient records, billing documents, and multi-tenant boundary integrity.

| Secret Name | Purpose | Impact of Rotation | Grace Period Support |
|---|---|---|---|
| `APP_ENCRYPTION_KEY` | AES-256-GCM encryption for third-party credentials at rest in DB | Decryption fails for older rows unless dual-key re-encryption is run | Dual-key migration |
| `SESSION_SECRET` | Signs and verifies user session cookies (`mediflow_session`) | Forces all logged-in dashboard users to re-authenticate | None (immediate invalidation) |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | Encrypts Next.js Server Action closures across ECS instances | Rolling deployment instances must share the same key to avoid 400 Bad Request | Rolling cutover |
| `CRON_SECRET` | Authenticates scheduled API triggers (`/api/cron/*`) | Scheduled jobs fail with 401 until EventBridge/Cron is updated | Immediate cutover |
| `WHATSAPP_APP_SECRET` | Verifies Meta HMAC-SHA256 inbound webhook signatures | Inbound WhatsApp receipt webhooks fail verification | Dual-secret handshake |

---

## 2. Scheduled Rotation Procedures (Zero-Downtime)

### 2.1 Next.js Multi-Instance Server Actions Key (`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`)
1. **Generate New Key**:
   ```bash
   openssl rand -base64 32
   ```
2. **Update AWS Secrets Manager**:
   Store the new key in AWS Secrets Manager under `prod/mediflow/NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`.
3. **Deploy with Maintenance Window or Synchronized Restart**:
   - Because Server Action closures created by an old instance cannot be decrypted by a new instance with a different key, trigger a controlled rolling ECS deployment during low-traffic counter hours (02:00–04:00 IST).
   - Ensure ECS deployment minimum healthy percent is 100% and maximum percent is 200%.

### 2.2 Database At-Rest Encryption Key (`APP_ENCRYPTION_KEY`)
1. **Generate New Key**:
   ```bash
   openssl rand -base64 32
   ```
2. **Run Dual-Key Re-encryption Script**:
   Run the background re-encryption task providing both old and new keys:
   ```bash
   OLD_APP_KEY="<current-key>" NEW_APP_KEY="<new-key>" npm run db:reencrypt-secrets
   ```
   This reads rows encrypted with `OLD_APP_KEY`, verifies AES-GCM tag, decrypts, re-encrypts with `NEW_APP_KEY`, and atomically updates database rows inside tenant transactions.
3. **Update Environment Variable in AWS ECS Task Definition**:
   Update `APP_ENCRYPTION_KEY` to the new key and redeploy.

### 2.3 Scheduled Cron Secret (`CRON_SECRET`)
1. Generate a 32-character random token:
   ```bash
   openssl rand -hex 24
   ```
2. Update Amazon EventBridge target header `Authorization: Bearer <new-cron-secret>`.
3. Update `CRON_SECRET` in ECS Task Definition simultaneously.

---

## 3. Emergency Rotation Protocol (Suspected Compromise)

In the event of an unauthorized credential disclosure or leaked token alert:

1. **Declare Security Incident**: Open an incident channel `#incident-security` and notify Lane A and Lane B leads.
2. **Identify Exposed Secret**: Determine the specific credential, commit, or log location.
3. **Immediate Revocation**:
   - For `SESSION_SECRET`: Rotate immediately in Secrets Manager and trigger `aws ecs update-service --force-new-deployment`. This terminates all active sessions globally, requiring all users to re-login with their credentials.
   - For POS/Device Tokens: Execute device revocation:
     ```sql
     UPDATE devices SET status = 'revoked', revoked_at = NOW() WHERE id = '<compromised_device_id>';
     ```
   - For API Keys: Revoke via `/api/v1` key manager or SQL:
     ```sql
     UPDATE api_keys SET revoked_at = NOW() WHERE id = '<compromised_key_id>';
     ```
4. **Run Gitleaks Audit**:
   Verify no remnants of the leaked secret remain in git history:
   ```bash
   gitleaks detect --source . -v
   ```
5. **Log Security Audit Record**:
   Record the incident cause, rotation timestamps, and affected tenant counts in `reports/security-audits/`.
