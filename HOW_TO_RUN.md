# 🚀 How to Run the Water Permit System

## Quick Start

This is a **Next.js application** (not a separate backend/frontend). Everything runs from one command.

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Environment Variables
Create a `.env.local` file in the root directory:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# Pindo SMS Configuration (for SMS notifications)
PINDO_API_KEY=your-pindo-api-key
PINDO_SENDER_ID=your-sender-id

# Optional: Additional configurations
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Run Database Migrations

⚠️ **CRITICAL: Run these SQL scripts in Supabase SQL Editor BEFORE starting the app**

Go to your Supabase project → SQL Editor → New Query

**Run in this order:**

#### Migration 1: Role Consolidation
```sql
-- Copy and paste contents of:
-- database/consolidate-assessor-reviewer-roles.sql
```

#### Migration 2: Technical Assessments Table
```sql
-- Copy and paste contents of:
-- database/create-technical-assessments-table.sql
```

### 4. Start the Development Server
```bash
npm run dev
```

The application will be available at: **http://localhost:3000**

---

## 🏗️ Architecture Overview

This is a **monolithic Next.js application** with:
- **Frontend**: React components + Next.js pages
- **Backend**: Next.js API routes (in `/app/api/`)
- **Database**: Supabase (PostgreSQL)
- **Storage**: Supabase Storage
- **Authentication**: Supabase Auth

**There is NO separate backend server to run.**

---

## 📂 Project Structure

```
waterpermit/
├── app/                          # Next.js App Router
│   ├── api/                     # Backend API routes
│   │   ├── applications/        # Application endpoints
│   │   ├── auth/               # Authentication endpoints
│   │   └── notifications/      # Notification endpoints
│   ├── assessment/             # ✨ NEW: Assessment dashboard
│   ├── technical-assessment/   # ✨ NEW: Technical assessment form
│   ├── approver/               # Approver dashboard
│   ├── dashboard/              # Applicant dashboard
│   └── ...
├── components/                  # React components
│   ├── approver/               # Approver components
│   │   └── assessor-recommendation.tsx  # ✨ NEW
│   ├── dashboard/              # Dashboard components
│   ├── maps/                   # Map components
│   └── ...
├── database/                   # Database migrations & schema
│   ├── consolidate-assessor-reviewer-roles.sql  # ✨ NEW
│   ├── create-technical-assessments-table.sql   # ✨ NEW
│   └── schema.sql
├── lib/                        # Utility functions
│   ├── supabase.ts            # Supabase client
│   └── ...
└── types/                      # TypeScript types
    └── database.ts
```

---

## 🎯 Available Routes

### Public Routes
- `/` - Home page
- `/login` - Login page
- `/register` - Registration page

### Applicant Routes
- `/dashboard` - Applicant dashboard
- `/dashboard/new-application` - Create new application
- `/dashboard/application/[id]` - View application details
- `/dashboard/edit-application/[id]` - Edit application

### Assessor Routes ✨ NEW
- `/assessment` - Assessment dashboard (renamed from `/review`)
- `/assessment/application/[id]` - Assess specific application
- `/technical-assessment` - Submit technical field assessment

### Approver Routes
- `/approver` - Approver dashboard
- `/approver/application/[id]` - Review and approve applications
  - New "Assessor Recommendation" tab shows technical assessment

### Admin Routes
- `/admin` - Admin dashboard
- User management
- System settings

---

## 🔑 User Roles & Access

### Applicant
- Submit applications
- View own applications
- Edit draft applications
- Upload documents

### Assessor/Reviewer (Consolidated Role) ✨ UPDATED
- View all submitted applications
- Conduct field assessments
- Submit technical recommendations
- Request revisions

### Approver
- View applications pending approval
- See assessor recommendations ✨ NEW
- Approve or reject applications
- Set permit conditions
- Revoke permits (coming soon)

### Admin
- Full system access
- User management
- System configuration
- Reports and analytics

---

## 🧪 Testing the New Features

### Test Workflow 1: Assessment Dashboard
1. Login as user with `reviewer` role
2. Navigate to `/assessment`
3. Verify:
   - ✅ Applications listed
   - ✅ Filter by status works
   - ✅ Sort by earliest/latest works
   - ✅ Date range picker works
   - ✅ Search works

### Test Workflow 2: Technical Assessment
1. From `/assessment`, click on an application
2. Note the application ID
3. Navigate to `/technical-assessment?applicationId=<id>`
4. Fill out the form:
   - Add field report summary
   - Check assessment items
   - Upload files (PDF or images)
   - Select recommendation (Yes/No)
   - If No, add explanation
   - Enter inspector details
5. Submit
6. Verify application status updates

### Test Workflow 3: Approver View
1. Login as user with `approver` role
2. Navigate to `/approver`
3. Click on an application that has been assessed
4. Verify:
   - ✅ "Assessor Recommendation" tab exists
   - ✅ Technical assessment displays
   - ✅ Recommendation is clear
   - ✅ Files are downloadable

---

## 🛠️ Development Commands

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint

# Type checking
npx tsc --noEmit
```

---

## 📊 Database Management

### View Database
- Go to Supabase Dashboard
- Navigate to Table Editor
- View tables: `applications`, `technical_assessments`, `users`, etc.

### Run Queries
- Go to SQL Editor
- Write and execute custom queries

### View Logs
- Go to Database → Logs
- Monitor queries and performance

---

## 🐛 Troubleshooting

### Issue: "Application not found"
- Check if database migrations have been run
- Verify Supabase connection in `.env.local`

### Issue: "technical_assessments table does not exist"
- Run `database/create-technical-assessments-table.sql` in Supabase SQL Editor

### Issue: "Permission denied"
- Check RLS policies in Supabase
- Verify user role in `users` table

### Issue: File upload fails
- Check Supabase Storage bucket configuration
- Verify storage policies allow uploads

### Issue: Assessment tab doesn't show
- Clear browser cache
- Check if `AssessorRecommendation` component is imported
- Verify application has a technical assessment

---

## 🔄 Deployment

### Deploy to Vercel (Recommended)

1. Push code to GitHub
2. Connect repository to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

```bash
# Or use Vercel CLI
npm i -g vercel
vercel
```

### Environment Variables for Production
```env
NEXT_PUBLIC_SUPABASE_URL=your-production-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-production-key
PINDO_API_KEY=your-production-api-key
PINDO_SENDER_ID=your-sender-id
```

---

## 📞 Support

### Common Questions

**Q: Is there a separate backend server?**
A: No, Next.js API routes serve as the backend. Everything runs from `npm run dev`.

**Q: How do I add a new user?**
A: Use Supabase Dashboard → Authentication → Add user manually, or use the registration flow.

**Q: How do I change user roles?**
A: Go to Supabase → Table Editor → users → Edit user row → Change `role` field.

**Q: Where are uploaded files stored?**
A: Supabase Storage bucket named `documents`.

---

## ✅ Pre-Flight Checklist

Before running the application:

- [ ] `.env.local` file created with Supabase credentials
- [ ] Database migration 1 run (consolidate-assessor-reviewer-roles.sql)
- [ ] Database migration 2 run (create-technical-assessments-table.sql)
- [ ] Dependencies installed (`npm install`)
- [ ] Test user accounts created in Supabase with appropriate roles
- [ ] Supabase Storage bucket `documents` exists
- [ ] RLS policies enabled on all tables

---

## 🎉 You're Ready!

Run `npm run dev` and navigate to:
- **http://localhost:3000** - Home page
- **http://localhost:3000/login** - Login
- **http://localhost:3000/assessment** - New Assessment Dashboard

**Happy coding! 🚀**

