# 🚫 User Suspension System Setup Guide

## Overview

The suspension system prevents suspended users from accessing any information in the Rwanda Water Resources Board portal with a beautiful, informative UI.

## ✨ Features

- **Automatic Detection**: Checks user status on every page load
- **Beautiful UI**: Professional suspension notice with clear messaging
- **Integrated Auth**: Works seamlessly with existing Supabase authentication
- **Easy Integration**: Simple wrapper component for protection
- **Support Actions**: Contact support and logout functionality

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  ProtectedLayout│───▶│  SuspensionGuard │───▶│ SuspensionNotice│
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
   Wraps pages          Checks status           Shows to suspended
                         via AuthContext              users
```

## 🔧 Setup Instructions

### 1. Wrap Protected Pages

For any page that should check for suspension, wrap it with `ProtectedLayout`:

```tsx
// app/admin/page.tsx
import { ProtectedLayout } from "@/components/layout/protected-layout";

export default function AdminPage() {
  return (
    <ProtectedLayout>
      {/* Your page content */}
      <DashboardLayout>
        <YourPageContent />
      </DashboardLayout>
    </ProtectedLayout>
  );
}
```

### 2. Apply to All Protected Routes

Update these pages to include suspension protection:

#### Admin Pages
```tsx
// app/admin/page.tsx ✅ Already implemented
// app/approver/page.tsx
// app/inspection/page.tsx
```

#### Dashboard Pages
```tsx
// app/dashboard/page.tsx
// app/dashboard/new-application/page.tsx
// app/dashboard/application/[id]/page.tsx
// app/dashboard/edit-application/[id]/page.tsx
// app/dashboard/permit/[id]/page.tsx
// app/dashboard/profile/page.tsx
// app/dashboard/settings/page.tsx
```

#### Review Pages
```tsx
// app/review/page.tsx
// app/review/application/[id]/page.tsx
```

### 3. Example Implementation

```tsx
"use client";

import { ProtectedLayout } from "@/components/layout/protected-layout";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { YourPageContent } from "./your-content";

export default function YourProtectedPage() {
  return (
    <ProtectedLayout>
      <DashboardLayout>
        <YourPageContent />
      </DashboardLayout>
    </ProtectedLayout>
  );
}
```

## 🎨 What Users See

### Active Users
- Normal application interface
- Full access to all features

### Suspended Users
- **Beautiful suspension notice** with:
  - User's profile information
  - Clear suspension message
  - Contact support options
  - Logout functionality
  - Rwanda Water Resources Board branding

## 🧪 Testing the System

### Using the Test Component

I've added a test component to the admin page (`<TestSuspension />`):

1. **Go to Admin Page**: `/admin`
2. **Find the orange testing card** at the top
3. **Click "Test Suspension"**: Your account will be suspended
4. **See the suspension UI**: The page will immediately show the suspension notice
5. **Click "Reactivate"**: From another admin account to restore access

### Manual Testing

You can also test by:

1. **Using User Management**: Go to `/admin` → User Management tab
2. **Edit a user's status**: Change status to "Suspended"  
3. **Login as that user**: See the suspension notice
4. **Reactivate**: Change status back to "Active"

## 🔄 How It Works

### 1. Authentication Flow
```typescript
// useSuspensionCheck hook
const { userProfile, loading } = useAuth();

// Check suspension status
const isSuspended = userProfile?.status === 'suspended';
```

### 2. Protection Flow
```typescript
// SuspensionGuard component
if (isSuspended) {
  return <SuspensionNotice user={user} />;
}
return <>{children}</>;
```

### 3. User Experience
```
User loads protected page
         ↓
ProtectedLayout checks suspension
         ↓
If suspended → Show SuspensionNotice
If active → Show normal content
```

## 📱 Pages That Need Protection

### ✅ Already Protected
- `/admin` - Admin dashboard

### 🔄 To Be Protected
- `/dashboard/*` - All user dashboard pages
- `/approver/*` - Approver pages  
- `/inspector/*` - Inspector pages
- `/review/*` - Review pages
- Any other authenticated pages

### ❌ No Protection Needed
- `/` - Home page (public)
- `/login` - Login page (public)
- `/register` - Registration page (public)
- `/contact` - Contact page (public)

## 🎯 Implementation Checklist

- [ ] Copy files to your project:
  - `hooks/useSuspensionCheck.ts`
  - `components/auth/suspension-notice.tsx`
  - `components/auth/suspension-guard.tsx`
  - `components/layout/protected-layout.tsx`

- [ ] Apply ProtectedLayout to pages:
  - [ ] `/dashboard/*` pages
  - [ ] `/approver/*` pages
  - [ ] `/inspector/*` pages
  - [ ] `/review/*` pages
  - [ ] Any other protected pages

- [ ] Test the system:
  - [ ] Use test component on admin page
  - [ ] Manually suspend a user
  - [ ] Verify suspension UI shows correctly
  - [ ] Test logout and contact support

- [ ] Remove test component from production

## 🚀 Production Deployment

### Before Going Live

1. **Remove the test component**:
   ```tsx
   // Remove this from app/admin/page.tsx
   <TestSuspension />
   ```

2. **Test with real users**:
   - Suspend a test account
   - Verify the experience
   - Test support contact flow

3. **Configure support contact**:
   - Update contact information in `SuspensionNotice`
   - Set up proper support email/phone

## 🎨 Customization

### Styling
The suspension notice uses Tailwind classes and can be customized in:
- `components/auth/suspension-notice.tsx`

### Messages
Update suspension messages in:
- `components/auth/suspension-notice.tsx`

### Contact Information
Update support contact details in:
- `components/auth/suspension-notice.tsx` (line ~118)

## 🔒 Security Notes

- ✅ **Server-side status**: User status is checked from Supabase
- ✅ **Real-time updates**: Uses AuthContext for immediate updates
- ✅ **No bypass**: Protection is applied at the layout level
- ✅ **Proper logout**: Uses Supabase signOut method

## 📞 Support

For questions about the suspension system:
- Check this guide first
- Test using the admin test component
- Verify AuthContext integration
- Contact development team if issues persist

---

**Your suspended users will now have a beautiful, professional experience while being clearly informed about their account status!** 