# 🏗️ IremboPay Integration - System Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER (Applicant)                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             v
┌─────────────────────────────────────────────────────────────────┐
│                   Next.js Frontend (React)                      │
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │ Application Form │  │   Payment Tab    │  │ Payment      │ │
│  │  (4 sections)    │──│  (Section 5)     │──│ Status       │ │
│  └──────────────────┘  └──────────────────┘  └──────────────┘ │
│                             │                                   │
│                             │ usePayment Hook                   │
│                             v                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           IremboPayWidget Component                      │  │
│  │  (Embeds IremboPay Checkout)                            │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             v
┌─────────────────────────────────────────────────────────────────┐
│                    Next.js API Routes                           │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  POST /api/payments/initiate                             │  │
│  │  - Validates application                                 │  │
│  │  - Creates payment record                                │  │
│  │  - Calls IremboPay API                                   │  │
│  │  - Returns payment URL                                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  POST /api/payments/webhook                              │  │
│  │  - Receives IremboPay callbacks                          │  │
│  │  - Validates signature                                   │  │
│  │  - Updates payment status                                │  │
│  │  - Updates application status                            │  │
│  │  - Generates receipt                                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  GET /api/payments/[id]/status                           │  │
│  │  - Checks payment status                                 │  │
│  │  - Verifies with IremboPay                               │  │
│  │  - Returns current state                                 │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────┬───────────────────────┬────────────────────────────┘
             │                       │
             v                       v
┌────────────────────────┐  ┌──────────────────────────────────┐
│   IremboPay API        │  │     Supabase PostgreSQL          │
│                        │  │                                  │
│  - Initiate Payment    │  │  Tables:                         │
│  - Process Payment     │  │  ├── merchants                   │
│  - Send Webhooks       │  │  ├── payments                    │
│  - Status Checks       │  │  ├── payment_transactions        │
│                        │  │  ├── webhook_logs                │
│  Payment Methods:      │  │  ├── payment_receipts            │
│  ├── Mobile Money      │  │  └── applications (updated)      │
│  ├── Cards             │  │                                  │
│  ├── Bank Transfer     │  │  RLS Policies:                   │
│  └── USSD Banking      │  │  ✓ User isolation                │
└────────────────────────┘  │  ✓ Webhook access                │
                            └──────────────────────────────────┘
```

---

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend Layer                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Pages / Routes:                                                │
│  └── app/dashboard/new-application/page.tsx                     │
│      └── Uses ApplicationForm component                         │
│                                                                 │
│  Components:                                                    │
│  ├── components/dashboard/payment-tab.tsx                       │
│  │   ├── Main payment interface                                │
│  │   ├── Application summary                                   │
│  │   ├── Payment initialization                                │
│  │   └── Status monitoring                                     │
│  │                                                              │
│  ├── components/payments/irembopay-widget.tsx                   │
│  │   ├── Loads IremboPay inline script                         │
│  │   ├── Displays payment methods                              │
│  │   ├── Launches IremboPay checkout                           │
│  │   └── Handles success/failure callbacks                     │
│  │                                                              │
│  └── components/payments/payment-status.tsx                     │
│      ├── Dynamic status display                                │
│      ├── Payment details                                       │
│      └── Action buttons (retry, receipt)                       │
│                                                                 │
│  Hooks:                                                         │
│  └── hooks/usePayment.ts                                        │
│      ├── initiatePayment()                                     │
│      ├── checkStatus()                                         │
│      ├── Auto-polling                                          │
│      └── Error handling                                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────────────┐
│                        Backend Layer                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  API Routes:                                                    │
│  ├── app/api/payments/initiate/route.ts                        │
│  │   └── POST: Initiate new payment                            │
│  │                                                              │
│  ├── app/api/payments/webhook/route.ts                         │
│  │   └── POST: Process IremboPay callbacks                     │
│  │                                                              │
│  └── app/api/payments/[id]/status/route.ts                     │
│      └── GET: Check payment status                             │
│                                                                 │
│  Libraries:                                                     │
│  ├── lib/irembopay-client.ts                                   │
│  │   ├── class IremboPayClient                                 │
│  │   ├── initiatePayment()                                     │
│  │   ├── getPaymentStatus()                                    │
│  │   ├── validateWebhookSignature()                            │
│  │   └── parseWebhook()                                        │
│  │                                                              │
│  └── lib/payment-utils.ts                                      │
│      ├── formatPaymentAmount()                                 │
│      ├── validatePaymentAmount()                               │
│      ├── validateCustomerEmail()                               │
│      ├── validateCustomerPhone()                               │
│      ├── normalizeRwandaPhone()                                │
│      ├── generateReceiptNumber()                               │
│      └── mapIremboPayStatus()                                  │
│                                                                 │
│  Types:                                                         │
│  ├── types/payment.ts (All payment types)                      │
│  └── types/database.ts (Updated with pending_payment)          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────────────┐
│                        Database Layer                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Tables:                                                        │
│                                                                 │
│  merchants                                                      │
│  ├── id (PK)                                                    │
│  ├── name                                                       │
│  ├── api_key (encrypted)                                       │
│  ├── callback_url                                              │
│  └── is_sandbox                                                │
│                                                                 │
│  payments                                                       │
│  ├── id (PK)                                                    │
│  ├── application_id (FK → applications)                        │
│  ├── applicant_id (FK → users)                                 │
│  ├── amount                                                     │
│  ├── currency                                                   │
│  ├── status (enum)                                             │
│  ├── irembo_payment_ref                                        │
│  ├── irembo_transaction_id                                     │
│  ├── payment_url                                               │
│  ├── customer_email                                            │
│  ├── customer_phone                                            │
│  └── timestamps                                                │
│                                                                 │
│  payment_transactions                                           │
│  ├── id (PK)                                                    │
│  ├── payment_id (FK → payments)                                │
│  ├── irembo_txn_id                                             │
│  ├── payment_method                                            │
│  ├── payment_channel                                           │
│  ├── status                                                     │
│  └── provider_response (jsonb)                                 │
│                                                                 │
│  webhook_logs                                                   │
│  ├── id (PK)                                                    │
│  ├── payment_id (FK → payments)                                │
│  ├── event_type                                                │
│  ├── payload (jsonb)                                           │
│  ├── signature                                                 │
│  ├── signature_valid                                           │
│  ├── processed                                                 │
│  └── timestamps                                                │
│                                                                 │
│  payment_receipts                                               │
│  ├── id (PK)                                                    │
│  ├── payment_id (FK → payments)                                │
│  ├── application_id (FK → applications)                        │
│  ├── receipt_number                                            │
│  ├── receipt_data (jsonb)                                      │
│  └── timestamps                                                │
│                                                                 │
│  applications (updated)                                         │
│  └── status: added 'pending_payment'                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagrams

### 1. Payment Initiation Flow

```
┌───────────┐
│   User    │
│  Clicks   │
│"Proceed"  │
└─────┬─────┘
      │
      v
┌─────────────────┐
│  PaymentTab     │
│ Component       │
│ calls           │
│ initiatePayment()│
└────────┬────────┘
         │
         v
┌─────────────────────────┐
│ usePayment Hook         │
│ POST /api/payments/     │
│      initiate           │
└────────┬────────────────┘
         │
         v
┌────────────────────────────────────┐
│ Initiate API Route                 │
│ 1. Validate application            │
│ 2. Check existing payment          │
│ 3. Get customer details            │
│ 4. Call IremboPayClient            │
└────────┬───────────────────────────┘
         │
         v
┌────────────────────────────────────┐
│ IremboPayClient                    │
│ POST to IremboPay API              │
│ /payments/payment/initiate         │
└────────┬───────────────────────────┘
         │
         v
┌────────────────────────────────────┐
│ IremboPay API Response             │
│ Returns:                           │
│ - payment_ref                      │
│ - payment_url                      │
│ - request_id                       │
└────────┬───────────────────────────┘
         │
         v
┌────────────────────────────────────┐
│ Create Payment Record              │
│ INSERT INTO payments               │
│ - application_id                   │
│ - amount                           │
│ - irembo_payment_ref               │
│ - payment_url                      │
│ - status: 'pending'                │
└────────┬───────────────────────────┘
         │
         v
┌────────────────────────────────────┐
│ Update Application Status          │
│ UPDATE applications                │
│ SET status = 'pending_payment'     │
└────────┬───────────────────────────┘
         │
         v
┌────────────────────────────────────┐
│ Return to Frontend                 │
│ {                                  │
│   success: true,                   │
│   payment: {...},                  │
│   payment_url: "https://..."       │
│ }                                  │
└────────┬───────────────────────────┘
         │
         v
┌────────────────────────────────────┐
│ IremboPayWidget                    │
│ Load IremboPay checkout            │
│ Show payment methods               │
└────────────────────────────────────┘
```

### 2. Webhook Processing Flow

```
┌────────────────────────────────────┐
│ User Completes Payment             │
│ in IremboPay Checkout              │
└────────┬───────────────────────────┘
         │
         v
┌────────────────────────────────────┐
│ IremboPay Server                   │
│ Sends webhook callback             │
│ POST /api/payments/webhook         │
│ with signature                     │
└────────┬───────────────────────────┘
         │
         v
┌────────────────────────────────────┐
│ Webhook API Route                  │
│ 1. Extract signature               │
│ 2. Validate signature              │
│ 3. Parse payload                   │
└────────┬───────────────────────────┘
         │
         v
┌────────────────────────────────────┐
│ Find Payment Record                │
│ SELECT * FROM payments             │
│ WHERE irembo_payment_ref = ?       │
└────────┬───────────────────────────┘
         │
         v
┌────────────────────────────────────┐
│ Process Event                      │
│ Map IremboPay status to internal   │
│ - SUCCESS → completed              │
│ - FAILED → failed                  │
│ - PROCESSING → processing          │
└────────┬───────────────────────────┘
         │
         v
┌────────────────────────────────────┐
│ Update Payment Record              │
│ UPDATE payments                    │
│ SET status = ?,                    │
│     completed_at = ?,              │
│     irembo_transaction_id = ?      │
└────────┬───────────────────────────┘
         │
         v
┌────────────────────────────────────┐
│ Create Transaction Log             │
│ INSERT INTO payment_transactions   │
│ - irembo_txn_id                    │
│ - payment_method                   │
│ - provider_response                │
└────────┬───────────────────────────┘
         │
         v
┌────────────────────────────────────┐
│ Update Application Status          │
│ IF payment completed:              │
│   UPDATE applications              │
│   SET status = 'submitted'         │
└────────┬───────────────────────────┘
         │
         v
┌────────────────────────────────────┐
│ Generate Receipt                   │
│ INSERT INTO payment_receipts       │
│ - receipt_number                   │
│ - receipt_data                     │
└────────┬───────────────────────────┘
         │
         v
┌────────────────────────────────────┐
│ Log Webhook Event                  │
│ INSERT INTO webhook_logs           │
│ - event_type                       │
│ - payload                          │
│ - processed: true                  │
└────────┬───────────────────────────┘
         │
         v
┌────────────────────────────────────┐
│ Return 200 OK to IremboPay         │
│ {success: true}                    │
└────────────────────────────────────┘
```

### 3. Status Polling Flow

```
┌────────────────────────────────────┐
│ Frontend Payment Tab               │
│ usePayment hook                    │
│ pollInterval: 5000ms               │
└────────┬───────────────────────────┘
         │
         v (Every 5 seconds)
┌────────────────────────────────────┐
│ checkStatus(paymentId)             │
│ GET /api/payments/[id]/status      │
└────────┬───────────────────────────┘
         │
         v
┌────────────────────────────────────┐
│ Status API Route                   │
│ 1. Fetch payment from DB           │
│ 2. If pending/processing:          │
│    Verify with IremboPay API       │
│ 3. Update if status changed        │
└────────┬───────────────────────────┘
         │
         v
┌────────────────────────────────────┐
│ Return Current Status              │
│ {                                  │
│   success: true,                   │
│   payment: {                       │
│     status: "completed",           │
│     ...                            │
│   }                                │
│ }                                  │
└────────┬───────────────────────────┘
         │
         v
┌────────────────────────────────────┐
│ Update UI                          │
│ - Show status indicator            │
│ - If completed: Show success       │
│ - If failed: Show retry option     │
│ - Stop polling if terminal state   │
└────────────────────────────────────┘
```

---

## Security Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Security Layers                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Authentication Layer (Supabase Auth)                        │
│     ├── JWT Token validation                                    │
│     ├── Session management                                      │
│     └── User identity verification                              │
│                                                                 │
│  2. Authorization Layer (RLS Policies)                          │
│     ├── payments: Users see only their payments                 │
│     ├── payment_transactions: Filtered by payment ownership     │
│     ├── payment_receipts: User-specific access                  │
│     └── webhook_logs: Service role only                         │
│                                                                 │
│  3. API Security                                                │
│     ├── Rate limiting (Next.js middleware)                      │
│     ├── CORS policies                                           │
│     ├── Input validation                                        │
│     └── SQL injection prevention (Supabase parameterized)       │
│                                                                 │
│  4. Webhook Security                                            │
│     ├── HMAC SHA256 signature validation                        │
│     ├── Source IP verification                                  │
│     ├── Replay attack prevention                                │
│     └── Complete audit trail                                    │
│                                                                 │
│  5. Data Security                                               │
│     ├── No PCI data storage (cards/mobile money)                │
│     ├── API keys encrypted at rest                              │
│     ├── HTTPS only                                              │
│     └── Sensitive data masked in logs                           │
│                                                                 │
│  6. Payment Security                                            │
│     ├── Amount validation on server                             │
│     ├── Duplicate payment prevention                            │
│     ├── Payment expiry (30 minutes)                             │
│     └── Transaction idempotency                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Production Setup                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                     Vercel Edge Network                    │ │
│  │  (Next.js Frontend + API Routes)                          │ │
│  │                                                            │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │ │
│  │  │   Frontend   │  │  API Routes  │  │  Middleware  │  │ │
│  │  │   (React)    │  │  (Node.js)   │  │   (Auth)     │  │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │ │
│  │                                                            │ │
│  │  Environment Variables:                                    │ │
│  │  ├── IREMBOPAY_API_KEY                                    │ │
│  │  ├── IREMBOPAY_WEBHOOK_SECRET                             │ │
│  │  ├── NEXT_PUBLIC_IREMBOPAY_PUBLIC_KEY                     │ │
│  │  └── SUPABASE_SERVICE_ROLE_KEY                            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                   │
│                              │ HTTPS                             │
│                              v                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                  Supabase (PostgreSQL)                     │ │
│  │                                                            │ │
│  │  Database:                                                 │ │
│  │  ├── merchants                                             │ │
│  │  ├── payments                                              │ │
│  │  ├── payment_transactions                                  │ │
│  │  ├── webhook_logs                                          │ │
│  │  └── payment_receipts                                      │ │
│  │                                                            │ │
│  │  Features:                                                 │ │
│  │  ├── Row Level Security (RLS)                              │ │
│  │  ├── Real-time subscriptions                               │ │
│  │  ├── Connection pooling                                    │ │
│  │  └── Automatic backups                                     │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                   │
│                              │ HTTPS                             │
│                              v                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    IremboPay Service                       │ │
│  │                                                            │ │
│  │  APIs:                                                     │ │
│  │  ├── Payment Initiation                                    │ │
│  │  ├── Payment Processing                                    │ │
│  │  ├── Status Checks                                         │ │
│  │  └── Webhook Delivery                                      │ │
│  │                                                            │ │
│  │  Payment Providers:                                        │ │
│  │  ├── MTN Mobile Money                                      │ │
│  │  ├── Airtel Money                                          │ │
│  │  ├── Visa/Mastercard                                       │ │
│  │  └── Bank Transfers                                        │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
waterpermit/
├── app/
│   ├── api/
│   │   └── payments/
│   │       ├── initiate/
│   │       │   └── route.ts ..................... Payment initiation
│   │       ├── webhook/
│   │       │   └── route.ts ..................... Webhook handler
│   │       └── [id]/
│   │           └── status/
│   │               └── route.ts ................. Status check
│   │
│   └── dashboard/
│       └── new-application/
│           └── page.tsx ......................... Main application page
│
├── components/
│   ├── dashboard/
│   │   └── payment-tab.tsx ...................... Main payment UI
│   │
│   └── payments/
│       ├── irembopay-widget.tsx ................. Payment checkout
│       └── payment-status.tsx ................... Status display
│
├── lib/
│   ├── irembopay-client.ts ...................... IremboPay API client
│   └── payment-utils.ts ......................... Payment utilities
│
├── hooks/
│   └── usePayment.ts ............................ Payment operations hook
│
├── types/
│   ├── payment.ts ............................... Payment type definitions
│   └── database.ts .............................. Database types (updated)
│
├── database/
│   └── irembopay-payments-migration.sql ......... Database schema
│
├── config/
│   └── environment.example ...................... Environment variables
│
└── docs/
    ├── IREMBOPAY_IMPLEMENTATION_GUIDE.md ........ Full implementation guide
    ├── IREMBOPAY_INTEGRATION_SUMMARY.md ......... Integration summary
    ├── IREMBOPAY_QUICK_SETUP.md ................. Quick setup guide
    └── IREMBOPAY_ARCHITECTURE.md ................ This file
```

---

**Document Version:** 1.0.0  
**Last Updated:** October 11, 2025  
**Architecture Type:** Serverless + JAMstack  
**Database:** PostgreSQL (Supabase)  
**Frontend:** Next.js 14 + React + TypeScript  
**Payment Gateway:** IremboPay

