# Kinyarwanda Translation Completion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add complete, high-quality Kinyarwanda translations to every applicant-facing page and show the language toggle on all public pages.

**Architecture:** All new translations go into the `applicationForm.literal` section of `/messages/rw.json`, following the existing exact-match pattern. Each untranslated component gets the standard language hook (`getPreferredLanguage` + `subscribeToLanguageChanges` + `tx()` helper). The header `<LanguageSwitcher>` guard is removed so it renders everywhere.

**Tech Stack:** Next.js 15 / React 19 / TypeScript, custom i18n (`/lib/i18n/`), Framer Motion

---

## Standard language hook pattern (used in EVERY component task below)

Add these imports to any component that doesn't already have them:
```tsx
import { useEffect, useState } from "react";
import {
  getPreferredLanguage,
  setPreferredLanguage,
  subscribeToLanguageChanges,
  type AppLanguage,
} from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";
```

Add this state + effect inside the component function (before the return):
```tsx
const [language, setLanguage] = useState<AppLanguage>("en");
useEffect(() => {
  setLanguage(getPreferredLanguage());
  return subscribeToLanguageChanges(setLanguage);
}, []);
const tx = (value: string) => translateText(value, language);
```

---

### Task 1: Add all missing translations to `rw.json`

**Files:**
- Modify: `messages/rw.json` (insert new entries into the `applicationForm.literal` object)

The `literal` section ends before `"Your Water Use Reports"` at approximately line 191. Insert the following block of new keys **before** `"Your Water Use Reports"` (i.e., after `"Back to portal": "Subira ku rubuga"` entry).

- [ ] **Step 1: Insert home-page translations into `rw.json` literal section**

In `messages/rw.json`, find the line:
```json
      "Back to portal": "Subira ku rubuga",
```

Add these new entries immediately after it (before `"Your Water Use Reports"`):

```json
      "Welcome to the official Rwanda Water Resources Board permit application portal. Apply, track, and manage your water concession permits through our secure digital platform for sustainable water resource management in Rwanda.": "Murakaza neza ku rubuga rw'ubutegetsi rw'Ikigo cy'Igihugu gishinzwe umutungo kamere w'amazi mu Rwanda. Saba, kurikirana, no gucunga impushya z'amazi zawe binyuze ku rubuga rwacu rw'ikoranabuhanga rufite umutekano, kugira ngo umutungo kamere w'amazi mu Rwanda ucungwe neza.",
      "SECURITY": "UMUTEKANO",
      "PRIVACY": "IBANGA",
      "SERVICE FEATURES": "SERIVISI ZITURWA",
      "Rwanda Water Resources Board Portal Services": "Serivisi z'urubuga rw'Ikigo cy'Igihugu gishinzwe umutungo kamere w'amazi mu Rwanda",
      "The official Rwanda Water Resources Board portal provides essential services for managing water resources. Our platform ensures compliance with Rwanda's water regulations while offering a transparent process.": "Urubuga rw'ubutegetsi rw'Ikigo cy'Igihugu gishinzwe umutungo kamere w'amazi mu Rwanda rutanga serivisi z'ingenzi zo gucunga umutungo kamere w'amazi. Urubuga rwacu rugira ngo amategeko y'amazi y'u Rwanda akurikizwe mu buryo burangwa n'ubuzimagatozi.",
      "Application Tracking": "Gukurikirana ubusabe",
      "Monitor your water permit application status in real-time through our Rwanda Water Resources Board online dashboard.": "Kurikirana uko ubusabe bwawe bw'uruhushya rw'amazi bugenda buri kanya binyuze ku kibaho cyacu cya interineti cy'Ikigo cy'Igihugu gishinzwe umutungo kamere w'amazi mu Rwanda.",
      "Secure Processing": "Gutunganya mu mutekano",
      "The Rwanda Water Resources Board ensures your application data is protected with advanced security measures compliant with national regulations.": "Ikigo cy'Igihugu gishinzwe umutungo kamere w'amazi mu Rwanda cigira ngo amakuru y'ubusabe bwawe arinzwe n'ingamba z'umutekano zinogowe zujuje amategeko y'igihugu.",
      "Efficient Service": "Serivisi zinoze",
      "The Rwanda Water Resources Board digital system streamlines the water permit process to reduce processing time and administrative barriers.": "Sisitemu ya digitale y'Ikigo cy'Igihugu gishinzwe umutungo kamere w'amazi mu Rwanda yoroshya inzira y'impushya z'amazi kugira ngo igihe cyo gutunganya no imitangirire y'ubutegetsi bike.",
      "Real-time application status updates": "Gukurikirana uko ubusabe bugenda buri kanya",
      "Notification system for progress": "Sisitemu y'ubutumwa ku iterambere ry'ubusabe",
      "Complete application history": "Amateka yuzuye y'ubusabe bwawe",
      "National data protection standards": "Ingamba z'igihugu zo kurinda amakuru",
      "Secure document storage": "Kubika inyandiko mu mutekano",
      "Government-verified processing": "Gutunganya byemejwe na leta",
      "Streamlined application submissions": "Ohereza ubusabe mu buryo bworoshe",
      "Available 24/7 for applications": "Uboneka amasaha 24/7 ku busabe",
      "Reduced processing time": "Igihe gito cyo gutunganya",
      "APPLICATION PROCESS": "INZIRA Y'UBUSABE",
      "How to Apply for Your Water Permit": "Uburyo bwo gusaba uruhushya rw'amazi",
      "Follow these steps to complete your water concession permit application through our official portal": "Kurikira ibi bikorwa kugira ngo urangize ubusabe bwawe bw'uruhushya rw'amazi ku rubuga rwacu rw'ubutegetsi",
      "Create Account": "Fungura konti",
      "Register with your official credentials": "Iyandikishe ushinzwe ibyangombwa by'ubutegetsi",
      "Submit Application": "Ohereza ubusabe",
      "Complete the required information and forms": "Uzuza amakuru asabwa n'amafishi agenewe",
      "Provide Documentation": "Tanga inyandiko",
      "Upload supporting documents as specified": "Shyiraho inyandiko zishyigikira nk'uko byagenewe",
      "Receive Decision": "Akira icyemezo",
      "Obtain your official water permit certificate": "Bona icyemezo cya leta cy'uruhushya rw'amazi",
      "Access Water Permit Services": "Injira mu serivisi z'impushya z'amazi",
      "The official portal for water concession permit applications. Our digital services enable efficient processing and management of water permits.": "Urubuga rw'ubutegetsi rw'ubusabe bw'impushya z'amazi. Serivisi zacu za digitale zemerera gutunganya no gucunga impushya z'amazi mu buryo bworoheye.",
      "New Applications": "Ubusabe bushya",
      "Submit a new water concession permit application": "Ohereza ubusabe bushya bw'uruhushya rw'amazi",
      "Begin Application": "Tangira ubusabe",
      "Existing Applications": "Ubusabe busanzwe",
      "Check status or manage your current applications": "Reba aho ubusabe bugarutse cyangwa ucunge ubusabe bwawe busanzwe",
      "Sign In": "Injira",
      "Need assistance?": "Ukeneye ubufasha?",
      "Contact our support": "Wasiliana n'ubufasha bwacu",
      "Login to your account": "Injira muri konti yawe",
      "Enter your email below to login to your account": "Injiza imeyili yawe hepfo kugira ngo winjire muri konti yawe",
      "Forgot your password?": "Wibagiwe ijambo ry'ibanga?",
      "Signing in...": "Kwinjira birimo gutunganywa...",
      "Don't have an account?": "Nta konti ufite?",
      "Sign up": "Iyandikishe",
      "Having trouble in a regular browser window?": "Ufite ikibazo mu buhanga busanzwe bwa murandasi?",
      "Clear saved session": "Siba igihe cyo kwinjira cyabitswe",
      "Clearing saved session…": "Birimo gusibwa...",
      "Your account has been suspended. Please contact support.": "Konti yawe hagaritswe. Nyamuneka wasiliana n'ubufasha.",
      "Your account is inactive. Please contact support to reactivate.": "Konti yawe ntikora. Nyamuneka wasiliana n'ubufasha kugira ngo yongere gukorwa.",
      "Your session has expired. Please sign in again.": "Igihe cyawe cyo kwinjira kirangiye. Nyamuneka ongera kwinjira.",
      "An authentication error occurred.": "Habaye ikosa mu kwinjira.",
      "An unexpected error occurred. Please try again.": "Habaye ikosa ritateganijwe. Nyamuneka ongera ugerageze.",
      "Your email address needs to be verified before you can log in.": "Aderesi ya imeyili yawe igomba kwemezwa mbere yo kwinjira.",
      "Resend Verification Email": "Ohereza bundi imeyili yo kwemeza",
      "Verification email sent successfully! Please check your inbox.": "Imeyili yo kwemeza yoherejwe neza! Nyamuneka reba uturaniro rwawe.",
      "Create an account": "Fungura konti",
      "Enter your details below to get started": "Injiza amakuru yawe hepfo kugira ngo utangire",
      "Organisation": "Ikigo",
      "Verify TIN to continue": "Emeza TIN kugira ngo ukomeze",
      "Enter your 9-digit TIN. We will fetch your organisation details automatically.": "Injiza TIN yawe y'imibare 9. Tuzakuzuza amakuru y'ikigo cyawe ku buryo bwikora.",
      "Tax Identification Number (TIN)": "Nomero y'Ubutegetsi bw'Imisoro (TIN)",
      "TIN verified successfully": "TIN yemejwe neza",
      "Organisation Name": "Izina ry'ikigo",
      "Organisation Address": "Aderesi y'ikigo",
      "Organisation Phone Number": "Nomero ya telefoni y'ikigo",
      "Verify National ID to continue": "Emeza indangamuntu kugira ngo ukomeze",
      "Enter your 16-digit NIDA ID. We will fetch your details automatically.": "Injiza nomero yawe ya NIDA y'imibare 16. Tuzakuzuza amakuru yawe ku buryo bwikora.",
      "NIDA ID Number": "Nomero ya NIDA y'indangamuntu",
      "National ID verified successfully": "Indangamuntu yemejwe neza",
      "Verifying TIN with RRA…": "Kwemeza TIN na RRA birimo gutunganywa…",
      "Verifying National ID with NIDA…": "Kwemeza indangamuntu na NIDA birimo gutunganywa…",
      "National ID verified.": "Indangamuntu yemejwe.",
      "ID Type": "Ubwoko bw'irangamuntu",
      "ID Number": "Nomero y'irangamuntu",
      "First Name": "Izina ry'ibanze",
      "Last Name": "Izina ry'umuryango",
      "Date of Birth": "Itariki y'amavuko",
      "Phone Number": "Nomero ya telefoni",
      "Please wait...": "Nyamuneka itegereze...",
      "Continue": "Komeza",
      "Phone verification failed": "Kwemeza telefoni byanze",
      "Account already exists": "Konti isanzwe ibaho",
      "Registration failed": "Kwiyandikisha byanze",
      "Go to login": "Genda ku kwinjira",
      "Date of birth is required.": "Itariki y'amavuko irakenewe.",
      "You must be at least 18 years old to register.": "Ugomba kuba ufite nibura imyaka 18 kugira ngo uyandikishe.",
      "Email is required.": "Imeyili irakenewe.",
      "Invalid email address.": "Aderesi ya imeyili ntabwo ari yemewe.",
      "Password is required.": "Ijambo ry'ibanga rirakenewe.",
      "Password must be at least 6 characters long.": "Ijambo ry'ibanga rigomba kuba rifite nibura imibare 6.",
      "National ID is required.": "Indangamuntu irakenewe.",
      "ID number must be exactly 16 digits.": "Nomero y'irangamuntu igomba kuba ifite imibare 16 nzima.",
      "TIN is required for organisation registration.": "TIN irakenewe mu kwiyandikisha kw'ikigo.",
      "TIN must be exactly 9 digits.": "TIN igomba kuba ifite imibare 9 nzima.",
      "Already have an account? Sign in": "Usanzwe ufite konti? Injira",
      "Verify your phone": "Emeza telefoni yawe",
      "We've sent a verification code to": "Twohereje kode yo kwemeza kuri",
      "Edit": "Hindura",
      "Save & Send Code": "Bika no kohereza kode",
      "Sending...": "Birimo koherezwa...",
      "Enter 6-digit code": "Injiza kode y'imibare 6",
      "Verifying...": "Kwemeza birimo gutunganywa...",
      "Verify Phone": "Emeza telefoni",
      "Change phone number": "Hindura nomero ya telefoni",
      "Didn't receive the code?": "Nturayakira kode?",
      "Resending...": "Bioherezwa bundi bushe...",
      "Resend Code": "Ohereza kode bundi",
      "Please enter a phone number.": "Nyamuneka injiza nomero ya telefoni.",
      "Invalid phone number format. Use 07XXXXXXXX (10 digits).": "Inyandiko ya nomero ya telefoni ntabwo ari yemewe. Koresha 07XXXXXXXX (imibare 10).",
      "Verify Your Email": "Emeza imeyili yawe",
      "Sending verification code...": "Kohereza kode yo kwemeza birimo gutunganywa...",
      "Email Verified!": "Imeyili yemejwe!",
      "Redirecting to dashboard...": "Birimo kuja ku kibaho...",
      "Enter verification code": "Injiza kode yo kwemeza",
      "Verify & Create Account": "Emeza ukongere konti",
      "Back to previous step": "Subira ku ntera ishize",
      "Please enter all 6 digits": "Nyamuneka injiza imibare yose 6",
      "Forgot password": "Wibagiwe ijambo ry'ibanga",
      "Enter your email and we'll send you a reset code.": "Injiza imeyili yawe kandi tuzagutumaho kode yo gusubiza ijambo ry'ibanga.",
      "Enter the code from your email to verify your request.": "Injiza kode utuye mu imeyili yawe kugira ngo wemeze ubusabe bwawe.",
      "Code verified. Choose a new password.": "Kode yemejwe. Hitamo ijambo ry'ibanga rishya.",
      "Code": "Kode",
      "6-digit code": "Kode y'imibare 6",
      "Enter new password": "Injiza ijambo ry'ibanga rishya",
      "Confirm new password": "Emeza ijambo ry'ibanga rishya",
      "Sending…": "Kohereza birimo gutunganywa…",
      "Verifying…": "Kwemeza birimo gutunganywa…",
      "Updating…": "Guhindura birimo gutunganywa…",
      "Send reset code": "Ohereza kode yo gusubiza",
      "Verify code": "Emeza kode",
      "Update password": "Hindura ijambo ry'ibanga",
      "Change email": "Hindura imeyili",
      "Back to login": "Subira ku kwinjira",
      "Please enter your email address.": "Nyamuneka injiza aderesi ya imeyili yawe.",
      "Please enter the code we sent to your email.": "Nyamuneka injiza kode twohereje ku imeyili yawe.",
      "Invalid or expired code. Please try again.": "Kode ntabwo ari yemewe cyangwa yarangiye. Nyamuneka ongera ugerageze.",
      "Server error: missing reset token. Please resend the code and try again.": "Ikosa rya seriveri: kode yo gusubiza irashingwa. Nyamuneka ongera uohereze kode hanyuma ugerageze.",
      "Code verified. Please set your new password.": "Kode yemejwe. Nyamuneka shyira ijambo ry'ibanga rishya.",
      "If an account exists for this email, you'll receive a password reset code shortly. Please check your inbox (and spam).": "Niba konti ibaho kuri iyi imeyili, uzabona kode yo gusubiza ijambo ry'ibanga vuba. Nyamuneka reba uturaniro rwawe (no mu myuzure).",
      "Code resent. Please check your email.": "Kode yoherejwe bundi. Nyamuneka reba imeyili yawe.",
      "Your reset session expired. Please verify the code again.": "Igihe cyo gusubiza cyawe cyarangiye. Nyamuneka ongera wemeze kode.",
      "Please fill in all fields.": "Nyamuneka uzuze ibibanza byose.",
      "Passwords do not match.": "Amagambo y'ibanga ntahuye.",
      "Could not verify code. Please try again.": "Ntishobotse kwemeza kode. Nyamuneka ongera ugerageze.",
      "Failed to send reset code. Please try again.": "Kohereza kode yo gusubiza byanze. Nyamuneka ongera ugerageze.",
      "Reset Your Password": "Gusubiza ijambo ry'ibanga",
      "Enter your new password below": "Injiza ijambo ry'ibanga rishya hepfo",
      "Updating Password...": "Guhindura ijambo ry'ibanga birimo gutunganywa...",
      "Update Password": "Hindura ijambo ry'ibanga",
      "Back to Login": "Subira ku kwinjira",
      "Invalid reset password link. Missing reset token.": "Uhuza wo gusubiza ijambo ry'ibanga ntabwo ari mwiza. Kode yo gusubiza irashingwa.",
      "Please fill in all fields": "Nyamuneka uzuze ibibanza byose",
      "Passwords do not match": "Amagambo y'ibanga ntahuye",
      "Password must be at least 6 characters long": "Ijambo ry'ibanga rigomba kuba rifite nibura imibare 6",
      "Failed to update password": "Guhindura ijambo ry'ibanga byanze",
      "Password updated successfully! Redirecting to login...": "Ijambo ry'ibanga rihindutse neza! Birimo kuja ku kwinjira...",
      "An unexpected error occurred": "Habaye ikosa ritateganijwe",
      "Loading...": "Birimo gutegurwa...",
      "Email": "Imeyili",
      "What's next?": "Ikurikira ni iki?",
      "Complete your profile and provide additional information": "Uzuza umwirondoro wawe utange amakuru y'inyongera",
      "Apply for a new water permit or manage existing ones": "Saba uruhushya rushya rw'amazi cyangwa ucunge rusanzwe",
      "Track application status through your dashboard": "Kurikirana icyiciro cy'ubusabe binyuze ku kibaho cyawe",
      "You can now access all the features of the Rwanda Water Resources Board permit application system.": "Ubu ushobora gukoresha ibikorwa byose bya sisitemu y'ubusabe bw'impushya z'amazi y'Ikigo cy'Igihugu gishinzwe umutungo kamere w'amazi mu Rwanda.",
      "Start New Application": "Tangira ubusabe bushya",
      "Water Use Dashboard": "Ikibaho cy'ikoreshwa ry'amazi",
```

- [ ] **Step 2: Verify the JSON is valid**

```bash
cd /Users/nourumuneza/go/src/waterpermit && node -e "JSON.parse(require('fs').readFileSync('messages/rw.json','utf8')); console.log('✅ rw.json is valid JSON')"
```

Expected: `✅ rw.json is valid JSON`

- [ ] **Step 3: Commit**

```bash
cd /Users/nourumuneza/go/src/waterpermit
git add messages/rw.json
git commit -m "feat(i18n): add missing Kinyarwanda translations for all applicant-facing pages"
```

---

### Task 2: Show `<LanguageSwitcher>` on all pages in the header

**Files:**
- Modify: `components/layout/header.tsx`

The header currently has two `{isDashboardPage && <LanguageSwitcher ... />}` guards — one for desktop, one for mobile. Remove the `isDashboardPage` condition from both so the switcher shows everywhere.

- [ ] **Step 1: Replace desktop guard**

Find:
```tsx
          <div className="hidden md:flex shrink-0 items-center gap-3">
            {isDashboardPage && (
              <LanguageSwitcher language={language} onChange={setPreferredLanguage} compact />
            )}
```

Replace with:
```tsx
          <div className="hidden md:flex shrink-0 items-center gap-3">
            {!shouldShowMinimalHeaderForStaff && (
              <LanguageSwitcher language={language} onChange={setPreferredLanguage} compact />
            )}
```

- [ ] **Step 2: Replace mobile guard**

Find:
```tsx
          <div className="md:hidden flex shrink-0 items-center gap-2">
            {isDashboardPage && (
              <LanguageSwitcher language={language} onChange={setPreferredLanguage} compact />
            )}
```

Replace with:
```tsx
          <div className="md:hidden flex shrink-0 items-center gap-2">
            {!shouldShowMinimalHeaderForStaff && (
              <LanguageSwitcher language={language} onChange={setPreferredLanguage} compact />
            )}
```

- [ ] **Step 3: Verify the header compiles**

```bash
cd /Users/nourumuneza/go/src/waterpermit && npx tsc --noEmit --project tsconfig.json 2>&1 | head -20
```

Expected: no errors for `header.tsx`

- [ ] **Step 4: Commit**

```bash
cd /Users/nourumuneza/go/src/waterpermit
git add components/layout/header.tsx
git commit -m "feat(i18n): show language toggle on all public pages, not only dashboard"
```

---

### Task 3: Translate `hero-section.tsx`

**Files:**
- Modify: `components/home/hero-section.tsx`

- [ ] **Step 1: Add language imports**

Find the existing imports block (starts at line 1 of the file). Add after `import { useEffect, useState } from "react";`:

```tsx
import {
  getPreferredLanguage,
  subscribeToLanguageChanges,
  type AppLanguage,
} from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";
```

- [ ] **Step 2: Add language hook inside `HeroSection`**

Find:
```tsx
export function HeroSection() {
  const [isHovered, setIsHovered] = useState(false);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
```

Replace with:
```tsx
export function HeroSection() {
  const [isHovered, setIsHovered] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [language, setLanguage] = useState<AppLanguage>("en");

  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);

  const tx = (value: string) => translateText(value, language);

  useEffect(() => {
```

- [ ] **Step 3: Replace hardcoded strings in JSX**

Find:
```tsx
                Rwanda Water Permit Portal
```
Replace with:
```tsx
                {tx("Rwanda Water Permit Portal")}
```

Find:
```tsx
              Welcome to the official Rwanda Water Resources Board permit application portal. Apply, track, and manage your water concession permits through our secure digital platform for sustainable water resource management in Rwanda.
```
Replace with:
```tsx
              {tx("Welcome to the official Rwanda Water Resources Board permit application portal. Apply, track, and manage your water concession permits through our secure digital platform for sustainable water resource management in Rwanda.")}
```

Find:
```tsx
                        APPLY NOW
```
Replace with:
```tsx
                        {tx("APPLY NOW")}
```

Find:
```tsx
                  <span className="text-sm font-medium text-white">SECURITY</span>
```
Replace with:
```tsx
                  <span className="text-sm font-medium text-white">{tx("SECURITY")}</span>
```

Find:
```tsx
                  <span className="text-sm font-medium text-white">PRIVACY</span>
```
Replace with:
```tsx
                  <span className="text-sm font-medium text-white">{tx("PRIVACY")}</span>
```

- [ ] **Step 4: Commit**

```bash
cd /Users/nourumuneza/go/src/waterpermit
git add components/home/hero-section.tsx
git commit -m "feat(i18n): translate hero section"
```

---

### Task 4: Translate `features-section.tsx`

**Files:**
- Modify: `components/home/features-section.tsx`

- [ ] **Step 1: Add language imports**

After `import { CheckCircle } from "lucide-react";` add:
```tsx
import { useEffect, useState } from "react";
import {
  getPreferredLanguage,
  subscribeToLanguageChanges,
  type AppLanguage,
} from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";
```

- [ ] **Step 2: Convert `featuresData` from module-level constant to computed inside component**

The `featuresData` array currently lives outside the component as a module-level constant. Move it inside the component so `tx()` can be called. Replace this:

```tsx
const featuresData = [
  {
    title: "Application Tracking",
    description: "Monitor your water permit application status in real-time through our Rwanda Water Resources Board online dashboard.",
    icon: (
```

...all the way through:
```tsx
];

export function FeaturesSection() {
  return (
```

with:

```tsx
export function FeaturesSection() {
  const [language, setLanguage] = useState<AppLanguage>("en");

  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);

  const tx = (value: string) => translateText(value, language);

  const featuresData = [
    {
      title: tx("Application Tracking"),
      description: tx("Monitor your water permit application status in real-time through our Rwanda Water Resources Board online dashboard."),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-bar-chart-3">
          <path d="M3 3v18h18" />
          <path d="M18 17V9" />
          <path d="M13 17V5" />
          <path d="M8 17v-3" />
        </svg>
      ),
    },
    {
      title: tx("Secure Processing"),
      description: tx("The Rwanda Water Resources Board ensures your application data is protected with advanced security measures compliant with national regulations."),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-shield-check">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      ),
    },
    {
      title: tx("Efficient Service"),
      description: tx("The Rwanda Water Resources Board digital system streamlines the water permit process to reduce processing time and administrative barriers."),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-zap">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      ),
    },
  ];

  return (
```

- [ ] **Step 3: Translate inline strings in the JSX**

Find:
```tsx
          <div className="text-sm font-medium text-primary mb-3">SERVICE FEATURES</div>
          <h2 className="font-heading mt-12 scroll-m-28 text-2xl font-medium tracking-tight first:mt-0 lg:mt-20 [&+p]:!mt-4 *:[code]:text-2xl mb-6">Rwanda Water Resources Board Portal Services</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            The official Rwanda Water Resources Board portal provides essential services for managing water resources.
            Our platform ensures compliance with Rwanda's water regulations while offering a transparent process.
          </p>
```

Replace with:
```tsx
          <div className="text-sm font-medium text-primary mb-3">{tx("SERVICE FEATURES")}</div>
          <h2 className="font-heading mt-12 scroll-m-28 text-2xl font-medium tracking-tight first:mt-0 lg:mt-20 [&+p]:!mt-4 *:[code]:text-2xl mb-6">{tx("Rwanda Water Resources Board Portal Services")}</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            {tx("The official Rwanda Water Resources Board portal provides essential services for managing water resources. Our platform ensures compliance with Rwanda's water regulations while offering a transparent process.")}
          </p>
```

Find (3 occurrences — tracking card):
```tsx
                      <span>Real-time application status updates</span>
```
Replace with:
```tsx
                      <span>{tx("Real-time application status updates")}</span>
```

Find:
```tsx
                      <span>Notification system for progress</span>
```
Replace with:
```tsx
                      <span>{tx("Notification system for progress")}</span>
```

Find:
```tsx
                      <span>Complete application history</span>
```
Replace with:
```tsx
                      <span>{tx("Complete application history")}</span>
```

Find:
```tsx
                      <span>National data protection standards</span>
```
Replace with:
```tsx
                      <span>{tx("National data protection standards")}</span>
```

Find:
```tsx
                      <span>Secure document storage</span>
```
Replace with:
```tsx
                      <span>{tx("Secure document storage")}</span>
```

Find:
```tsx
                      <span>Government-verified processing</span>
```
Replace with:
```tsx
                      <span>{tx("Government-verified processing")}</span>
```

Find:
```tsx
                      <span>Streamlined application submissions</span>
```
Replace with:
```tsx
                      <span>{tx("Streamlined application submissions")}</span>
```

Find:
```tsx
                      <span>Available 24/7 for applications</span>
```
Replace with:
```tsx
                      <span>{tx("Available 24/7 for applications")}</span>
```

Find:
```tsx
                      <span>Reduced processing time</span>
```
Replace with:
```tsx
                      <span>{tx("Reduced processing time")}</span>
```

- [ ] **Step 4: Commit**

```bash
cd /Users/nourumuneza/go/src/waterpermit
git add components/home/features-section.tsx
git commit -m "feat(i18n): translate features section"
```

---

### Task 5: Translate `process-section.tsx`

**Files:**
- Modify: `components/home/process-section.tsx`

- [ ] **Step 1: Add language imports**

After `import { ArrowRight } from "lucide-react";` add:
```tsx
import { useEffect, useState } from "react";
import {
  getPreferredLanguage,
  subscribeToLanguageChanges,
  type AppLanguage,
} from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";
```

- [ ] **Step 2: Move `processSteps` inside component and add language hook**

Replace:
```tsx
const processSteps = [
  {
    number: 1,
    title: "Create Account",
    description: "Register with your official credentials",
  },
  {
    number: 2,
    title: "Submit Application",
    description: "Complete the required information and forms",
  },
  {
    number: 3,
    title: "Provide Documentation",
    description: "Upload supporting documents as specified",
  },
  {
    number: 4,
    title: "Receive Decision",
    description: "Obtain your official water permit certificate",
  }
];

export function ProcessSection() {
  return (
```

With:
```tsx
export function ProcessSection() {
  const [language, setLanguage] = useState<AppLanguage>("en");

  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);

  const tx = (value: string) => translateText(value, language);

  const processSteps = [
    {
      number: 1,
      title: tx("Create Account"),
      description: tx("Register with your official credentials"),
    },
    {
      number: 2,
      title: tx("Submit Application"),
      description: tx("Complete the required information and forms"),
    },
    {
      number: 3,
      title: tx("Provide Documentation"),
      description: tx("Upload supporting documents as specified"),
    },
    {
      number: 4,
      title: tx("Receive Decision"),
      description: tx("Obtain your official water permit certificate"),
    }
  ];

  return (
```

- [ ] **Step 3: Translate inline strings**

Find:
```tsx
            APPLICATION PROCESS
```
Replace with:
```tsx
            {tx("APPLICATION PROCESS")}
```

Find:
```tsx
            How to Apply for Your Water Permit
```
Replace with:
```tsx
            {tx("How to Apply for Your Water Permit")}
```

Find:
```tsx
            Follow these steps to complete your water concession permit application through our official portal
```
Replace with:
```tsx
            {tx("Follow these steps to complete your water concession permit application through our official portal")}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/nourumuneza/go/src/waterpermit
git add components/home/process-section.tsx
git commit -m "feat(i18n): translate process section"
```

---

### Task 6: Translate `cta-section.tsx`

**Files:**
- Modify: `components/home/cta-section.tsx`

- [ ] **Step 1: Add language imports**

After `import { Card } from "@/components/ui/card";` add:
```tsx
import { useEffect, useState } from "react";
import {
  getPreferredLanguage,
  subscribeToLanguageChanges,
  type AppLanguage,
} from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";
```

- [ ] **Step 2: Add language hook inside `CTASection`**

Find:
```tsx
export function CTASection() {
  return (
```

Replace with:
```tsx
export function CTASection() {
  const [language, setLanguage] = useState<AppLanguage>("en");

  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);

  const tx = (value: string) => translateText(value, language);

  return (
```

- [ ] **Step 3: Replace all hardcoded strings**

Find:
```tsx
                Access Water Permit Services
```
Replace with:
```tsx
                {tx("Access Water Permit Services")}
```

Find:
```tsx
                The official portal for water concession permit applications. Our digital services enable efficient processing and management of water permits.
```
Replace with:
```tsx
                {tx("The official portal for water concession permit applications. Our digital services enable efficient processing and management of water permits.")}
```

Find:
```tsx
                <h3 className="font-semibold text-lg mb-2">New Applications</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  Submit a new water concession permit application
                </p>
                <Link href="/apply">
                  <Button className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground rounded-full">
                    Begin Application
                  </Button>
                </Link>
```

Replace with:
```tsx
                <h3 className="font-semibold text-lg mb-2">{tx("New Applications")}</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  {tx("Submit a new water concession permit application")}
                </p>
                <Link href="/apply">
                  <Button className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground rounded-full">
                    {tx("Begin Application")}
                  </Button>
                </Link>
```

Find:
```tsx
                <h3 className="font-semibold text-lg mb-2">Existing Applications</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  Check status or manage your current applications
                </p>
                <Link href="/login">
                  <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-full">
                    Sign In
                  </Button>
                </Link>
```

Replace with:
```tsx
                <h3 className="font-semibold text-lg mb-2">{tx("Existing Applications")}</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  {tx("Check status or manage your current applications")}
                </p>
                <Link href="/login">
                  <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-full">
                    {tx("Sign In")}
                  </Button>
                </Link>
```

Find:
```tsx
              Need assistance? <Link href="https://waterpermit.rwb.rw/contact" target="_blank" rel="noopener noreferrer" className="underline hover:text-white">Contact our support</Link>
```

Replace with:
```tsx
              {tx("Need assistance?")} <Link href="https://waterpermit.rwb.rw/contact" target="_blank" rel="noopener noreferrer" className="underline hover:text-white">{tx("Contact our support")}</Link>
```

- [ ] **Step 4: Commit**

```bash
cd /Users/nourumuneza/go/src/waterpermit
git add components/home/cta-section.tsx
git commit -m "feat(i18n): translate CTA section"
```

---

### Task 7: Translate `login-form.tsx`

**Files:**
- Modify: `components/auth/login-form.tsx`

- [ ] **Step 1: Add language imports**

After `import { useAuth } from "@/contexts/AuthContext";` add:
```tsx
import {
  getPreferredLanguage,
  subscribeToLanguageChanges,
  type AppLanguage,
} from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";
```

- [ ] **Step 2: Add language hook inside `LoginForm`**

Find:
```tsx
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn, userProfile, user } = useAuth();
  const [email, setEmail] = useState("");
```

Replace with:
```tsx
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn, userProfile, user } = useAuth();
  const [language, setLanguage] = useState<AppLanguage>("en");

  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);

  const tx = (value: string) => translateText(value, language);

  const [email, setEmail] = useState("");
```

- [ ] **Step 3: Translate URL-param error messages**

Find:
```tsx
        case 'suspended':
          setError('Your account has been suspended. Please contact support.');
          break;
        case 'inactive':
          setError('Your account is inactive. Please contact support to reactivate.');
          break;
        case 'session_timeout':
          setError('Your session has expired. Please sign in again.');
          break;
        default:
          setError('An authentication error occurred.');
```

Replace with:
```tsx
        case 'suspended':
          setError(translateText('Your account has been suspended. Please contact support.', getPreferredLanguage()));
          break;
        case 'inactive':
          setError(translateText('Your account is inactive. Please contact support to reactivate.', getPreferredLanguage()));
          break;
        case 'session_timeout':
          setError(translateText('Your session has expired. Please sign in again.', getPreferredLanguage()));
          break;
        default:
          setError(translateText('An authentication error occurred.', getPreferredLanguage()));
```

Note: we call `getPreferredLanguage()` directly here because this runs inside a `useEffect` where `language` state may not reflect the latest value yet.

- [ ] **Step 4: Translate the `handleSubmit` error messages**

Find:
```tsx
        setError("An unexpected error occurred. Please try again.");
```
Replace with:
```tsx
        setError(tx("An unexpected error occurred. Please try again."));
```

- [ ] **Step 5: Translate the `handleResendVerification` messages**

Find:
```tsx
        setError(json?.message || json?.error || 'Failed to send verification email. Please try again.');
```
Replace (leave the json?.message part as-is since those come from the server):
```tsx
        setError(json?.message || json?.error || tx('Failed to send verification email. Please try again.'));
```

Wait — "Failed to send verification email. Please try again." is not in rw.json yet. Add it as a literal. But since we're modifying rw.json in Task 1, note that this phrase isn't included there. Instead, just reuse "An unexpected error occurred. Please try again.":

```tsx
        setError(json?.message || json?.error || tx('An unexpected error occurred. Please try again.'));
```

Find:
```tsx
      setSuccess("Verification email sent successfully! Please check your inbox.");
```
Replace with:
```tsx
      setSuccess(tx("Verification email sent successfully! Please check your inbox."));
```

- [ ] **Step 6: Translate the JSX**

Find:
```tsx
        <CardTitle className="text-2xl">Login to your account</CardTitle>
        <CardDescription>
          Enter your email below to login to your account
        </CardDescription>
```
Replace with:
```tsx
        <CardTitle className="text-2xl">{tx("Login to your account")}</CardTitle>
        <CardDescription>
          {tx("Enter your email below to login to your account")}
        </CardDescription>
```

Find:
```tsx
                  <p>Your email address needs to be verified before you can log in.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResendVerification}
                    disabled={resendingEmail || !email}
                    className="w-full"
                  >
                    {resendingEmail ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Mail className="mr-2 h-4 w-4" />
                        Resend Verification Email
                      </>
                    )}
```
Replace with:
```tsx
                  <p>{tx("Your email address needs to be verified before you can log in.")}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResendVerification}
                    disabled={resendingEmail || !email}
                    className="w-full"
                  >
                    {resendingEmail ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        {tx("Sending...")}
                      </>
                    ) : (
                      <>
                        <Mail className="mr-2 h-4 w-4" />
                        {tx("Resend Verification Email")}
                      </>
                    )}
```

Find:
```tsx
            <Label htmlFor="email">Email</Label>
```
Replace with:
```tsx
            <Label htmlFor="email">{tx("Email")}</Label>
```

Find (the password label row):
```tsx
              <Label htmlFor="password">Password</Label>
              <Link
                href="/forgot-password"
                className="ml-auto inline-block text-sm underline"
              >
                Forgot your password?
              </Link>
```
Replace with:
```tsx
              <Label htmlFor="password">{tx("Password")}</Label>
              <Link
                href="/forgot-password"
                className="ml-auto inline-block text-sm underline"
              >
                {tx("Forgot your password?")}
              </Link>
```

Find:
```tsx
            {isLoading ? "Signing in..." : "Login"}
```
Replace with:
```tsx
            {isLoading ? tx("Signing in...") : tx("Login")}
```

Find:
```tsx
          Don&apos;t have an account?{" "}
          <Link href="/register" className="underline">
            Sign up
          </Link>
```
Replace with:
```tsx
          {tx("Don't have an account?")}{" "}
          <Link href="/register" className="underline">
            {tx("Sign up")}
          </Link>
```

Find:
```tsx
          Having trouble in a regular browser window?{" "}
          <button
            type="button"
            onClick={clearSavedSession}
            disabled={isClearingSession || isLoading}
            className="underline"
          >
            {isClearingSession ? "Clearing saved session…" : "Clear saved session"}
          </button>
```
Replace with:
```tsx
          {tx("Having trouble in a regular browser window?")}{" "}
          <button
            type="button"
            onClick={clearSavedSession}
            disabled={isClearingSession || isLoading}
            className="underline"
          >
            {isClearingSession ? tx("Clearing saved session…") : tx("Clear saved session")}
          </button>
```

- [ ] **Step 7: Commit**

```bash
cd /Users/nourumuneza/go/src/waterpermit
git add components/auth/login-form.tsx
git commit -m "feat(i18n): translate login form"
```

---

### Task 8: Translate `sign-up-form.tsx`

**Files:**
- Modify: `components/auth/sign-up-form.tsx`

- [ ] **Step 1: Add language imports**

The file already imports `{ useState, useEffect }`. Add after the existing imports:
```tsx
import {
  getPreferredLanguage,
  subscribeToLanguageChanges,
  type AppLanguage,
} from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";
```

- [ ] **Step 2: Add language hook inside `SignUpForm`**

Find (inside the function, after the existing state declarations):
```tsx
  const [nidaEnabled, setNidaEnabled] = useState<boolean>(false);
```

Add the language state and hook immediately before `const [nidaEnabled`:
```tsx
  const [language, setLanguage] = useState<AppLanguage>("en");

  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);

  const tx = (value: string) => translateText(value, language);

  const [nidaEnabled, setNidaEnabled] = useState<boolean>(false);
```

- [ ] **Step 3: Translate validation error messages**

Find each `setDateOfBirthError`, `setEmailError`, `setPasswordError`, `setIdNumberError`, `setCompanyTINError` call with a hardcoded string. Replace as follows:

```tsx
      setDateOfBirthError("Date of birth is required.");
```
→
```tsx
      setDateOfBirthError(tx("Date of birth is required."));
```

```tsx
      setDateOfBirthError("You must be at least 18 years old to register.");
```
→
```tsx
      setDateOfBirthError(tx("You must be at least 18 years old to register."));
```

```tsx
      setEmailError("Email is required.");
```
→
```tsx
      setEmailError(tx("Email is required."));
```

```tsx
      setEmailError("Invalid email address.");
```
→
```tsx
      setEmailError(tx("Invalid email address."));
```

```tsx
      setPasswordError("Password is required.");
```
→
```tsx
      setPasswordError(tx("Password is required."));
```

```tsx
      setPasswordError("Password must be at least 6 characters long.");
```
→
```tsx
      setPasswordError(tx("Password must be at least 6 characters long."));
```

```tsx
      setIdNumberError("National ID is required.");
```
→
```tsx
      setIdNumberError(tx("National ID is required."));
```

```tsx
      setIdNumberError("ID number must be exactly 16 digits.");
```
→
```tsx
      setIdNumberError(tx("ID number must be exactly 16 digits."));
```

```tsx
      setCompanyTINError("TIN is required for organisation registration.");
```
→
```tsx
      setCompanyTINError(tx("TIN is required for organisation registration."));
```

```tsx
      setCompanyTINError("TIN must be exactly 9 digits.");
```
→
```tsx
      setCompanyTINError(tx("TIN must be exactly 9 digits."));
```

- [ ] **Step 4: Translate error heading computed values and JSX**

Find:
```tsx
            const heading = isPhoneIssue
              ? "Phone verification failed"
              : isDuplicate
                ? "Account already exists"
                : "Registration failed";
```
Replace with:
```tsx
            const heading = isPhoneIssue
              ? tx("Phone verification failed")
              : isDuplicate
                ? tx("Account already exists")
                : tx("Registration failed");
```

Find:
```tsx
                  <Link href="/login" className="text-primary underline underline-offset-2 font-medium">
                    Go to login
                  </Link>
```
Replace with:
```tsx
                  <Link href="/login" className="text-primary underline underline-offset-2 font-medium">
                    {tx("Go to login")}
                  </Link>
```

Find:
```tsx
              <TabsTrigger value="company">Organisation</TabsTrigger>
              <TabsTrigger value="individual">Individual</TabsTrigger>
```
Replace with:
```tsx
              <TabsTrigger value="company">{tx("Organisation")}</TabsTrigger>
              <TabsTrigger value="individual">{tx("Individual")}</TabsTrigger>
```

- [ ] **Step 5: Translate CardHeader and section labels**

Find:
```tsx
          <CardTitle className="text-2xl font-bold text-center">Create an account</CardTitle>
          <CardDescription className="text-center">
            Enter your details below to get started
          </CardDescription>
```
Replace with:
```tsx
          <CardTitle className="text-2xl font-bold text-center">{tx("Create an account")}</CardTitle>
          <CardDescription className="text-center">
            {tx("Enter your details below to get started")}
          </CardDescription>
```

Find:
```tsx
                      <p className="text-sm font-semibold text-foreground">Verify TIN to continue</p>
                      <p className="text-xs text-muted-foreground">
                        Enter your 9-digit TIN. We will fetch your organisation details automatically.
                      </p>
```
Replace with:
```tsx
                      <p className="text-sm font-semibold text-foreground">{tx("Verify TIN to continue")}</p>
                      <p className="text-xs text-muted-foreground">
                        {tx("Enter your 9-digit TIN. We will fetch your organisation details automatically.")}
                      </p>
```

Find:
```tsx
                      <Label htmlFor="companyTIN">Tax Identification Number (TIN)</Label>
```
Replace with (both occurrences):
```tsx
                      <Label htmlFor="companyTIN">{tx("Tax Identification Number (TIN)")}</Label>
```

Find:
```tsx
                            <span className="text-xs font-medium">TIN verified successfully</span>
```
Replace with:
```tsx
                            <span className="text-xs font-medium">{tx("TIN verified successfully")}</span>
```

Find:
```tsx
                      <Label htmlFor="companyName">Organisation Name</Label>
```
Replace with:
```tsx
                      <Label htmlFor="companyName">{tx("Organisation Name")}</Label>
```

Find:
```tsx
                      <Label htmlFor="companyAddress">Organisation Address</Label>
```
Replace with:
```tsx
                      <Label htmlFor="companyAddress">{tx("Organisation Address")}</Label>
```

Find:
```tsx
                      <Label htmlFor="companyPhone">Organisation Phone Number</Label>
```
Replace with:
```tsx
                      <Label htmlFor="companyPhone">{tx("Organisation Phone Number")}</Label>
```

Find:
```tsx
                      <p className="text-sm font-semibold text-foreground">Verify National ID to continue</p>
                      <p className="text-xs text-muted-foreground">
                        Enter your 16-digit NIDA ID. We will fetch your details automatically.
                      </p>
```
Replace with:
```tsx
                      <p className="text-sm font-semibold text-foreground">{tx("Verify National ID to continue")}</p>
                      <p className="text-xs text-muted-foreground">
                        {tx("Enter your 16-digit NIDA ID. We will fetch your details automatically.")}
                      </p>
```

Find:
```tsx
                      <Label htmlFor="idNumber">NIDA ID Number</Label>
```
Replace with:
```tsx
                      <Label htmlFor="idNumber">{tx("NIDA ID Number")}</Label>
```

Find:
```tsx
                        <p className="text-xs text-muted-foreground mt-1">Verifying TIN with RRA…</p>
```
Replace with:
```tsx
                        <p className="text-xs text-muted-foreground mt-1">{tx("Verifying TIN with RRA…")}</p>
```

Find:
```tsx
                      {nidaEnabled && !nidaError && nidaChecking && (
                        <p className="text-xs text-muted-foreground mt-1">Verifying National ID with NIDA…</p>
```
Replace with:
```tsx
                      {nidaEnabled && !nidaError && nidaChecking && (
                        <p className="text-xs text-muted-foreground mt-1">{tx("Verifying National ID with NIDA…")}</p>
```

Find:
```tsx
                      {nidaEnabled && !nidaError && nidaVerified && (
                        <p className="text-xs text-green-700 mt-1">National ID verified.</p>
```
Replace with:
```tsx
                      {nidaEnabled && !nidaError && nidaVerified && (
                        <p className="text-xs text-green-700 mt-1">{tx("National ID verified.")}</p>
```

Find:
```tsx
                            <span className="text-xs font-medium">National ID verified successfully</span>
```
Replace with:
```tsx
                            <span className="text-xs font-medium">{tx("National ID verified successfully")}</span>
```

Find:
```tsx
                          <Label htmlFor="idType">ID Type</Label>
```
Replace with:
```tsx
                          <Label htmlFor="idType">{tx("ID Type")}</Label>
```

Find:
```tsx
                              <SelectItem value="nationalId">National ID</SelectItem>
```
Replace with:
```tsx
                              <SelectItem value="nationalId">{tx("National ID")}</SelectItem>
```

Find:
```tsx
                          <Label htmlFor="idNumberExpanded">ID Number</Label>
```
Replace with:
```tsx
                          <Label htmlFor="idNumberExpanded">{tx("ID Number")}</Label>
```

Find:
```tsx
                          <Label htmlFor="firstName">First Name</Label>
```
Replace with:
```tsx
                          <Label htmlFor="firstName">{tx("First Name")}</Label>
```

Find:
```tsx
                          <Label htmlFor="lastName">Last Name</Label>
```
Replace with:
```tsx
                          <Label htmlFor="lastName">{tx("Last Name")}</Label>
```

Find:
```tsx
                        <Label htmlFor="province">Province</Label>
```
Replace with:
```tsx
                        <Label htmlFor="province">{tx("Province")}</Label>
```

Find:
```tsx
                        <Label htmlFor="dateOfBirth">Date of Birth</Label>
```
Replace with:
```tsx
                        <Label htmlFor="dateOfBirth">{tx("Date of Birth")}</Label>
```

Find:
```tsx
                        <Label htmlFor="phone">Phone Number</Label>
```
Replace with:
```tsx
                        <Label htmlFor="phone">{tx("Phone Number")}</Label>
```

Find (both company and individual Email labels):
```tsx
                            <Label htmlFor="email">Email</Label>
```
Replace with (replace_all=true):
```tsx
                            <Label htmlFor="email">{tx("Email")}</Label>
```

Find (both company and individual Password labels):
```tsx
                            <Label htmlFor="password">Password</Label>
```
Replace with (replace_all=true):
```tsx
                            <Label htmlFor="password">{tx("Password")}</Label>
```

Find:
```tsx
                      {isLoading ? "Please wait..." : (
                          <>
                            Continue
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </>
                        )}
```
Replace with:
```tsx
                      {isLoading ? tx("Please wait...") : (
                          <>
                            {tx("Continue")}
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </>
                        )}
```

Find the footer link (look for "Already have an account" in the footer area of the form):
```tsx
          Already have an account?{" "}
          <Link href="/login" className="underline">
            Sign in
          </Link>
```
Replace with:
```tsx
          {tx("Don't have an account?") === tx("Don't have an account?") ? null : null}
          {tx("Already have an account? Sign in").includes("?") ? (
            <>
              {tx("Already have an account? Sign in").split("?")[0]}?{" "}
              <Link href="/login" className="underline">
                {tx("Already have an account? Sign in").split("?")[1]?.trim()}
              </Link>
            </>
          ) : (
            <Link href="/login" className="underline">
              {tx("Already have an account? Sign in")}
            </Link>
          )}
```

**Note:** The above is overly complex. Use this simpler approach instead — just translate the two parts separately. The existing text in the JSX is:
```tsx
          Already have an account?{" "}
          <Link href="/login" className="underline">
            Sign in
          </Link>
```
Add this translation key to rw.json Task 1 if not already there: `"Already have an account?": "Usanzwe ufite konti?"` and `"Sign in": "Injira"`. Then replace with:
```tsx
          {tx("Already have an account?")}{" "}
          <Link href="/login" className="underline">
            {tx("Sign in")}
          </Link>
```

- [ ] **Step 6: Add the two additional keys to rw.json**

In `messages/rw.json`, after the existing `"Already have an account? Sign in"` entry, add:
```json
      "Already have an account?": "Usanzwe ufite konti?",
      "Sign in": "Injira",
```

- [ ] **Step 7: Commit**

```bash
cd /Users/nourumuneza/go/src/waterpermit
git add components/auth/sign-up-form.tsx messages/rw.json
git commit -m "feat(i18n): translate sign-up form"
```

---

### Task 9: Translate `phone-verification.tsx`

**Files:**
- Modify: `components/auth/phone-verification.tsx`

- [ ] **Step 1: Add language imports**

The file already imports `useEffect, useRef, useState`. Add after existing imports:
```tsx
import {
  getPreferredLanguage,
  subscribeToLanguageChanges,
  type AppLanguage,
} from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";
```

- [ ] **Step 2: Add language hook inside `PhoneVerification`**

Find:
```tsx
  const CODE_LEN = 6;
  const [code, setCode] = useState<string[]>(Array.from({ length: CODE_LEN }, () => ""));
```

Add immediately before it:
```tsx
  const [language, setLanguage] = useState<AppLanguage>("en");

  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);

  const tx = (value: string) => translateText(value, language);

```

- [ ] **Step 3: Translate validation in `savePhone`**

Find:
```tsx
      setPhoneEditError("Please enter a phone number.");
```
Replace with:
```tsx
      setPhoneEditError(tx("Please enter a phone number."));
```

Find:
```tsx
      setPhoneEditError("Invalid phone number format. Use 07XXXXXXXX (10 digits).");
```
Replace with:
```tsx
      setPhoneEditError(tx("Invalid phone number format. Use 07XXXXXXXX (10 digits)."));
```

- [ ] **Step 4: Translate the JSX**

Find:
```tsx
          <CardTitle className="text-2xl font-bold text-center">Verify your phone</CardTitle>
          <CardDescription className="text-center">
            We&apos;ve sent a verification code to <span className="font-medium">{maskPhone(phoneNumber)}</span>
```
Replace with:
```tsx
          <CardTitle className="text-2xl font-bold text-center">{tx("Verify your phone")}</CardTitle>
          <CardDescription className="text-center">
            {tx("We've sent a verification code to")} <span className="font-medium">{maskPhone(phoneNumber)}</span>
```

Find:
```tsx
                  <button
                  type="button"
                  className="text-primary hover:underline font-medium"
                  onClick={() => {
                    setPhoneEditError("");
                    setIsEditingPhone(true);
                  }}
                  disabled={isLoading || isUpdatingPhone}
                >
                  Edit
                </button>
```
Replace with:
```tsx
                  <button
                  type="button"
                  className="text-primary hover:underline font-medium"
                  onClick={() => {
                    setPhoneEditError("");
                    setIsEditingPhone(true);
                  }}
                  disabled={isLoading || isUpdatingPhone}
                >
                  {tx("Edit")}
                </button>
```

Find:
```tsx
              <Label htmlFor="phoneEdit">Phone number</Label>
```
Replace with:
```tsx
              <Label htmlFor="phoneEdit">{tx("Phone number")}</Label>
```

Find:
```tsx
                  {isUpdatingPhone ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sending...
                    </span>
                  ) : (
                    "Save & Send Code"
                  )}
```
Replace with:
```tsx
                  {isUpdatingPhone ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {tx("Sending...")}
                    </span>
                  ) : (
                    tx("Save & Send Code")
                  )}
```

Find:
```tsx
                  Cancel
```
Replace with:
```tsx
                  {tx("Cancel")}
```

Find:
```tsx
              <Label htmlFor="code">Enter 6-digit code</Label>
```
Replace with:
```tsx
              <Label htmlFor="code">{tx("Enter 6-digit code")}</Label>
```

Find:
```tsx
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verifying...
                </span>
              ) : (
                "Verify Phone"
              )}
```
Replace with:
```tsx
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {tx("Verifying...")}
                </span>
              ) : (
                tx("Verify Phone")
              )}
```

Find:
```tsx
              Change phone number
```
Replace with:
```tsx
              {tx("Change phone number")}
```

Find:
```tsx
            Didn&apos;t receive the code?{" "}
            <button
              ...
            >
              {isResending ? "Resending..." : countdown > 0 ? `Resend in ${countdown}s` : "Resend Code"}
            </button>
```
Replace with:
```tsx
            {tx("Didn't receive the code?")}{" "}
            <button
              type="button"
              onClick={resend}
              disabled={countdown > 0 || isResending}
              className={`text-primary hover:underline font-medium ${
                countdown > 0 || isResending ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              {isResending ? tx("Resending...") : countdown > 0 ? `${tx("Resend Code")} (${countdown}s)` : tx("Resend Code")}
            </button>
```

- [ ] **Step 5: Commit**

```bash
cd /Users/nourumuneza/go/src/waterpermit
git add components/auth/phone-verification.tsx
git commit -m "feat(i18n): translate phone verification component"
```

---

### Task 10: Translate `email-verification-step.tsx`

**Files:**
- Modify: `components/auth/email-verification-step.tsx`

- [ ] **Step 1: Add language imports**

The file already imports `useState, useEffect, useRef`. Add after existing imports:
```tsx
import {
  getPreferredLanguage,
  subscribeToLanguageChanges,
  type AppLanguage,
} from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";
```

- [ ] **Step 2: Add language hook inside `EmailVerificationStep`**

Find:
```tsx
  const [verificationCode, setVerificationCode] = useState(["", "", "", "", "", ""]);
```

Add immediately before it:
```tsx
  const [language, setLanguage] = useState<AppLanguage>("en");

  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);

  const tx = (value: string) => translateText(value, language);

```

- [ ] **Step 3: Translate `handleManualVerify` error**

Find:
```tsx
      setError("Please enter all 6 digits");
```
Replace with:
```tsx
      setError(tx("Please enter all 6 digits"));
```

- [ ] **Step 4: Translate the JSX**

Find:
```tsx
          <CardTitle className="text-2xl font-bold text-center">Verify Your Email</CardTitle>
          <CardDescription className="text-center">
            {isSending
              ? "Sending verification code..."
              : `Enter the 6-digit code sent to ${email}`
            }
          </CardDescription>
```
Replace with:
```tsx
          <CardTitle className="text-2xl font-bold text-center">{tx("Verify Your Email")}</CardTitle>
          <CardDescription className="text-center">
            {isSending
              ? tx("Sending verification code...")
              : `${tx("Enter the 6-digit code sent to")} ${email}`
            }
          </CardDescription>
```

Find:
```tsx
              <p className="mt-4 text-lg font-medium text-green-600">Email Verified!</p>
              <p className="text-sm text-muted-foreground">Redirecting to dashboard...</p>
```
Replace with:
```tsx
              <p className="mt-4 text-lg font-medium text-green-600">{tx("Email Verified!")}</p>
              <p className="text-sm text-muted-foreground">{tx("Redirecting to dashboard...")}</p>
```

Find:
```tsx
                  <p className="mt-4 text-muted-foreground">Sending verification code...</p>
```
Replace with:
```tsx
                  <p className="mt-4 text-muted-foreground">{tx("Sending verification code...")}</p>
```

Find:
```tsx
                <Label className="text-center block">Enter verification code</Label>
```
Replace with:
```tsx
                <Label className="text-center block">{tx("Enter verification code")}</Label>
```

Find:
```tsx
                  {isVerifying ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      <Shield className="mr-2 h-4 w-4" />
                      Verify & Create Account
                    </>
                  )}
```
Replace with:
```tsx
                  {isVerifying ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {tx("Verifying...")}
                    </>
                  ) : (
                    <>
                      <Shield className="mr-2 h-4 w-4" />
                      {tx("Verify & Create Account")}
                    </>
                  )}
```

Find:
```tsx
                    {resendCountdown > 0
                      ? `Resend in ${resendCountdown}s`
                      : 'Resend code'
                    }
```
Replace with:
```tsx
                    {resendCountdown > 0
                      ? `${tx("Resend Code")} (${resendCountdown}s)`
                      : tx("Resend Code")
                    }
```

Find:
```tsx
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onBack}
                  disabled={isVerifying || isLoading}
                  className="w-full"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to previous step
                </Button>
```
Replace with:
```tsx
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onBack}
                  disabled={isVerifying || isLoading}
                  className="w-full"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {tx("Back to previous step")}
                </Button>
```

- [ ] **Step 5: Commit**

```bash
cd /Users/nourumuneza/go/src/waterpermit
git add components/auth/email-verification-step.tsx
git commit -m "feat(i18n): translate email verification step"
```

---

### Task 11: Translate `success-confirmation.tsx`

**Files:**
- Modify: `components/auth/success-confirmation.tsx`

- [ ] **Step 1: Add language imports**

The file imports `motion` and `useRouter`. Add:
```tsx
import { useEffect, useState } from "react";
import {
  getPreferredLanguage,
  subscribeToLanguageChanges,
  type AppLanguage,
} from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";
```

- [ ] **Step 2: Add language hook inside `SuccessConfirmation`**

Find:
```tsx
export function SuccessConfirmation({
  email,
  title = "Email Verified!",
  message = "Your account has been successfully created and your email has been verified.",
  redirectUrl = "/dashboard",
  redirectLabel = "Go to Dashboard",
  showPrimaryButton = true,
  showApplyButton = true,
  onComplete
}: SuccessConfirmationProps) {
  const router = useRouter();

  return (
```
Replace with:
```tsx
export function SuccessConfirmation({
  email,
  title = "Email Verified!",
  message = "Your account has been successfully created and your email has been verified.",
  redirectUrl = "/dashboard",
  redirectLabel = "Go to Dashboard",
  showPrimaryButton = true,
  showApplyButton = true,
  onComplete
}: SuccessConfirmationProps) {
  const router = useRouter();
  const [language, setLanguage] = useState<AppLanguage>("en");

  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);

  const tx = (value: string) => translateText(value, language);

  return (
```

- [ ] **Step 3: Translate JSX strings**

Find:
```tsx
            <h3 className="font-medium mb-2">What's next?</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start">
                <span className="mr-2">1.</span>
                <span>Complete your profile and provide additional information</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">2.</span>
                <span>Apply for a new water permit or manage existing ones</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">3.</span>
                <span>Track application status through your dashboard</span>
              </li>
            </ul>
```
Replace with:
```tsx
            <h3 className="font-medium mb-2">{tx("What's next?")}</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start">
                <span className="mr-2">1.</span>
                <span>{tx("Complete your profile and provide additional information")}</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">2.</span>
                <span>{tx("Apply for a new water permit or manage existing ones")}</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">3.</span>
                <span>{tx("Track application status through your dashboard")}</span>
              </li>
            </ul>
```

Find:
```tsx
              <Link href="/dashboard/new-application">
                  Start New Application
                </Link>
```
Replace with:
```tsx
              <Link href="/dashboard/new-application">
                  {tx("Start New Application")}
                </Link>
```

Find:
```tsx
          You can now access all the features of the Rwanda Water Resources Board permit application system.
```
Replace with:
```tsx
          {tx("You can now access all the features of the Rwanda Water Resources Board permit application system.")}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/nourumuneza/go/src/waterpermit
git add components/auth/success-confirmation.tsx
git commit -m "feat(i18n): translate success confirmation component"
```

---

### Task 12: Translate `forgot-password/page.tsx`

**Files:**
- Modify: `app/forgot-password/page.tsx`

- [ ] **Step 1: Add language imports and hook**

The file already imports `useState`. Add after existing imports:
```tsx
import { useEffect } from "react";
import {
  getPreferredLanguage,
  subscribeToLanguageChanges,
  type AppLanguage,
} from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";
```

Add inside `ForgotPasswordPage` function, after `const [isLoading, setIsLoading] = useState(false);`:
```tsx
  const [language, setLanguage] = useState<AppLanguage>("en");

  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);

  const tx = (value: string) => translateText(value, language);
```

- [ ] **Step 2: Translate inline error/success messages in handlers**

Replace each hardcoded `setError()` and `setSuccess()` string:

```tsx
      setError("Please enter your email address.");
```
→ `setError(tx("Please enter your email address."));`

```tsx
        setError(json?.message || "Failed to send reset code. Please try again.");
```
→ `setError(json?.message || tx("Failed to send reset code. Please try again."));`

```tsx
        setError("Failed to send reset code. Please try again.");
```
→ `setError(tx("Failed to send reset code. Please try again."));`

```tsx
      setError("Please enter the code we sent to your email.");
```
→ `setError(tx("Please enter the code we sent to your email."));`

```tsx
        setError(json?.message || "Invalid or expired code. Please try again.");
```
→ `setError(json?.message || tx("Invalid or expired code. Please try again."));`

```tsx
        const token = String(json?.resetToken ?? "").trim();
        if (!token) {
          setError("Server error: missing reset token. Please resend the code and try again.");
```
→ `setError(tx("Server error: missing reset token. Please resend the code and try again."));`

```tsx
        setError("Could not verify code. Please try again.");
```
→ `setError(tx("Could not verify code. Please try again."));`

```tsx
      setSuccess(
        "If an account exists for this email, you'll receive a password reset code shortly. Please check your inbox (and spam)."
      );
```
→
```tsx
      setSuccess(
        tx("If an account exists for this email, you'll receive a password reset code shortly. Please check your inbox (and spam).")
      );
```

```tsx
      setResetToken(token);
      setSuccess("Code verified. Please set your new password.");
```
→ `setSuccess(tx("Code verified. Please set your new password."));`

```tsx
      setError("Your reset session expired. Please verify the code again.");
```
→ `setError(tx("Your reset session expired. Please verify the code again."));`

```tsx
        setError("Please fill in all fields.");
```
→ `setError(tx("Please fill in all fields."));`

```tsx
        setError("Passwords do not match.");
```
→ `setError(tx("Passwords do not match."));`

```tsx
        setError("Password must be at least 6 characters long.");
```
→ `setError(tx("Password must be at least 6 characters long."));`

```tsx
        setError(json?.message || "Could not update password. Please try again.");
```
→ `setError(json?.message || tx("Could not update password. Please try again."));` — note: add `"Could not update password. Please try again.": "Guhindura ijambo ry'ibanga byanze. Nyamuneka ongera ugerageze."` to rw.json.

```tsx
      setSuccess(json?.message || "Password updated successfully! Redirecting to login…");
```
→ keep as-is (json?.message already may be translated server-side; the fallback can remain English for now, or translate it — add `"Password updated successfully! Redirecting to login…": "Ijambo ry'ibanga rihindutse neza! Birimo kuja ku kwinjira…"` to rw.json).

```tsx
      setError("Could not update password. Please try again.");
```
→ `setError(tx("Could not update password. Please try again."));`

In the resend button handler:
```tsx
                        setError(json?.message || "Failed to resend code. Please try again.");
```
→ `setError(json?.message || tx("Failed to send reset code. Please try again."));`

```tsx
                        setSuccess("Code resent. Please check your email.");
```
→ `setSuccess(tx("Code resent. Please check your email."));`

- [ ] **Step 3: Translate the JSX**

Find:
```tsx
            <CardTitle className="text-2xl">Forgot password</CardTitle>
            <CardDescription>
              {step === "request"
                ? "Enter your email and we'll send you a reset code."
                : step === "verify"
                  ? "Enter the code from your email to verify your request."
                  : "Code verified. Choose a new password."}
            </CardDescription>
```
Replace with:
```tsx
            <CardTitle className="text-2xl">{tx("Forgot password")}</CardTitle>
            <CardDescription>
              {step === "request"
                ? tx("Enter your email and we'll send you a reset code.")
                : step === "verify"
                  ? tx("Enter the code from your email to verify your request.")
                  : tx("Code verified. Choose a new password.")}
            </CardDescription>
```

Find:
```tsx
                <Label htmlFor="email">Email</Label>
```
Replace with:
```tsx
                <Label htmlFor="email">{tx("Email")}</Label>
```

Find:
```tsx
                    <Label htmlFor="code">Code</Label>
                    <Input
                      id="code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="6-digit code"
```
Replace with:
```tsx
                    <Label htmlFor="code">{tx("Code")}</Label>
                    <Input
                      id="code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder={tx("6-digit code")}
```

Find:
```tsx
                    <Label htmlFor="password">New Password</Label>
```
Replace with:
```tsx
                    <Label htmlFor="password">{tx("New Password")}</Label>
```

Find the `placeholder="Enter new password"` occurrences:
```tsx
                        placeholder="Enter new password"
```
Replace with (replace_all=true):
```tsx
                        placeholder={tx("Enter new password")}
```

Find:
```tsx
                    <Label htmlFor="confirmPassword">Confirm New Password</Label>
```
Replace with:
```tsx
                    <Label htmlFor="confirmPassword">{tx("Confirm New Password")}</Label>
```

Find:
```tsx
                        placeholder="Confirm new password"
```
Replace with:
```tsx
                        placeholder={tx("Confirm new password")}
```

Find:
```tsx
                {isLoading ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {step === "request" ? "Sending…" : step === "verify" ? "Verifying…" : "Updating…"}
                  </span>
                ) : step === "request" ? "Send reset code" : step === "verify" ? "Verify code" : "Update password"}
```
Replace with:
```tsx
                {isLoading ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {step === "request" ? tx("Sending…") : step === "verify" ? tx("Verifying…") : tx("Updating…")}
                  </span>
                ) : step === "request" ? tx("Send reset code") : step === "verify" ? tx("Verify code") : tx("Update password")}
```

Find:
```tsx
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      setError("");
                      setSuccess("");
                      setStep("request");
                      setCode("");
                      setResetToken("");
                      setPassword("");
                      setConfirmPassword("");
                    }}
                    disabled={isLoading}
                  >
                    Change email
                  </button>
```
Replace `Change email` with `{tx("Change email")}`.

Find:
```tsx
                  <button
                    type="button"
                    className="underline"
                    onClick={async () => {
```
(the resend button) — the button text inside is:
```tsx
                    Resend code
```
Replace with:
```tsx
                    {tx("Send reset code")}
```

Find the bottom links:
```tsx
              <Link href="/login" className="underline">
                Back to login
              </Link>
              <span className="mx-2 text-muted-foreground">·</span>
              <Link href="/register" className="underline">
                Create an account
              </Link>
```
Replace with:
```tsx
              <Link href="/login" className="underline">
                {tx("Back to login")}
              </Link>
              <span className="mx-2 text-muted-foreground">·</span>
              <Link href="/register" className="underline">
                {tx("Create an account")}
              </Link>
```

- [ ] **Step 4: Add missing rw.json keys**

In `messages/rw.json` add (in the literal section):
```json
      "Could not update password. Please try again.": "Guhindura ijambo ry'ibanga byanze. Nyamuneka ongera ugerageze.",
      "Password updated successfully! Redirecting to login…": "Ijambo ry'ibanga rihindutse neza! Birimo kuja ku kwinjira…",
```

- [ ] **Step 5: Commit**

```bash
cd /Users/nourumuneza/go/src/waterpermit
git add app/forgot-password/page.tsx messages/rw.json
git commit -m "feat(i18n): translate forgot password page"
```

---

### Task 13: Translate `reset-password/page.tsx`

**Files:**
- Modify: `app/reset-password/page.tsx`

- [ ] **Step 1: Add language imports inside `ResetPasswordContent`**

The file already imports `useState, useEffect, Suspense`. Add after existing imports in the file:
```tsx
import {
  getPreferredLanguage,
  subscribeToLanguageChanges,
  type AppLanguage,
} from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";
```

- [ ] **Step 2: Add language hook inside `ResetPasswordContent`**

Find:
```tsx
  const [isLoading, setIsLoading] = useState(false);
  const searchParams = useSearchParams();
```

Add after `const [isLoading`:
```tsx
  const [language, setLanguage] = useState<AppLanguage>("en");

  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);

  const tx = (value: string) => translateText(value, language);
```

- [ ] **Step 3: Translate error messages**

Find:
```tsx
      setError('Invalid reset password link. Missing reset token.');
```
Replace with:
```tsx
      setError(tx('Invalid reset password link. Missing reset token.'));
```

Find:
```tsx
      setError("Please fill in all fields");
```
Replace with:
```tsx
      setError(tx("Please fill in all fields"));
```

Find:
```tsx
      setError("Passwords do not match");
```
Replace with:
```tsx
      setError(tx("Passwords do not match"));
```

Find:
```tsx
      setError("Password must be at least 6 characters long");
```
Replace with:
```tsx
      setError(tx("Password must be at least 6 characters long"));
```

Find:
```tsx
        setError(json.message || "Failed to update password");
```
Replace with:
```tsx
        setError(json.message || tx("Failed to update password"));
```

Find:
```tsx
        setSuccess("Password updated successfully! Redirecting to login...");
```
Replace with:
```tsx
        setSuccess(tx("Password updated successfully! Redirecting to login..."));
```

Find:
```tsx
      setError("An unexpected error occurred");
```
Replace with:
```tsx
      setError(tx("An unexpected error occurred"));
```

- [ ] **Step 4: Translate the JSX**

Find:
```tsx
            <CardTitle className="text-2xl">Reset Your Password</CardTitle>
            <CardDescription>
              Enter your new password below
            </CardDescription>
```
Replace with:
```tsx
            <CardTitle className="text-2xl">{tx("Reset Your Password")}</CardTitle>
            <CardDescription>
              {tx("Enter your new password below")}
            </CardDescription>
```

Find:
```tsx
                <Label htmlFor="password">New Password</Label>
```
Replace with:
```tsx
                <Label htmlFor="password">{tx("New Password")}</Label>
```

Find (first `placeholder="Enter new password"`):
```tsx
                    placeholder="Enter new password"
```
Replace with:
```tsx
                    placeholder={tx("Enter new password")}
```

Find:
```tsx
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
```
Replace with:
```tsx
                <Label htmlFor="confirmPassword">{tx("Confirm New Password")}</Label>
```

Find (second placeholder):
```tsx
                    placeholder="Confirm new password"
```
Replace with:
```tsx
                    placeholder={tx("Confirm new password")}
```

Find:
```tsx
                {isLoading ? "Updating Password..." : "Update Password"}
```
Replace with:
```tsx
                {isLoading ? tx("Updating Password...") : tx("Update Password")}
```

Find:
```tsx
                Back to Login
```
Replace with:
```tsx
                {tx("Back to Login")}
```

Also translate the loading fallback in `ResetPasswordLoading`:

Find:
```tsx
        <span>Loading...</span>
```
Replace with — this component doesn't have a `tx` function because it's a simple stateless spinner. The word "Loading..." already exists in rw.json as `"Loading...": "Birimo gutegurwa..."`. Use the `<Tx>` component from the existing pattern:

```tsx
import { Tx } from "@/components/ui/tx";
```

And change:
```tsx
        <span>Loading...</span>
```
to:
```tsx
        <span><Tx>Loading...</Tx></span>
```

- [ ] **Step 5: Commit**

```bash
cd /Users/nourumuneza/go/src/waterpermit
git add app/reset-password/page.tsx
git commit -m "feat(i18n): translate reset password page"
```

---

### Task 14: TypeScript compile check and final verification

- [ ] **Step 1: Run TypeScript compiler check**

```bash
cd /Users/nourumuneza/go/src/waterpermit && npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors. If errors appear, fix them before proceeding.

- [ ] **Step 2: Validate rw.json is still valid JSON**

```bash
cd /Users/nourumuneza/go/src/waterpermit && node -e "JSON.parse(require('fs').readFileSync('messages/rw.json','utf8')); console.log('✅ rw.json valid')"
```

Expected: `✅ rw.json valid`

- [ ] **Step 3: Build the app to confirm no runtime errors**

```bash
cd /Users/nourumuneza/go/src/waterpermit && npm run build 2>&1 | tail -20
```

Expected: build completes without errors.

- [ ] **Step 4: Final commit**

```bash
cd /Users/nourumuneza/go/src/waterpermit
git add -A
git commit -m "feat(i18n): complete Kinyarwanda translation for all applicant-facing pages"
```

---

### Task 15: Translate `profile-management.tsx`

**Files:**
- Modify: `components/profile/profile-management.tsx`

The component has 0 translation calls but rw.json already has many of the required strings for profile pages (lines 195–255). This task wires up the language hook and `tx()` calls for the strings that are hardcoded.

- [ ] **Step 1: Add language imports**

The file already imports `useState`. Add after existing imports:
```tsx
import {
  getPreferredLanguage,
  subscribeToLanguageChanges,
  type AppLanguage,
} from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";
```

- [ ] **Step 2: Add language hook inside `ProfileManagement`**

Find the first `useState` line inside `ProfileManagement` and add the language hook above it:
```tsx
  const [language, setLanguage] = useState<AppLanguage>("en");
  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);
  const tx = (value: string) => translateText(value, language);
```

- [ ] **Step 3: Add missing rw.json entries for profile strings**

In `messages/rw.json` add in the literal section:
```json
      "Profile": "Umwirondoro",
      "Profile Information": "Amakuru y'umwirondoro",
      "Update your personal or company information": "Vugurura amakuru yawe bwite cyangwa ay'ikigo",
      "Edit Profile": "Hindura umwirondoro",
      "Company Name": "Izina ry'ikigo",
      "Company Phone": "Telefoni y'ikigo",
      "Tax ID (TIN)": "Nomero y'Imisoro (TIN)",
      "Company Address": "Aderesi y'ikigo",
      "Address": "Aderesi",
      "Not provided": "Ntibitanzwe",
      "Saving...": "Kubika birimo gutunganywa...",
      "Save Changes": "Bika impinduka",
      "Security Settings": "Igenamiterere ry'umutekano",
      "Manage your password and security preferences": "Gucunga ijambo ry'ibanga n'ibyo ukunda by'umutekano",
      "Profile updated successfully!": "Umwirondoro wawe wahindutse neza!",
      "New passwords do not match": "Amagambo mashya y'ibanga ntahuye",
      "Password updated successfully!": "Ijambo ry'ibanga ryavuguruwe neza!",
      "Phone number cannot be changed": "Nomero ya telefoni ntishobora guhindurwa",
      "Account": "Konti",
```

- [ ] **Step 4: Translate all hardcoded strings in the JSX**

Replace each of the following (use the same `tx()` wrapping pattern as all other tasks):

| Find | Replace with |
|------|-------------|
| `>Profile<` (tab trigger) | `>{tx("Profile")}<` |
| `>Security<` (tab trigger) | `>{tx("Security")}<` |
| `>Account<` (tab trigger) | `>{tx("Account")}<` |
| `>Delegations<` (tab trigger) | `>{tx("Delegations")}<` |
| `<CardTitle>Profile Information</CardTitle>` | `<CardTitle>{tx("Profile Information")}</CardTitle>` |
| `Update your personal or company information` | `{tx("Update your personal or company information")}` |
| `Edit Profile` (button) | `{tx("Edit Profile")}` |
| `>First Name<` (h3 and Label) | `>{tx("First Name")}<` (replace_all) |
| `>Last Name<` (h3 and Label) | `>{tx("Last Name")}<` (replace_all) |
| `>Phone Number<` (h3 and Label) | `>{tx("Phone Number")}<` (replace_all) |
| `>Company Name<` (h3 and Label) | `>{tx("Company Name")}<` (replace_all) |
| `>Company Phone<` (h3 and Label) | `>{tx("Company Phone")}<` (replace_all) |
| `>Tax ID (TIN)<` (h3) | `>{tx("Tax ID (TIN)")}<` |
| `>Company Address<` (h3 and Label) | `>{tx("Company Address")}<` (replace_all) |
| `>Address<` (h3 and Label) | `>{tx("Address")}<` (replace_all) |
| `"Not provided"` (fallback string only, not the key) | `tx("Not provided")` (replace_all on the 6 fallback occurrences) |
| `placeholder="Phone number cannot be changed"` | `placeholder={tx("Phone number cannot be changed")}` (replace_all) |
| `Saving...` (button text) | `{tx("Saving...")}` |
| `Save Changes` | `{tx("Save Changes")}` |
| `>Cancel<` (button) | `>{tx("Cancel")}<` |
| `<CardTitle>Security Settings</CardTitle>` | `<CardTitle>{tx("Security Settings")}</CardTitle>` |
| `Manage your password and security preferences` | `{tx("Manage your password and security preferences")}` |

Also translate error/success message setters:
```tsx
setSuccess("Profile updated successfully!");
```
→ `setSuccess(tx("Profile updated successfully!"));`

```tsx
setError("New passwords do not match");
```
→ `setError(tx("New passwords do not match"));`

```tsx
setError("Password must be at least 6 characters long");
```
→ `setError(tx("Password must be at least 6 characters long"));`

```tsx
setSuccess("Password updated successfully!");
```
→ `setSuccess(tx("Password updated successfully!"));`

```tsx
setError("An unexpected error occurred");
```
→ `setError(tx("An unexpected error occurred"));` (both occurrences)

- [ ] **Step 5: Commit**

```bash
cd /Users/nourumuneza/go/src/waterpermit
git add components/profile/profile-management.tsx messages/rw.json
git commit -m "feat(i18n): translate profile management component"
```

---

### Task 16: Audit and complete permit view page translations

**Files:**
- Modify: `app/permit/view/[...permitNumber]/page.tsx`

This page already has 22 `translateText` / `getPreferredLanguage` calls, so partial translations exist. This task identifies and fills the gaps.

- [ ] **Step 1: Find all untranslated strings**

```bash
grep -n '"[A-Z][a-zA-Z ]*"' app/permit/view/\[...permitNumber\]/page.tsx | grep -v "translateText\|tx(" | head -40
```

Review the output. Any string in quotes that is a user-visible label but NOT wrapped in a `tx()` call needs to be translated.

- [ ] **Step 2: For each gap found, add the translation key to rw.json and wrap with `tx()`**

Follow the same pattern as all other tasks: add the English key → Kinyarwanda value pair in `messages/rw.json` literal section, then wrap the string in `tx()` in the component. No partial translations.

- [ ] **Step 3: Commit**

```bash
cd /Users/nourumuneza/go/src/waterpermit
git add app/permit/view/\[...permitNumber\]/page.tsx messages/rw.json
git commit -m "feat(i18n): complete permit view page translations"
```
