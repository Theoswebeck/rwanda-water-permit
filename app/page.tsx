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
  const siteContent = useSiteContent();

  const userManualUrl = siteContent.user_manual_url || '/assets/User_Manual_Guide_Rwanda_Water_Permit_Application_Portal.pdf';
  const guidelinesUrl = siteContent.guidelines_url || '/Water_Use_Permitting_Guidelines.pdf';

  const navLinks = [
    { name: 'Home', href: '#hero' },
    { name: 'Permitted Activities', href: '#features' },
    { name: 'Water Dashboard', href: '#water-dashboard' },
    { name: 'Request API', href: '#api-access' },
    { name: 'User Manual', href: userManualUrl, newTab: true },
    { name: 'Guidelines', href: guidelinesUrl, newTab: true },
    { name: 'Contact', href: '#contact' },
  ];

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

      {/* ── CORE MODULES / FEATURES ── */}
      <section id="features" className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-8">
          <div className="text-center mb-14">
            <span className="text-[#0072bc] text-sm font-bold uppercase tracking-widest">Permitted Activities</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mt-2">Comprehensive Concession Services</h2>
            <p className="text-gray-500 mt-3 max-w-xl mx-auto">
              Choose the appropriate permit type according to your water abstraction or disposal requirements.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: 'fa-water',
                color: '#0072bc',
                bg: '#e8f4fc',
                title: 'Surface Water Abstraction',
                desc: 'Permits for rivers, lakes, reservoirs, and natural streams for commercial, industrial, or domestic supply.',
              },
              {
                icon: 'fa-arrow-down',
                color: '#28a745',
                bg: '#e8f7ec',
                title: 'Groundwater Exploitation',
                desc: 'Authorisation for deep drilling, borehole construction, aquifers testing, and sustainable groundwater extraction.',
              },
              {
                icon: 'fa-seedling',
                color: '#f5a623',
                bg: '#fef8ec',
                title: 'Agricultural Irrigation',
                desc: 'Large-scale and smallholder scheme water quotas, seasonal water allocation, and drainage management.',
              },
              {
                icon: 'fa-industry',
                color: '#6f42c1',
                bg: '#f3effe',
                title: 'Industrial & Hydro-Power',
                desc: 'Run-of-the-river hydropower concession agreements, mineral washing, industrial cooling, and processing permits.',
              },
              {
                icon: 'fa-filter',
                color: '#dc3545',
                bg: '#fdecea',
                title: 'Effluent & Wastewater Discharge',
                desc: 'Water quality compliance, authorized discharge limits, environmental impact monitoring, and reporting.',
              },
              {
                icon: 'fa-tachometer-alt',
                color: '#17a2b8',
                bg: '#e8f7fa',
                title: 'Meter Self-Reporting',
                desc: 'Direct portal submission of monthly meter reads, automated billing verification, and compliance checks.',
              },
            ].map((feat) => (
              <div
                key={feat.title}
                className="group rounded-2xl p-6 border border-gray-100 hover:shadow-lg transition-all hover:-translate-y-1"
              >
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5 shadow-sm group-hover:shadow-md transition-shadow"
                  style={{ backgroundColor: feat.bg }}
                >
                  <i className={`fa ${feat.icon} text-2xl`} style={{ color: feat.color }} />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{feat.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{feat.desc}</p>
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
