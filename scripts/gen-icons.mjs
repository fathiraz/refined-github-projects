import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync } from 'fs'

const svg = readFileSync('public/icon/icon-source.svg', 'utf8')
const sizes = [16, 32, 48, 96, 128]
for (const size of sizes) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } })
  const png = resvg.render().asPng()
  writeFileSync(`public/icon/${size}.png`, png)
  console.log(`✓ icon/${size}.png`)
}
