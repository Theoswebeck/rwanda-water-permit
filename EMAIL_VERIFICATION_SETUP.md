# Email Verification Setup Guide

This guide explains how to configure email verification for the Water Permit application using Supabase.

## 🎯 Overview

The application now includes industry-standard email verification during user registration:

1. **User Registration**: User signs up with email and password
2. **Email Verification Required**: Supabase sends verification email
3. **Pending State**: User is redirected to email verification pending page
4. **Email Verification**: User clicks link in email to verify account
5. **Login Enabled**: Only verified users can log in

## 🔧 Supabase Configuration

### 1. Email Settings in Supabase Dashboard

Go to your Supabase project dashboard:

1. Navigate to **Authentication** → **Settings**
2. Scroll to **Email Auth** section
3. Configure the following settings:

```
✅ Enable email confirmations: ON
✅ Secure email change: ON
✅ Double confirm email changes: ON
```

### 2. Email Templates

In **Authentication** → **Email Templates**, customize:

**Confirm signup template:**
```html
<h2>Confirm your email</h2>
<p>Hello,</p>
<p>Thank you for registering with Rwanda Water Resources Board Water Permit System.</p>
<p>Please click the link below to verify your email address:</p>
<p><a href="{{ .ConfirmationURL }}">Verify Email Address</a></p>
<p>This link will expire in 24 hours.</p>
<p>If you didn't create an account, please ignore this email.</p>
```

### 3. URL Configuration

Set the **Site URL** and **Redirect URLs**:

```
Site URL: https://your-domain.com
Redirect URLs: 
- https://your-domain.com/verify-email
- http://localhost:3000/verify-email (for development)
```

### 4. Email Provider Setup

Configure your email provider in **Settings** → **Auth**:

#### For Production (Recommended: Custom SMTP)
```
SMTP Host: your-smtp-provider.com
SMTP Port: 587
SMTP User: your-email@domain.com
SMTP Pass: your-app-password
From Email: noreply@your-domain.com
From Name: Rwanda Water Resources Board
```

#### For Development (Supabase Default)
Supabase provides a default email service for development, but it has limits.

## 🗄️ Database Migration

Run the email verification database migration:

```bash
# Connect to your Supabase database and run:
psql "your-supabase-connection-string" -f database/add-email-verification-support.sql
```

This adds:
- `email_verified` column to users table
- `email_verification_logs` table for tracking
- Helper functions for verification management

## 🎨 UI Components

The following new components were added:

### Email Verification Components
- `EmailVerificationDialog` - Modal for email verification flow
- `EmailVerificationSuccess` - Success confirmation page
- `EmailVerificationPending` - Waiting for verification page

### Pages Added
- `/verify-email` - Email verification handler
- `/email-verification-pending` - Pending verification page

## 🔄 User Flow

### Registration Flow
1. User fills out registration form
2. User submits form (after phone verification)
3. System creates Supabase auth user
4. Supabase sends verification email
5. User redirected to `/email-verification-pending?email=user@email.com`
6. User can resend email if needed

### Verification Flow
1. User receives email with verification link
2. User clicks link → redirected to `/verify-email?token=...&type=signup`
3. System verifies token with Supabase
4. On success: User profile updated, redirect to login
5. On failure: Error message with option to resend

### Login Flow
1. User enters email/password
2. System checks if email is verified
3. If not verified: Shows resend verification option
4. If verified: Normal login proceeds

## 🔒 Security Features

### Email Verification Enforcement
- Unverified users cannot log in
- Email verification status checked on every login
- Verification tokens expire after 24 hours

### Rate Limiting
- Users can resend verification emails with cooldown
- Failed verification attempts are logged

### Audit Trail
- All verification attempts logged in `email_verification_logs`
- Tracks IP addresses and user agents
- Provides security audit capabilities

## 🛠️ Environment Variables

No additional environment variables required. The system uses existing Supabase configuration:

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

## 🧪 Testing

### Development Testing
1. Register a new account
2. Check email (or Supabase logs) for verification link
3. Click verification link
4. Verify successful login

### Production Testing
1. Set up custom SMTP provider
2. Register with real email address
3. Verify email delivery and verification flow
4. Test error scenarios (expired links, invalid tokens)

## 📋 Checklist

Before going live:

- [ ] Configure custom SMTP provider
- [ ] Set proper Site URL and Redirect URLs
- [ ] Customize email templates with your branding
- [ ] Run database migration
- [ ] Test complete registration → verification → login flow
- [ ] Set up monitoring for email delivery rates
- [ ] Configure email rate limiting if needed

## 🚨 Important Notes

### For Existing Users
- Existing users are automatically marked as `email_verified = true`
- No disruption to current user base
- New registrations require email verification

### Email Delivery
- Use reputable email providers (SendGrid, AWS SES, etc.)
- Monitor email delivery rates and spam complaints
- Set up proper SPF, DKIM, and DMARC records

### User Experience
- Clear messaging about email verification requirement
- Easy resend functionality with appropriate cooldowns
- Help links for common email issues (spam folder, etc.)

## 🆘 Troubleshooting

### Common Issues

**1. Emails not being sent**
- Check Supabase email provider configuration
- Verify SMTP credentials
- Check email delivery logs in Supabase

**2. Verification links not working**
- Verify Site URL and Redirect URLs are correct
- Check if tokens are expired (24-hour limit)
- Ensure proper URL encoding

**3. Users can't resend verification**
- Check rate limiting settings
- Verify user has valid email address
- Check for JavaScript errors in browser console

### Support Contacts
- Supabase Documentation: https://supabase.com/docs/guides/auth
- Email Provider Support: Contact your SMTP provider
- Application Issues: Check application logs and error monitoring

---

✅ **Email verification is now fully configured and ready for production use!**
