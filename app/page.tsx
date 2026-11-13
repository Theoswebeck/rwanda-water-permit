'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { HeroSection } from '@/components/home/hero-section';
import { ApiAccessSection } from '@/components/home/api-access-section';
import { ContactSection } from '@/components/home/contact-section';
import { WaterDashboardSection } from '@/components/home/water-dashboard-section';
import { useSiteContent } from '@/lib/use-site-content';

export default function Home() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const siteContent = useSiteContent();

  const userManualUrl = siteContent.user_manual_url || '/assets/User_Manual_Guide_Rwanda_Water_Permit_Application_Portal.pdf';
  const guidelinesUrl = siteContent.guidelines_url || '/Water_Use_Permitting_Guidelines.pdf';

  const navLinks = [
    { name: 'Home', href: '#hero' },
    { name: 'Application Process', href: '#application-process' },
    { name: 'Permitted Activities', href: '#features' },
    { name: 'Water Dashboard', href: '#water-dashboard' },
    { name: 'Request API', href: '#api-access' },
    { name: 'User Manual', href: userManualUrl, newTab: true },
    { name: 'Guidelines', href: guidelinesUrl, newTab: true },
    { name: 'Contact', href: '#contact' },
  ];

  const applicationProcessSteps = [
    {
      step: '01',
      icon: 'fa-user-plus',
      color: '#0072bc',
      bg: '#e8f4fc',
      title: 'Create Account & Verify Identity',
      desc: 'Register as an Individual, Company, Cooperative, Organization, or Institution and verify your phone number (SMS OTP) and email address.',
    },
    {
      step: '02',
      icon: 'fa-file-signature',
      color: '#0d9488',
      bg: '#e6f7f5',
      title: 'Complete Application & Upload Documents',
      desc: 'Select your application type (New, Renewal, Modification, or Transfer), choose your permitted water use activity, map your water source coordinates, and upload required supporting documents.',
    },
    {
      step: '03',
      icon: 'fa-credit-card',
      color: '#f59e0b',
      bg: '#fef7e6',
      title: 'Pay Application Fee via IremboPay',
      desc: 'Generate your official IremboPay bill number directly in the system and complete payment via Mobile Money, bank transfer, or IremboPay channels to submit your application.',
    },
    {
      step: '04',
      icon: 'fa-clipboard-check',
      color: '#6366f1',
      bg: '#eef2ff',
      title: 'Verification, Inspection & Technical Assessment',
      desc: 'RWB officers verify your dossier completeness, conduct hydrological and technical assessment (including a field site inspection where required), and perform legal review.',
    },
    {
      step: '05',
      icon: 'fa-handshake',
      color: '#8b5cf6',
      bg: '#f3e8ff',
      title: 'Approval & Accept Terms and Conditions',
      desc: 'Once approved by the Director General, review and digitally accept your Water Use Permit Contract (Terms & Conditions) in your applicant dashboard.',
    },
    {
      step: '06',
      icon: 'fa-certificate',
      color: '#16a34a',
      bg: '#e8f7ec',
      title: 'Get Your Official Water Use Permit',
      desc: 'Download your signed, QR-verifiable Official Water Use Permit and Concession Contract immediately and submit periodic water use compliance reports online.',
    },
  ];

  const activityCategories = [
    { id: 'all', label: 'All Activities (17)' },
    { id: 'agriculture', label: 'Agriculture & Aquaculture' },
    { id: 'water_supply', label: 'Water Supply' },
    { id: 'energy_industry', label: 'Energy, Industry & Mining' },
    { id: 'infrastructure', label: 'Infrastructure & Recreation' },
    { id: 'other', label: 'Other Activities' },
  ];

  const permittedActivities = [
    {
      title: 'Coffee washing',
      category: 'agriculture',
      regime: 'Water Abstraction',
      icon: 'fa-coffee',
      color: '#b45309',
      bg: '#fef3c7',
      desc: 'Water abstraction for coffee washing stations, wet-mill processing, and seasonal cherry pulping operations.',
    },
    {
      title: 'Construction of a dam',
      category: 'infrastructure',
      regime: 'Water Concession',
      icon: 'fa-water',
      color: '#0072bc',
      bg: '#e8f4fc',
      desc: 'Impoundment, reservoir creation, weir construction, and hydraulic retention structures across watercourses.',
    },
    {
      title: 'Construction or installation of infrastructure',
      category: 'infrastructure',
      regime: 'Water Abstraction',
      icon: 'fa-hard-hat',
      color: '#475569',
      bg: '#f1f5f9',
      desc: 'Civil works, bridges, intakes, pipelines, and water-related infrastructure installation in or near water bodies.',
    },
    {
      title: 'Electricity generation (Hydropower)',
      category: 'energy_industry',
      regime: 'Water Concession',
      icon: 'fa-bolt',
      color: '#d97706',
      bg: '#fef9c3',
      desc: 'Run-of-river and reservoir hydropower plants harnessing river flow or head for clean electricity generation.',
    },
    {
      title: 'Fish farming in lakes',
      category: 'agriculture',
      regime: 'Water Concession',
      icon: 'fa-fish',
      color: '#0284c7',
      bg: '#e0f2fe',
      desc: 'Commercial cage aquaculture and delineated lake surface concession zones for sustainable fish production.',
    },
    {
      title: 'Fish farming in ponds',
      category: 'agriculture',
      regime: 'Water Abstraction',
      icon: 'fa-water',
      color: '#0d9488',
      bg: '#ccfbf1',
      desc: 'Inland aquaculture ponds, hatcheries, and raceways supplied by surface streams, springs, or groundwater.',
    },
    {
      title: 'Gas Extraction',
      category: 'energy_industry',
      regime: 'Water Concession',
      icon: 'fa-fire-flame-simple',
      color: '#dc2626',
      bg: '#fee2e2',
      desc: 'Methane and dissolved gas extraction concessions and associated process water management on Lake Kivu.',
    },
    {
      title: 'Industry',
      category: 'energy_industry',
      regime: 'Water Abstraction',
      icon: 'fa-industry',
      color: '#7c3aed',
      bg: '#f3e8ff',
      desc: 'Manufacturing, agro-processing, beverage production, cooling systems, and commercial industrial water use.',
    },
    {
      title: 'Irrigation',
      category: 'agriculture',
      regime: 'Water Abstraction',
      icon: 'fa-seedling',
      color: '#16a34a',
      bg: '#dcfce7',
      desc: 'Smallholder and commercial crop irrigation schemes drawing from rivers, lakes, marshes, or boreholes.',
    },
    {
      title: 'Livestock',
      category: 'agriculture',
      regime: 'Water Abstraction',
      icon: 'fa-cow',
      color: '#65a30d',
      bg: '#ecfccb',
      desc: 'Water supply for commercial livestock farms, cattle watering troughs, ranching, and dairy operations.',
    },
    {
      title: 'Mining',
      category: 'energy_industry',
      regime: 'Water Abstraction',
      icon: 'fa-gem',
      color: '#4f46e5',
      bg: '#e0e7ff',
      desc: 'Mineral washing, ore processing, quarry dust suppression, and regulated mining water abstraction.',
    },
    {
      title: 'Port Construction',
      category: 'infrastructure',
      regime: 'Water Concession',
      icon: 'fa-anchor',
      color: '#0369a1',
      bg: '#e0f2fe',
      desc: 'Construction and operation of lake ports, jetties, piers, landing sites, and maritime transport terminals.',
    },
    {
      title: 'Recreational activities',
      category: 'infrastructure',
      regime: 'Water Abstraction',
      icon: 'fa-umbrella-beach',
      color: '#0891b2',
      bg: '#cffafe',
      desc: 'Eco-tourism, waterfront hospitality, water sports facilities, and recreational water body developments.',
    },
    {
      title: 'Water supply',
      category: 'water_supply',
      regime: 'Water Abstraction',
      icon: 'fa-faucet-drip',
      color: '#0072bc',
      bg: '#e8f4fc',
      desc: 'Potable water treatment, community water supply systems, institutional supply, and private piped networks.',
    },
    {
      title: 'District Water Supply',
      category: 'water_supply',
      regime: 'Water Abstraction',
      icon: 'fa-network-wired',
      color: '#1d4ed8',
      bg: '#dbeafe',
      desc: 'Multi-network district-wide rural and urban bulk water supply systems operated across administrative sectors.',
    },
    {
      title: 'Other water abstraction activities (specify)',
      category: 'other',
      regime: 'Water Abstraction',
      icon: 'fa-droplet',
      color: '#0f766e',
      bg: '#ccfbf1',
      desc: 'Specialized surface or groundwater abstraction activities not listed above (applicant specifies activity details).',
    },
    {
      title: 'Other water concession activities (specify)',
      category: 'other',
      regime: 'Water Concession',
      icon: 'fa-file-contract',
      color: '#6d28d9',
      bg: '#ede9fe',
      desc: 'Specialized water body concession or surface occupation activities not listed above (applicant specifies details).',
    },
  ];

  const visibleActivities =
    activeCategory === 'all'
      ? permittedActivities
      : permittedActivities.filter((item) => item.category === activeCategory);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-white font-sans">
      {/* ── STICKY NAV ── */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled ? 'bg-white shadow-md py-2.5' : 'bg-transparent py-4'
        }`}
      >
        <div className="w-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          {/* Logo icon only */}
          <Link href="/" className="flex items-center">
            {/* Scrolled: natural colors on white navbar */}
            <Image
              src="/images/favicon_new.png"
              alt="RWB"
              width={64}
              height={64}
              className={`h-12 sm:h-14 w-auto object-contain transition-all duration-300 ${
                scrolled ? 'block' : 'hidden'
              }`}
              priority
            />
            {/* Not scrolled: white icon on dark hero */}
            <Image
              src="/images/favicon_new.png"
              alt="RWB"
              width={64}
              height={64}
              className={`h-12 sm:h-14 w-auto object-contain brightness-0 invert transition-all duration-300 ${
                scrolled ? 'hidden' : 'block'
              }`}
              priority
            />
          </Link>

          {/* Desktop Links */}
          <div className="hidden lg:flex flex-1 items-center justify-center gap-4 xl:gap-6 mx-4">
            {navLinks.map((item) => (
              <a
                key={item.name}
                href={item.href}
                {...(item.newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className={`text-xs xl:text-sm font-semibold transition-colors hover:text-[#0072bc] whitespace-nowrap ${
                  scrolled ? 'text-gray-700' : 'text-white'
                }`}
              >
                {item.name}
              </a>
            ))}
          </div>

          {/* CTA */}
          <div className="hidden lg:flex items-center gap-2.5 xl:gap-3 shrink-0">
            <Link
              href="/login"
              className={`px-3.5 xl:px-5 py-2 rounded-lg text-xs xl:text-sm font-bold border-2 transition-all whitespace-nowrap ${
                scrolled
                  ? 'border-[#0072bc] text-[#0072bc] hover:bg-[#0072bc] hover:text-white'
                  : 'border-white text-white hover:bg-white hover:text-[#0072bc]'
              }`}
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className={`px-3.5 xl:px-5 py-2 rounded-lg text-xs xl:text-sm font-bold shadow-md transition-all whitespace-nowrap ${
                scrolled
                  ? 'bg-[#0072bc] text-white hover:bg-[#005a96]'
                  : 'bg-white text-[#0072bc] hover:bg-blue-50'
              }`}
            >
              Register
            </Link>
          </div>

          {/* Mobile Hamburger */}
          <button
            type="button"
            className={`lg:hidden flex flex-col justify-center items-center w-10 h-10 rounded-lg gap-1.5 transition-colors ${
              scrolled ? 'bg-gray-100 hover:bg-gray-200' : 'bg-white/20 hover:bg-white/30'
            }`}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? (
              /* X icon */
              <svg xmlns="http://www.w3.org/2000/svg" className={`w-5 h-5 ${scrolled ? 'text-[#0072bc]' : 'text-white'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              /* Hamburger icon — three bars */
              <>
                <span className={`block w-5 h-0.5 rounded-full ${scrolled ? 'bg-[#0072bc]' : 'bg-white'}`} />
                <span className={`block w-5 h-0.5 rounded-full ${scrolled ? 'bg-[#0072bc]' : 'bg-white'}`} />
                <span className={`block w-5 h-0.5 rounded-full ${scrolled ? 'bg-[#0072bc]' : 'bg-white'}`} />
              </>
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-white shadow-2xl border-t border-gray-100">
            <div className="px-5 py-5 flex flex-col gap-1">
              {navLinks.map((item) => (
                <a
                  key={item.name}
                  href={item.href}
                  {...(item.newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  className="flex items-center text-sm font-semibold text-gray-700 hover:text-[#0072bc] hover:bg-blue-50 rounded-lg px-3 py-3 transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.name}
                  {item.newTab && (
                    <svg xmlns="http://www.w3.org/2000/svg" className="ml-1.5 w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  )}
                </a>
              ))}
              <div className="flex gap-3 pt-4 mt-2 border-t border-gray-100">
                <Link
                  href="/login"
                  className="flex-1 text-center px-4 py-3 border-2 border-[#0072bc] text-[#0072bc] rounded-xl text-sm font-bold hover:bg-blue-50 transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Sign In
                </Link>
                <Link
                  href="/register"
                  className="flex-1 text-center px-4 py-3 bg-[#0072bc] text-white rounded-xl text-sm font-bold hover:bg-[#005a96] transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Register
                </Link>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* ── HERO SECTION ── */}
      <HeroSection />

      {/* ── APPLICATION PROCESS SECTION ── */}
      <section id="application-process" className="py-20 bg-[#f3f5fa]">
        <div className="max-w-7xl mx-auto px-4 sm:px-8">
          <div className="text-center mb-14">
            <span className="inline-block px-3.5 py-1 rounded-full bg-[#0072bc]/10 text-[#0072bc] text-xs font-extrabold uppercase tracking-widest">
              Step-by-Step Guide
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mt-3">
              Water Use Permit Application Process
            </h2>
            <p className="text-gray-600 mt-3 max-w-2xl mx-auto text-sm sm:text-base">
              Follow these six clear steps—from creating your account to receiving your official QR-verifiable Water Use Permit.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {applicationProcessSteps.map((item, idx) => (
              <div
                key={item.step}
                className="relative bg-white rounded-2xl p-6 sm:p-7 border border-gray-100 shadow-xs hover:shadow-lg transition-all hover:-translate-y-1 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-5">
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-xs"
                      style={{ backgroundColor: item.bg }}
                    >
                      <i className={`fa ${item.icon} text-2xl`} style={{ color: item.color }} />
                    </div>
                    <span className="text-xs font-extrabold uppercase tracking-wider px-3 py-1 rounded-full bg-slate-100 text-slate-700">
                      Step {item.step}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2.5">
                    {item.title}
                  </h3>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    {item.desc}
                  </p>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-[#0072bc]">
                  <span>
                    {idx === 0
                      ? 'Start here'
                      : idx === applicationProcessSteps.length - 1
                      ? 'Final Permit Issuance'
                      : `Proceeds to Step 0${idx + 2}`}
                  </span>
                  <i className="fa fa-arrow-right text-[11px]" />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-12 text-center">
            <Link
              href="/register"
              className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl bg-[#0072bc] text-white font-bold text-sm shadow-md hover:bg-[#005a96] transition-all"
            >
              <span>Create Account to Start Application</span>
              <i className="fa fa-arrow-right text-xs" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── PERMITTED ACTIVITIES SECTION ── */}
      <section id="features" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-8">
          <div className="text-center mb-10">
            <span className="inline-block px-3.5 py-1 rounded-full bg-[#0072bc]/10 text-[#0072bc] text-xs font-extrabold uppercase tracking-widest">
              Permitted Activities
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mt-3">
              Regulated Water Use &amp; Concession Activities
            </h2>
            <p className="text-gray-600 mt-3 max-w-2xl mx-auto text-sm sm:text-base">
              Select the permitted activity that matches your water abstraction, infrastructure, or water body concession project in Rwanda.
            </p>
          </div>

          {/* Intuitive Category Filter Pills */}
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-2.5 mb-10">
            {activityCategories.map((cat) => {
              const active = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-4 py-2 rounded-full text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                    active
                      ? 'bg-[#0072bc] text-white shadow-sm'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 sm:gap-6">
            {visibleActivities.map((feat) => (
              <div
                key={feat.title}
                className="group rounded-2xl p-5 sm:p-6 border border-gray-100 bg-white hover:border-[#0072bc]/30 hover:shadow-lg transition-all hover:-translate-y-1 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-xs group-hover:shadow-md transition-shadow"
                      style={{ backgroundColor: feat.bg }}
                    >
                      <i className={`fa ${feat.icon} text-xl`} style={{ color: feat.color }} />
                    </div>
                    <span
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${
                        feat.regime === 'Water Concession'
                          ? 'bg-amber-50 text-amber-800 border border-amber-200/70'
                          : 'bg-blue-50 text-[#0072bc] border border-blue-200/70'
                      }`}
                    >
                      {feat.regime}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-gray-900 mb-2 leading-snug">
                    {feat.title}
                  </h3>
                  <p className="text-gray-500 text-xs sm:text-sm leading-relaxed">
                    {feat.desc}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-50 flex items-center justify-between">
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0072bc] hover:text-[#005a96] transition-colors"
                  >
                    <span>Apply for this activity</span>
                    <i className="fa fa-arrow-right text-[10px]" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── LIVE WATER USE DASHBOARD SECTION ── */}
      <WaterDashboardSection />

      {/* ── GOVERNMENT API SECTION (Water Permit Data API) ── */}
      <div id="api-access">
        <ApiAccessSection />
      </div>

      {/* ── CONTACT & INQUIRIES SECTION ── */}
      <ContactSection />

      {/* ── INSTITUTIONAL FOOTER ── */}
      <footer id="footer" style={{ background: 'linear-gradient(135deg, #003d6b 0%, #0072bc 100%)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-14">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <Image src="/images/logo_New.png" alt="RWB" width={40} height={40} className="rounded-full border-2 border-white/40" />
                <div className="text-white font-extrabold text-sm uppercase tracking-wide leading-tight">
                  Rwanda Water Resources Board
                </div>
              </div>
              <p className="text-blue-100 text-sm leading-relaxed mb-6">
                Official regulatory authority entrusted with ensuring sustainable water resources management, fair allocation, and protection of natural hydrological basins across the Republic of Rwanda.
              </p>
            </div>

            <div>
              <h3 className="text-white font-bold text-base mb-5">Useful Links</h3>
              <ul className="space-y-3">
                {[
                  { label: 'Ministry of Environment', href: 'https://environment.gov.rw', newTab: true },
                  { label: 'MINEMA', href: 'https://minema.gov.rw', newTab: true },
                  { label: 'REMA', href: 'https://rema.gov.rw', newTab: true },
                  { label: 'User Manual Guide', href: userManualUrl, newTab: true },
                  { label: 'Water Permitting Guidelines', href: guidelinesUrl, newTab: true },
                  { label: 'National Water Use Dashboard', href: '#water-dashboard' },
                ].map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      target={link.newTab || link.href.startsWith('http') ? '_blank' : undefined}
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-blue-100 hover:text-white text-sm transition-colors"
                    >
                      <i className="fa fa-arrow-right text-xs text-blue-300" />
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-white font-bold text-base mb-5">Contact Us</h3>
              <ul className="space-y-4">
                <li className="flex items-start gap-3 text-blue-100 text-sm">
                  <i className="fa fa-map-marker-alt text-blue-300 mt-0.5 w-4 text-center shrink-0" />
                  <span>KN 3 AV Avenue, Nyarugenge Pension Plaza, Sopetrade, Kigali</span>
                </li>
                <li className="flex items-center gap-3 text-blue-100 text-sm">
                  <i className="fa fa-envelope text-blue-300 w-4 text-center shrink-0" />
                  <a href="mailto:info@rwb.rw" className="hover:text-white transition-colors">info@rwb.rw</a>
                </li>
                <li className="flex items-center gap-3 text-blue-100 text-sm">
                  <i className="fa fa-phone-alt text-blue-300 w-4 text-center shrink-0" />
                  <span>Toll Free Line: <strong className="text-white">9977</strong></span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="border-t border-white/20">
          <div className="max-w-7xl mx-auto px-4 sm:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-2">
            <p className="text-blue-200 text-xs">
              &copy; {new Date().getFullYear()} Rwanda Water Resources Board. All rights reserved.
            </p>
            <div className="flex items-center gap-4 text-blue-200 text-xs">
              <Link href="/login" className="hover:text-white transition-colors">Sign In</Link>
              <Link href="/apply" className="hover:text-white transition-colors">Apply for Permit</Link>
              <Link href="/forgot-password" className="hover:text-white transition-colors">Reset Password</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
