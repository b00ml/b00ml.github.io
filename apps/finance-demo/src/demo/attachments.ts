import { invoices } from './fixtures'

// SVG facsimiles, created from synthetic records. No QR codes or valid fiscal credentials.
const escapeXml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!
  )
export function attachmentUrl(id: string | null): string | null {
  const inv = invoices.find((i) => i.attachmentId === id && id)
  if (!inv) return null
  const rows = [
    `发票代码：${inv.invoiceCode}`,
    `发票号码：${inv.invoiceNo}`,
    `日期：${inv.issuedOn}`,
    `购方：${inv.buyerName}`,
    `购方税号：${inv.buyerTaxNo}`,
    `销方：${inv.sellerName}`,
    `项目：${inv.category}`,
    `金额：¥ ${(inv.totalFen / 100).toFixed(2)}`,
    `税率：${inv.taxRate * 100}%`
  ]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="640" viewBox="0 0 900 640">
    <rect width="900" height="640" fill="#fffdf8"/><rect x="24" y="24" width="852" height="592" fill="none" stroke="#bb6b55" stroke-width="2"/>
    <g font-family="sans-serif" fill="#783f35"><text x="450" y="78" font-size="32" text-anchor="middle">费用票据 · 合成示意</text>
    <text x="450" y="113" font-size="19" text-anchor="middle">仅用于交互演示 · 不具备报销或税务效力</text>
    ${rows.map((r, n) => `<text x="60" y="${170 + n * 39}" font-size="21">${escapeXml(r)}</text>`).join('')}
    <text x="450" y="585" font-size="22" text-anchor="middle" fill="#bd5046">VIRTUAL DATA / DEMO ONLY</text></g></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
