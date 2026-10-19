import { readdirSync, readFileSync } from 'node:fs'
import { resolve, relative, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Issue #4 explicitly permits this loader. Do not allow arbitrary platform URLs.
export const approvedLoader = 'https://api.freeappstore.online/v1/analytics.js?app=flatbed'

export function violations(text, html = false) {
  const problems = []
  const forbidden = /google-analytics|googletagmanager|\bgtag\s*\(|\b(?:amplitude|mixpanel|hotjar|plausible|posthog|sentry|clarity)\b|(?:cdn|api)\.segment\.(?:com|io)|["'](?:@segment\/[^"']+|analytics-node|@vercel\/analytics)["']|\bsendBeacon\s*\(/i
  // Comments and privacy disclosures are not integrations; scan HTML scripts separately.
  const executable = html
    ? [...text.matchAll(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi)].map(([script]) => script).join('\n')
    : text
  if (forbidden.test(executable)) problems.push('third-party tracking or telemetry signature')
  if (html) {
    for (const match of executable.matchAll(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
      const src = match[1] ?? match[2] ?? match[3]
      if (/^(?:https?:)?\/\//i.test(src) && src !== approvedLoader) {
        problems.push(`unapproved external script: ${src}`)
      }
    }
  }
  return problems
}

export function checkTracking(root) {
  const failures = []
  function scan(path) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const file = resolve(path, entry.name)
      if (entry.isDirectory()) scan(file)
      else if (/\.(?:[cm]?[jt]sx?|html|json|css)$/i.test(extname(file)) && !/\.(?:test|spec)\.[jt]sx?$/.test(file)) {
        for (const problem of violations(readFileSync(file, 'utf8'), extname(file) === '.html')) {
          failures.push(`${relative(root, file)}: ${problem}`)
        }
      }
    }
  }
  scan(resolve(root, 'web/src'))
  scan(resolve(root, 'web/public'))
  for (const name of ['web/index.html', 'package.json', 'web/package.json']) {
    for (const problem of violations(readFileSync(resolve(root, name), 'utf8'), name.endsWith('.html'))) {
      failures.push(`${name}: ${problem}`)
    }
  }
  return failures
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const failures = checkTracking(fileURLToPath(new URL('../', import.meta.url)))
  if (failures.length) {
    console.error(failures.join('\n'))
    process.exitCode = 1
  } else console.log('No third-party tracking found; approved FreeAppStore loader permitted.')
}
