# SiteFetch

Next.js App Router website archiver with an in-page diagnostic console. Styling uses plain CSS (no Tailwind dependency), so the UI does not depend on Tailwind/PostCSS configuration.

## Features
- Dark responsive dashboard and diagnostic log console.
- Server-side HTTP test showing status, response headers, Cloudflare Ray ID (if present), body size, and HTML title.
- Homepage HTML export plus up to 35 publicly accessible same-origin assets.
- ZIP output with `index.html`, `assets/`, and `README.txt`.
- Basic URL validation and same-origin redirect checks.

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Deploy to GitHub and Vercel
1. Extract this ZIP.
2. Upload the contents of the `sitefetch-fixed` folder to the root of a new GitHub repository (not the parent folder).
3. Import that repository in Vercel and deploy with the default Next.js settings.
4. No environment variables are required.

## Important limits
This is a bounded homepage exporter, not a complete crawler. It does not execute page JavaScript, log into websites, solve CAPTCHAs, bypass WAF/firewalls, or access restricted content. It only downloads resources that are publicly accessible and hosted on the same origin. If the target returns HTTP 403 from Vercel, the target server or its security provider is rejecting the deployment request; a browser-like User-Agent cannot guarantee access. The site owner should configure authorized access or provide an official export/API.

The URL validation blocks common private/local address ranges. As with any public URL-fetching service, deploy behind appropriate rate limits and monitor usage before exposing it broadly.
