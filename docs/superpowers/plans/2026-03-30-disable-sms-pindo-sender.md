# Disable SMS While Pindo Registers RWB Sender Name

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Disable all outbound SMS while Pindo registers the "RWB" sender name, with clear hints throughout the code to re-enable when registration is confirmed.

**Architecture:** Introduce a single `SMS_ENABLED` environment variable (default `false` when absent). Guard it at every SMS dispatch point: the core `PindoClient`, the verify-phone route (which bypasses the client), and the test-sms route. No call-site logic changes — just guards that log a clear re-enable hint.

**Tech Stack:** Next.js App Router, TypeScript, `lib/pindo-client.ts`, direct `fetch` calls to Pindo API.

---

## Files Modified

| File | Change |
|------|--------|
| `lib/pindo-client.ts` | Add `SMS_ENABLED` guard at top of `makeRequest()` |
| `app/api/auth/verify-phone/send/route.ts` | Add `SMS_ENABLED` guard before Pindo `fetch` |
| `app/api/test-sms/route.ts` | Add `SMS_ENABLED` guard at route entry |
| `env.template` | Add `SMS_ENABLED=false` with re-enable instructions |

---

## Task 1: Disable SMS in Core PindoClient

**Files:**
- Modify: `lib/pindo-client.ts:67-106`

All notification SMS (submission, transfer, final-decision) flow through `PindoClient.makeRequest()`. Add the guard there.

- [ ] **Step 1: Add `SMS_ENABLED` guard to `makeRequest()`**

In `lib/pindo-client.ts`, replace the existing `makeRequest` method (lines 67–106):

```typescript
  private async makeRequest<T = PindoResponse>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' = 'POST',
    data?: any
  ): Promise<T> {
    // ─────────────────────────────────────────────────────────────────────────
    // SMS DISABLED — waiting for Pindo to register sender name "RWB"
    // To re-enable SMS:
    //   1. Confirm with Pindo support that "RWB" sender ID is approved
    //   2. Set SMS_ENABLED=true in .env.local / .env.production
    //   3. Set PINDO_SENDER_NAME=RWB
    //   4. Set PINDO_DEVELOPMENT_MODE=false
    // ─────────────────────────────────────────────────────────────────────────
    if (process.env.SMS_ENABLED !== 'true') {
      console.log(`📵 [PindoClient] SMS disabled (SMS_ENABLED != true). Skipping ${method} ${endpoint}`);
      return {} as T;
    }

    if (!this.apiKey) {
      throw new Error('Pindo API key is not configured');
    }

    const url = `${this.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    try {
      console.log(`📱 Making Pindo API request to: ${endpoint}`);

      const response = await fetch(url, {
        method,
        headers,
        body: data ? JSON.stringify(data) : undefined,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Pindo API error (${response.status}):`, errorText);
        throw new Error(`Pindo API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log(`✅ Pindo API response:`, result);

      return result as T;
    } catch (error) {
      console.error('❌ Error making Pindo API request:', error);
      throw error;
    }
  }
```

- [ ] **Step 2: Verify the guard is in place**

```bash
grep -n "SMS_ENABLED" /Users/nourumuneza/go/src/waterpermit/lib/pindo-client.ts
```

Expected output: line numbers showing the `SMS_ENABLED` check.

- [ ] **Step 3: Commit**

```bash
cd /Users/nourumuneza/go/src/waterpermit
git add lib/pindo-client.ts
git commit -m "feat: disable SMS in PindoClient until RWB sender name is registered"
```

---

## Task 2: Disable SMS in Verify-Phone Route

**Files:**
- Modify: `app/api/auth/verify-phone/send/route.ts:86-117`

This route calls Pindo directly (bypasses `PindoClient`), so it needs its own guard.

- [ ] **Step 1: Add `SMS_ENABLED` guard before the Pindo fetch**

In `app/api/auth/verify-phone/send/route.ts`, replace the block at lines 86–117:

```typescript
    console.log('📱 Sending SMS via Pindo API...');

    // Send SMS via Pindo
    let smsResponse: Response | null = null;
    let smsResult: any = null;
    try {
      if (isDevelopmentMode) {
        // Skip external SMS in development mode; proceed to DB storage.
        smsResponse = { ok: true } as any;
      } else if (process.env.SMS_ENABLED !== 'true') {
        // ─────────────────────────────────────────────────────────────────────
        // SMS DISABLED — waiting for Pindo to register sender name "RWB"
        // To re-enable SMS:
        //   1. Confirm with Pindo support that "RWB" sender ID is approved
        //   2. Set SMS_ENABLED=true in .env.local / .env.production
        //   3. Set PINDO_SENDER_NAME=RWB
        //   4. Set PINDO_DEVELOPMENT_MODE=false
        // ─────────────────────────────────────────────────────────────────────
        console.log('📵 [verify-phone] SMS disabled (SMS_ENABLED != true). Skipping Pindo call.');
        smsResponse = { ok: true } as any;
      } else {
      smsResponse = await fetch('https://api.pindo.io/v1/sms/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: normalizedPhone,
          text: message,
          sender: senderName,
        }),
      });
      smsResult = await smsResponse.json().catch(() => null);
      console.log('📱 Pindo response received');
      }
    } catch (networkError) {
      // In local/dev environments, Pindo may be unreachable (no network). Still proceed with DB storage.
      if (process.env.NODE_ENV !== 'production') {
        console.warn('⚠️ Pindo unreachable in dev; proceeding without SMS delivery');
        smsResponse = { ok: true } as any;
      } else {
      throw networkError;
      }
    }
```

- [ ] **Step 2: Verify the guard is in place**

```bash
grep -n "SMS_ENABLED" /Users/nourumuneza/go/src/waterpermit/app/api/auth/verify-phone/send/route.ts
```

Expected: a line with the `SMS_ENABLED` check.

- [ ] **Step 3: Commit**

```bash
cd /Users/nourumuneza/go/src/waterpermit
git add app/api/auth/verify-phone/send/route.ts
git commit -m "feat: disable SMS in verify-phone route until RWB sender name is registered"
```

---

## Task 3: Disable SMS in Test-SMS Route

**Files:**
- Modify: `app/api/test-sms/route.ts:1-62`

This test endpoint calls Pindo directly. Disable it with a clear hint.

- [ ] **Step 1: Add `SMS_ENABLED` guard at the top of the POST handler**

In `app/api/test-sms/route.ts`, replace the entire file:

```typescript
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  // ─────────────────────────────────────────────────────────────────────────
  // SMS DISABLED — waiting for Pindo to register sender name "RWB"
  // To re-enable SMS:
  //   1. Confirm with Pindo support that "RWB" sender ID is approved
  //   2. Set SMS_ENABLED=true in .env.local / .env.production
  //   3. Set PINDO_SENDER_NAME=RWB
  //   4. Set PINDO_DEVELOPMENT_MODE=false
  // ─────────────────────────────────────────────────────────────────────────
  if (process.env.SMS_ENABLED !== 'true') {
    return NextResponse.json({
      success: false,
      disabled: true,
      message: 'SMS is currently disabled (SMS_ENABLED != true). Set SMS_ENABLED=true once Pindo confirms the RWB sender name is registered.',
    }, { status: 503 });
  }

  try {
    const { phoneNumber } = await request.json();

    const apiKey = process.env.PINDO_API_KEY;
    const senderName = process.env.PINDO_SENDER_NAME || 'RWB';

    console.log('🔧 Environment test:', {
      hasApiKey: !!apiKey,
      senderName,
      developmentMode: process.env.PINDO_DEVELOPMENT_MODE,
    });

    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: 'No API key found in environment'
      }, { status: 400 });
    }

    // Test SMS sending directly
    const message = `Test SMS from Rwanda Water Resources Board. Code: 123456`;

    const response = await fetch('https://api.pindo.io/v1/sms/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: phoneNumber,
        text: message,
        sender: senderName,
      }),
    });

    const result = await response.json();

    console.log('📱 Pindo API test result:', result);

    return NextResponse.json({
      success: response.ok,
      status: response.status,
      result,
      config: {
        hasApiKey: !!apiKey,
        senderName,
        developmentMode: process.env.PINDO_DEVELOPMENT_MODE,
      }
    });

  } catch (error) {
    console.error('❌ Test SMS error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify**

```bash
grep -n "SMS_ENABLED" /Users/nourumuneza/go/src/waterpermit/app/api/test-sms/route.ts
```

Expected: the guard at the top.

- [ ] **Step 3: Commit**

```bash
cd /Users/nourumuneza/go/src/waterpermit
git add app/api/test-sms/route.ts
git commit -m "feat: disable test-sms endpoint until RWB sender name is registered"
```

---

## Task 4: Update env.template with SMS_ENABLED

**Files:**
- Modify: `env.template:8-10`

- [ ] **Step 1: Update the Pindo section in env.template**

In `env.template`, replace the existing Pindo block:

```
# Pindo.io SMS API Configuration
PINDO_API_KEY=your_pindo_api_key_here
PINDO_SENDER_NAME=Pindo
```

With:

```
# Pindo.io SMS API Configuration
PINDO_API_KEY=your_pindo_api_key_here
# ── SMS ENABLED FLAG ──────────────────────────────────────────────────────────
# SMS is currently DISABLED while Pindo registers the "RWB" sender name.
# To re-enable SMS once Pindo confirms the sender ID is approved:
#   1. Set SMS_ENABLED=true
#   2. Set PINDO_SENDER_NAME=RWB
#   3. Set PINDO_DEVELOPMENT_MODE=false
# ─────────────────────────────────────────────────────────────────────────────
SMS_ENABLED=false
PINDO_SENDER_NAME=RWB
PINDO_DEVELOPMENT_MODE=false
```

- [ ] **Step 2: Verify**

```bash
grep -n "SMS_ENABLED" /Users/nourumuneza/go/src/waterpermit/env.template
```

Expected: the `SMS_ENABLED=false` line.

- [ ] **Step 3: Commit**

```bash
cd /Users/nourumuneza/go/src/waterpermit
git add env.template
git commit -m "docs: document SMS_ENABLED flag and re-enable steps in env.template"
```

---

## Self-Review

### Spec Coverage
- [x] Disable SMS — all three dispatch points guarded (`PindoClient.makeRequest`, verify-phone route, test-sms route)
- [x] `PindoTest` not used in any new code — sender stays `RWB` in all files
- [x] Hints to re-enable — same 4-step comment block added at every guard

### Placeholder Scan
None — all code blocks are complete and exact.

### Type Consistency
No new types introduced — `{} as T` is consistent with the existing `PindoResponse` interface (all fields optional).

---

## How to Re-enable SMS (checklist for when Pindo confirms "RWB")

1. Get Pindo confirmation that sender name `RWB` is registered
2. In `.env.local` and `.env.production`:
   ```
   SMS_ENABLED=true
   PINDO_SENDER_NAME=RWB
   PINDO_DEVELOPMENT_MODE=false
   ```
3. Redeploy — no code changes required
