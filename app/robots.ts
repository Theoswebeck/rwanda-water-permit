import type { MetadataRoute } from 'next'

/**
 * The water permit portal is a private government workflow application: every
 * useful page sits behind authentication and there is nothing here that should
 * appear in a search index. Serve a blanket disallow rather than letting
 * crawlers enumerate routes.
 *
 * This is paired with an `X-Robots-Tag: noindex, nofollow` response header in
 * `next.config.ts`, since robots.txt is advisory and only well-behaved crawlers
 * honour it.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        disallow: '/',
      },
    ],
  }
}
