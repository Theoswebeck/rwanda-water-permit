-- =============================================
-- IremboPay Payment Integration Schema
-- Rwanda Water Resources Board Water Permit System
-- =============================================
-- 
-- This migration adds payment processing capabilities
-- using IremboPay as the payment gateway
-- =============================================

-- Enable necessary extensions (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- ENUMS
-- =============================================

-- Payment status enum
CREATE TYPE payment_status AS ENUM (
    'pending',      -- Payment initiated but not completed
    'processing',   -- Payment is being processed by IremboPay
    'completed',    -- Payment successfully completed
    'failed',       -- Payment failed
    'cancelled',    -- Payment cancelled by user
    'refunded'      -- Payment refunded
);

-- Payment method enum (IremboPay supported methods)
CREATE TYPE payment_method AS ENUM (
    'mobile_money',  -- MTN Momo, Airtel Money
    'card',          -- VISA, Mastercard, Amex
    'bank_transfer', -- Bank transfer
    'ussd',          -- USSD banking
    'cash'           -- Cash payment at agents
);

-- Payment channel enum (specific providers)
CREATE TYPE payment_channel AS ENUM (
    'mtn_momo',
    'airtel_money',
    'visa',
    'mastercard',
    'amex',
    'bank_of_kigali',
    'equity_bank',
    'im_bank',
    'cogebanque',
    'other'
);

-- Webhook event type
CREATE TYPE webhook_event_type AS ENUM (
    'payment.initiated',
    'payment.processing',
    'payment.success',
    'payment.failed',
    'payment.cancelled',
    'payment.refunded'
);

-- =============================================
-- MERCHANT CONFIGURATION TABLE
-- =============================================
-- Stores IremboPay merchant/business configuration

CREATE TABLE merchants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Merchant details
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    
    -- IremboPay credentials (encrypted in production)
    api_key TEXT NOT NULL,
    public_key TEXT,
    
    -- Configuration
    callback_url TEXT NOT NULL,
    success_url TEXT,
    failure_url TEXT,
    
    -- Environment
    is_sandbox BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- PAYMENTS TABLE
-- =============================================
-- Main payment records linked to applications

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Application reference
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    applicant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    merchant_id UUID REFERENCES merchants(id),
    
    -- Payment details
    amount DECIMAL(15,2) NOT NULL DEFAULT 35000.00,
    currency VARCHAR(3) NOT NULL DEFAULT 'RWF',
    description TEXT,
    
    -- Status tracking
    status payment_status NOT NULL DEFAULT 'pending',
    payment_method payment_method,
    
    -- IremboPay specific fields
    irembo_payment_ref VARCHAR(255) UNIQUE,  -- IremboPay reference
    irembo_request_id VARCHAR(255) UNIQUE,   -- Our request ID to IremboPay
    irembo_transaction_id VARCHAR(255),      -- IremboPay transaction ID
    payment_url TEXT,                         -- IremboPay checkout URL
    
    -- Customer details (stored for reference)
    customer_email VARCHAR(255),
    customer_phone VARCHAR(20),
    customer_name VARCHAR(255),
    
    -- Gateway response data
    gateway_response JSONB,
    gateway_metadata JSONB,
    
    -- Timestamps
    initiated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processing_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    
    -- Constraints
    CONSTRAINT chk_positive_amount CHECK (amount > 0),
    CONSTRAINT chk_valid_currency CHECK (currency IN ('RWF', 'USD', 'EUR', 'GBP'))
);

-- =============================================
-- PAYMENT TRANSACTIONS TABLE
-- =============================================
-- Detailed transaction log for each payment attempt

CREATE TABLE payment_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Payment reference
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    
    -- Transaction details
    irembo_txn_id VARCHAR(255) UNIQUE,
    transaction_ref VARCHAR(255),
    
    -- Payment method used
    payment_method payment_method,
    payment_channel payment_channel,
    
    -- Transaction details
    amount DECIMAL(15,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'RWF',
    status payment_status NOT NULL,
    
    -- Provider response
    provider_response JSONB,
    provider_code VARCHAR(50),
    provider_message TEXT,
    
    -- Timing
    initiated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- WEBHOOK LOGS TABLE
-- =============================================
-- Audit trail of all webhook events from IremboPay

CREATE TABLE webhook_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Payment reference
    payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
    
    -- Event details
    event_type webhook_event_type NOT NULL,
    event_id VARCHAR(255),
    
    -- Webhook data
    payload JSONB NOT NULL,
    headers JSONB,
    
    -- Request details
    source_ip VARCHAR(45),
    signature VARCHAR(512),
    signature_valid BOOLEAN,
    
    -- Processing
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP WITH TIME ZONE,
    processing_error TEXT,
    
    -- Audit
    received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- PAYMENT RECEIPTS TABLE
-- =============================================
-- Generated receipts for successful payments

CREATE TABLE payment_receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Payment reference
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    
    -- Receipt details
    receipt_number VARCHAR(100) UNIQUE NOT NULL,
    receipt_url TEXT,
    
    -- File storage
    file_path VARCHAR(500),
    file_size INTEGER,
    
    -- Content
    receipt_data JSONB,
    
    -- Timestamps
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    emailed_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- INDEXES
-- =============================================

-- Payments indexes
CREATE INDEX idx_payments_application_id ON payments(application_id);
CREATE INDEX idx_payments_applicant_id ON payments(applicant_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_irembo_ref ON payments(irembo_payment_ref);
CREATE INDEX idx_payments_irembo_request ON payments(irembo_request_id);
CREATE INDEX idx_payments_created_at ON payments(created_at DESC);

-- Payment transactions indexes
CREATE INDEX idx_payment_txn_payment_id ON payment_transactions(payment_id);
CREATE INDEX idx_payment_txn_irembo_id ON payment_transactions(irembo_txn_id);
CREATE INDEX idx_payment_txn_status ON payment_transactions(status);
CREATE INDEX idx_payment_txn_created_at ON payment_transactions(created_at DESC);

-- Webhook logs indexes
CREATE INDEX idx_webhook_payment_id ON webhook_logs(payment_id);
CREATE INDEX idx_webhook_event_type ON webhook_logs(event_type);
CREATE INDEX idx_webhook_processed ON webhook_logs(processed);
CREATE INDEX idx_webhook_received_at ON webhook_logs(received_at DESC);

-- Payment receipts indexes
CREATE INDEX idx_receipt_payment_id ON payment_receipts(payment_id);
CREATE INDEX idx_receipt_application_id ON payment_receipts(application_id);
CREATE INDEX idx_receipt_number ON payment_receipts(receipt_number);

-- =============================================
-- FUNCTIONS
-- =============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- =============================================
-- TRIGGERS
-- =============================================

-- Auto-update updated_at on merchants
CREATE TRIGGER update_merchants_updated_at
    BEFORE UPDATE ON merchants
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Auto-update updated_at on payments
CREATE TRIGGER update_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Auto-update updated_at on payment_transactions
CREATE TRIGGER update_payment_transactions_updated_at
    BEFORE UPDATE ON payment_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Auto-update updated_at on payment_receipts
CREATE TRIGGER update_payment_receipts_updated_at
    BEFORE UPDATE ON payment_receipts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- UPDATE APPLICATION STATUS ENUM
-- =============================================
-- Add new status for pending payment

-- Check if 'pending_payment' already exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'pending_payment' 
        AND enumtypid = 'application_status'::regtype
    ) THEN
        ALTER TYPE application_status ADD VALUE 'pending_payment' BEFORE 'submitted';
    END IF;
END$$;

-- =============================================
-- INSERT DEFAULT MERCHANT CONFIGURATION
-- =============================================
-- This should be updated with actual IremboPay credentials

INSERT INTO merchants (
    name,
    email,
    phone,
    api_key,
    public_key,
    callback_url,
    success_url,
    failure_url,
    is_sandbox,
    is_active
) VALUES (
    'Rwanda Water Resources Board',
    'payments@rwb.gov.rw',
    '+250788000000',
    'your_irembopay_api_key_here',
    'your_irembopay_public_key_here',
    'https://yourdomain.com/api/payments/webhook',
    'https://yourdomain.com/dashboard?payment=success',
    'https://yourdomain.com/dashboard?payment=failed',
    TRUE,  -- Set to FALSE in production
    TRUE
) ON CONFLICT DO NOTHING;

-- =============================================
-- COMMENTS
-- =============================================

COMMENT ON TABLE merchants IS 'IremboPay merchant configuration and credentials';
COMMENT ON TABLE payments IS 'Main payment records linked to water permit applications';
COMMENT ON TABLE payment_transactions IS 'Detailed transaction log for each payment attempt';
COMMENT ON TABLE webhook_logs IS 'Audit trail of all webhook events from IremboPay';
COMMENT ON TABLE payment_receipts IS 'Generated receipts for successful payments';

COMMENT ON COLUMN payments.irembo_payment_ref IS 'IremboPay reference returned from their API';
COMMENT ON COLUMN payments.irembo_request_id IS 'Our unique request ID sent to IremboPay';
COMMENT ON COLUMN payments.payment_url IS 'IremboPay checkout URL for the payment';

-- =============================================
-- GRANT PERMISSIONS (Supabase specific)
-- =============================================

-- Grant appropriate permissions to authenticated users
GRANT SELECT ON payments TO authenticated;
GRANT SELECT ON payment_transactions TO authenticated;
GRANT SELECT ON payment_receipts TO authenticated;

-- Service role has full access
GRANT ALL ON merchants TO service_role;
GRANT ALL ON payments TO service_role;
GRANT ALL ON payment_transactions TO service_role;
GRANT ALL ON webhook_logs TO service_role;
GRANT ALL ON payment_receipts TO service_role;

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================

-- Enable RLS
ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_receipts ENABLE ROW LEVEL SECURITY;

-- Payments RLS Policies
-- Users can view their own payments
CREATE POLICY "Users can view own payments"
    ON payments FOR SELECT
    USING (auth.uid() = applicant_id);

-- Users can create payments for their applications
CREATE POLICY "Users can create payments"
    ON payments FOR INSERT
    WITH CHECK (auth.uid() = applicant_id);

-- Service role can update payments (for webhook processing)
CREATE POLICY "Service role can update payments"
    ON payments FOR UPDATE
    USING (true);

-- Payment Transactions RLS Policies
-- Users can view transactions for their payments
CREATE POLICY "Users can view own payment transactions"
    ON payment_transactions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM payments
            WHERE payments.id = payment_transactions.payment_id
            AND payments.applicant_id = auth.uid()
        )
    );

-- Payment Receipts RLS Policies
-- Users can view their own receipts
CREATE POLICY "Users can view own receipts"
    ON payment_receipts FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM payments
            WHERE payments.id = payment_receipts.payment_id
            AND payments.applicant_id = auth.uid()
        )
    );

-- Webhook Logs RLS Policies
-- Only service role can access webhook logs
CREATE POLICY "Only service role can access webhook logs"
    ON webhook_logs FOR ALL
    USING (auth.role() = 'service_role');

-- Merchants RLS Policies
-- Only service role can access merchant configuration
CREATE POLICY "Only service role can access merchants"
    ON merchants FOR ALL
    USING (auth.role() = 'service_role');

-- =============================================
-- MIGRATION COMPLETE
-- =============================================

-- Create a migration log entry (optional)
DO $$
BEGIN
    RAISE NOTICE '✅ IremboPay payment schema migration completed successfully';
    RAISE NOTICE '📝 Remember to update merchant credentials in the merchants table';
    RAISE NOTICE '🔑 Update .env file with IremboPay API keys';
END$$;

