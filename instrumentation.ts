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

    // IremboPay never delivers webhooks to prod, so pull pending invoice
    // statuses ourselves every 15 min (idempotent; overlapping runs are harmless).
    if (process.env.NODE_ENV === 'production') {
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
