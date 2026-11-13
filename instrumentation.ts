/**
 * Next.js Instrumentation File
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 * 
 * This file runs once when the server starts.
 * Used to initialize:
 * - Internal keep-alive mechanism (prevents cold starts)
 * - Any other server-side initialization
 */

export async function register() {
  // Only run keep-alive on Node.js runtime (not on edge or during build)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startKeepAlive } = await import('./lib/keep-alive')
    startKeepAlive()

    // Six-month auto-close sweep for incomplete applications (RWB, Sep 2026).
    // In-process scheduler so it runs on both Railway and the on-prem server;
    // every write is idempotent, so overlapping instances are harmless.
    if (process.env.NODE_ENV === 'production') {
      const { runApplicationExpirationSweep } = await import(
        './lib/notifications/application-expiration-sweep'
      )
      const DAY_MS = 24 * 60 * 60 * 1000
      // RWB asked for 01:00 Kigali, daily. Kigali (CAT) is a fixed UTC+2 with
      // no daylight saving, so the offset arithmetic below is exact and does
      // NOT depend on the server's own timezone — which is worth relying on
      // here, because the on-prem host's clock is set to UTC-2 while the app
      // runs with TZ=Africa/Kigali.
      const KIGALI_OFFSET_MS = 2 * 60 * 60 * 1000
      const RUN_AT_HOUR = 1
      const msUntilNextRun = () => {
        const kigaliNow = Date.now() + KIGALI_OFFSET_MS
        const dayStart = Math.floor(kigaliNow / DAY_MS) * DAY_MS
        let next = dayStart + RUN_AT_HOUR * 60 * 60 * 1000
        if (next <= kigaliNow) next += DAY_MS
        return next - kigaliNow
      }
      const sweep = () =>
        runApplicationExpirationSweep(100)
          .then((r) =>
            console.log(
              `⏳ Expiration sweep: ${r.notified} notified, ${r.expired} closed` +
                (r.notifyFailed || r.expireFailed
                  ? ` (${r.notifyFailed} notify fails, ${r.expireFailed} close fails)`
                  : '')
            )
          )
          .catch((err) => console.error('❌ Expiration sweep failed:', err))
      const scheduleNext = () => {
        const delay = msUntilNextRun()
        console.log(`🕐 Next expiration sweep in ${Math.round(delay / 60000)} min (01:00 Africa/Kigali)`)
        setTimeout(() => {
          sweep().finally(scheduleNext)
        }, delay)
      }
      scheduleNext()

      // IremboPay never delivers webhooks to prod, so pull pending invoice
      // statuses ourselves every 15 min (idempotent, like the sweep above).
      const { runPaymentReconcileSweep } = await import('./lib/payments/sync-irembo-payment')
      setInterval(() => {
        runPaymentReconcileSweep()
          .then((r) => r.completed && console.log(`💳 Payment reconcile: ${r.completed} of ${r.checked} pending invoices were paid`))
          .catch((err) => console.error('❌ Payment reconcile sweep failed:', err))
      }, 15 * 60 * 1000)
    }
  }
  
  // Edge runtime - no initialization needed
  if (process.env.NEXT_RUNTIME === 'edge') {
    // Edge runtime doesn't need keep-alive
    return
  }
}
