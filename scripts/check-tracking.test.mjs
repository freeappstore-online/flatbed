import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { approvedLoader, violations, checkTracking } from './check-tracking.mjs'

test('allows the approved loader and local scripts', () => {
  assert.deepEqual(violations(`<script src="${approvedLoader}" defer></script><script src="/src/main.tsx"></script>`, true), [])
})

test('does not confuse UI segments or privacy disclosures with trackers', () => {
  assert.deepEqual(violations('const segment = (selected: boolean) => selected'), [])
  assert.deepEqual(violations('Cloudflare Web Analytics (beacon.min.js from static.cloudflareinsights.com)'), [])
})

test('rejects tracker dependencies and calls', () => {
  for (const source of ['{"@segment/analytics-next":"1"}', 'gtag("event")', 'posthog.capture("scan")', 'navigator.sendBeacon("/collect", data)', 'https://cdn.segment.com/analytics.js']) {
    assert.ok(violations(source).length, source)
  }
})

test('rejects external scripts including lookalikes and unknown vendors', () => {
  for (const src of ['https://example.com/collect.js', '//example.com/track.js', `${approvedLoader}&extra=true`, 'https://api.freeappstore.online.evil.test/analytics.js']) {
    assert.ok(violations(`<script src="${src}"></script>`, true).length, src)
  }
  assert.ok(violations('<script>gtag("event")</script>', true).length)
  assert.ok(violations('<script src=//unknown.example/track.js></script>', true).length)
})

test('audits nested source, public assets, HTML, and both dependency manifests', () => {
  const root = mkdtempSync(join(tmpdir(), 'flatbed-tracking-'))
  try {
    mkdirSync(join(root, 'web/src/nested'), { recursive: true })
    mkdirSync(join(root, 'web/public'), { recursive: true })
    writeFileSync(join(root, 'package.json'), '{}')
    writeFileSync(join(root, 'web/package.json'), '{}')
    writeFileSync(join(root, 'web/index.html'), `<script src="${approvedLoader}"></script>`)
    assert.deepEqual(checkTracking(root), [])
    for (const file of ['web/src/nested/tracker.ts', 'web/public/tracker.js', 'web/public/widget.html', 'web/index.html', 'package.json', 'web/package.json']) {
      const html = file.endsWith('.html')
      writeFileSync(join(root, file), html ? '<script src="https://unknown.example/track.js"></script>' : '"@segment/analytics-next"')
      assert.ok(checkTracking(root).some((failure) => failure.includes(file.replaceAll('/', '\\')) || failure.includes(file)), file)
      writeFileSync(join(root, file), html ? '' : '{}')
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
