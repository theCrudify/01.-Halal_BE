// Demo data. WIPES all tables. Usage: npm run db:seed   (add -- --force when NODE_ENV=production)
import { sql } from 'kysely'
import { db, pool } from './core/database.ts'
import { hashPassword } from './core/auth.ts'
import { migrate, resetSchema } from './migrate.ts'
import { expiryWindows, listFields, listResources, menus, settings } from './seed-config.ts'

if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
  console.error('Refusing to wipe a production database. Re-run with --force if you are sure.')
  process.exit(1)
}

// Deterministic PRNG so every seed gives the same data.
let s = 20261124
const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296)
const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]
const between = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1))
const DAY = 86400000
const dayOffset = (d: number) => new Date(Date.now() + d * DAY).toISOString().slice(0, 10)
// Safety clamp only: walk() start offsets already leave room for every step.
const tsOffset = (d: number, hour = 9) => new Date(Math.min(Date.now() - 3600000, Date.now() + d * DAY + hour * 3600000)).toISOString()

/** Minimal one-page PDF so attachments open in the browser. */
function pdf(title: string, lines: string[]) {
  const esc = (t: string) => t.replace(/[\\()]/g, (m) => '\\' + m).replace(/[^\x20-\x7e]/g, '?')
  const stream = [title, ...lines].map((l, i) => `BT /F1 ${i ? 11 : 16} Tf 56 ${780 - i * 22} Td (${esc(l)}) Tj ET`).join('\n')
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ]
  let out = '%PDF-1.4\n'
  const offsets = objs.map((o, i) => {
    const at = out.length
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
    return at
  })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}

const files: any[] = []
const addFile = (name: string, title: string, lines: string[], by: number | null = null) => {
  const data = pdf(title, lines)
  files.push({ id: files.length + 1, name, mime: 'application/pdf', size: data.length, data, created_by: by, created_at: tsOffset(-400) })
  return files.length
}

async function insertChunks(table: string, rows: any[]) {
  for (let i = 0; i < rows.length; i += 200) await db.insertInto(table).values(rows.slice(i, i + 200)).execute()
}


// ---------------------------------------------------------------- business masters (all options live here)
const M = (rows: (string | number | boolean | string[] | null)[][], cols: string[]): Record<string, any>[] =>
  rows.map((r, i) => ({ id: i + 1, sort_order: (i + 1) * 10, is_active: true, ...Object.fromEntries(cols.map((c, j) => [c, r[j]])) }))

const sites = M([['SKB', 'Sukabumi'], ['KJY', 'Kejayan']], ['code', 'name'])
const plants = M([['1201', 'Enmix', 'SKB'], ['1202', 'Sukabumi', 'SKB'], ['1203', 'Kejayan', 'KJY']], ['code', 'name', 'site_code'])
const categories = M([['BEV', 'Beverage'], ['SUP', 'Supplement'], ['SNB', 'Snack Bar']], ['code', 'name'])
const materialTypes = M([['KRITIS', 'Bahan kritis', true], ['POSITIVE', 'Tidak kritis (positive list)', false]], ['code', 'name', 'requires_certificate'])
const halalBodies = M(
  [
    ['BPJPH', 'BPJPH', false, false],
    ['MUI', 'MUI (terbit sebelum 17 Okt 2019)', true, false],
    ['LHLN', 'Lembaga Halal Luar Negeri (LHLN)', true, true],
  ],
  ['code', 'name', 'requires_expiry', 'requires_registration'],
)
const lph = M([['LPPOM', 'LPPOM MUI'], ['SUCOFINDO', 'Sucofindo'], ['SURVEYOR', 'Surveyor Indonesia'], ['OTHER', 'LPH lainnya']], ['code', 'name'])
const criteria = M(
  [['K1', 'Komitmen dan Tanggung Jawab'], ['K2', 'Bahan'], ['K3', 'Proses Produk Halal'], ['K4', 'Produk'], ['K5', 'Pemantauan dan Evaluasi']],
  ['code', 'name'],
)
const reportTypes = M(
  [['AUDIT_INTERNAL', 'Audit Internal'], ['KAJI_ULANG', 'Kaji Ulang Manajemen'], ['LAPORAN_SJPH', 'Laporan Pelaksanaan SJPH'], ['AUDIT_LPH', 'Audit LPH/BPJPH']],
  ['code', 'name'],
)
const reviewer = ['request.view_all', 'material.manage', 'manual.manage', 'manual.view_all', 'report.manage']
const roles = M(
  [
    ['ADMIN', 'Administrator', ['admin']],
    ['HALAL_TEAM', 'Halal Team', [...reviewer, 'certificate.manage']],
    ['PENYELIA', 'Penyelia Halal', reviewer],
    ['KOORDINATOR', 'Koordinator Penyelia', reviewer],
    ['QA', 'Quality Assurance', ['request.view_all', 'material.manage', 'certificate.manage', 'manual.view_all', 'report.manage']],
    ['USER', 'User departemen', []],
  ],
  ['code', 'name', 'permissions'],
)
const workflow = M(
  [
    ['SUBMITTED', 'Diajukan', 'step', 1, 'HALAL_TEAM', 'blue'],
    ['REVIEW_PENYELIA', 'Review Penyelia Halal', 'step', 2, 'PENYELIA', 'amber'],
    ['REVIEW_KOORDINATOR', 'Review Koordinator Penyelia', 'step', 3, 'KOORDINATOR', 'orange'],
    ['REVIEW_QA', 'Review Quality Assurance', 'step', 4, 'QA', 'violet'],
    ['RELEASE', 'Release', 'release', null, null, 'green'],
    ['REJECTED', 'Ditolak', 'rejected', null, null, 'red'],
  ],
  ['code', 'name', 'kind', 'step_no', 'role_code', 'tone'],
)
const STEPS = workflow.filter((w) => w.kind === 'step').map((w) => ({ step: w.step_no as number, status: w.code as string, role: w.role_code as string }))
const RELEASE = 'RELEASE'
const REJECTED = 'REJECTED'
const roleName = (code: string) => roles.find((r) => r.code === code)!.name as string
const PLANT_SITE: Record<string, string> = Object.fromEntries(plants.map((p) => [p.code, p.site_code]))

// ---------------------------------------------------------------- master data
const departments = [
  ['QA', 'Quality Assurance', 'Quality'],
  ['QC', 'Quality Control', 'Quality'],
  ['HLL', 'Halal Management', 'Quality'],
  ['PUR', 'Purchasing', 'Supply Chain'],
  ['PPIC', 'PPIC', 'Supply Chain'],
  ['LOG', 'Logistic & Warehouse', 'Supply Chain'],
  ['PRD', 'Production', 'Manufacturing'],
  ['TEC', 'Technical & Engineering', 'Manufacturing'],
  ['RND', 'Research & Development', 'R&D'],
  ['HCD', 'Human Capital Development', 'Corporate'],
  ['PD', 'Plant Director', 'Corporate'],
  ['IT', 'Information Technology', 'Corporate'],
].map(([code, name, section], i) => ({ id: i + 1, code, name, section }))
const dept = (code: string) => departments.find((d) => d.code === code)!.id

const PASSWORD = 'Halal@2026'
const hash = hashPassword(PASSWORD)
const users = [
  ['admin', 'Administrator SJH', 'Admin', 'IT', 'All'],
  ['10001', 'Rina Marlina', 'Halal Team', 'HLL', 'Sukabumi'],
  ['10002', 'Dedi Kurniawan', 'Halal Team', 'HLL', 'Sukabumi'],
  ['10003', 'Siti Nurhaliza', 'Penyelia Halal', 'HLL', 'Sukabumi'],
  ['10004', 'Ahmad Fauzi', 'Koordinator Penyelia', 'HLL', 'Sukabumi'],
  ['10005', 'Maya Puspita', 'Quality Assurance', 'QA', 'Sukabumi'],
  ['10006', 'Bayu Pratama', 'User', 'PUR', 'Sukabumi'],
  ['10007', 'Lestari Wulandari', 'User', 'PRD', 'Sukabumi'],
  ['20001', 'Agus Setiawan', 'Halal Team', 'HLL', 'Kejayan'],
  ['20002', 'Nur Aini', 'Penyelia Halal', 'HLL', 'Kejayan'],
  ['20003', 'Hendra Wijaya', 'Koordinator Penyelia', 'HLL', 'Kejayan'],
  ['20004', 'Fitri Handayani', 'Quality Assurance', 'QA', 'Kejayan'],
  ['20005', 'Yoga Saputra', 'User', 'PUR', 'Kejayan'],
  ['20006', 'Dewi Anggraini', 'User', 'RND', 'Kejayan'],
  ['30001', 'Rudi Hartono', 'User', 'HCD', 'All'],
].map(([employee_code, name, roleLabel, d, siteLabel], i) => ({
  id: i + 1,
  employee_code,
  name,
  email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.co.id`,
  password_hash: hash,
  role: { Admin: 'ADMIN', 'Halal Team': 'HALAL_TEAM', 'Penyelia Halal': 'PENYELIA', 'Koordinator Penyelia': 'KOORDINATOR', 'Quality Assurance': 'QA', User: 'USER' }[roleLabel]!,
  department_id: dept(d),
  site: siteLabel === 'All' ? null : siteLabel === 'Sukabumi' ? 'SKB' : 'KJY',
  is_active: true,
}))
const usersBy = (role: string, site: string) => users.filter((u) => u.role === role && (u.site === site || u.site === null))

const countries = [
  ['IDN', 'Indonesia'], ['MYS', 'Malaysia'], ['SGP', 'Singapura'], ['THA', 'Thailand'], ['VNM', 'Vietnam'], ['CHN', 'Tiongkok'],
  ['JPN', 'Jepang'], ['KOR', 'Korea Selatan'], ['IND', 'India'], ['AUS', 'Australia'], ['NZL', 'Selandia Baru'], ['USA', 'Amerika Serikat'],
  ['DEU', 'Jerman'], ['NLD', 'Belanda'], ['FRA', 'Prancis'], ['BEL', 'Belgia'], ['BRA', 'Brasil'], ['ARE', 'Uni Emirat Arab'],
].map(([code, name], i) => ({ id: i + 1, code, name }))
const country = (code: string) => countries.find((c) => c.code === code)!

const suppliers = [
  ['V10001', 'PT Sumber Manis Nusantara', 'IDN'], ['V10002', 'PT Kimia Pangan Sejahtera', 'IDN'], ['V10003', 'PT Aroma Rasa Indonesia', 'IDN'],
  ['V10004', 'PT Mitra Bahan Baku', 'IDN'], ['V10005', 'PT Kemasan Plastik Jaya', 'IDN'], ['V10006', 'PT Nutrisi Prima Sentosa', 'IDN'],
  ['V10007', 'PT Agro Kedelai Lestari', 'IDN'], ['V10008', 'PT Kakao Mas Sulawesi', 'IDN'], ['V10009', 'PT Sawit Olah Mandiri', 'IDN'],
  ['V20001', 'Asia Ingredients Sdn Bhd', 'MYS'], ['V20002', 'Golden Flavour Pte Ltd', 'SGP'], ['V20003', 'Siam Food Additives Co., Ltd', 'THA'],
  ['V20004', 'Shandong Bio-Tech Co., Ltd', 'CHN'], ['V20005', 'Zhejiang Vitamin Industry Co., Ltd', 'CHN'], ['V20006', 'Nippon Fine Chemical Trading', 'JPN'],
  ['V20007', 'Hanil Nutrition Co., Ltd', 'KOR'], ['V20008', 'Indus Herbal Extracts Pvt Ltd', 'IND'], ['V20009', 'Southern Dairy Australia Pty Ltd', 'AUS'],
  ['V20010', 'Kiwi Milk Proteins Ltd', 'NZL'], ['V20011', 'Midwest Grain Processors Inc', 'USA'], ['V20012', 'Rhein Gelatine GmbH', 'DEU'],
  ['V20013', 'Holland Cocoa B.V.', 'NLD'], ['V20014', 'Provence Arômes SAS', 'FRA'], ['V20015', 'Flanders Sugar N.V.', 'BEL'],
].map(([code, name, c], i) => ({ id: i + 1, code, name, country_id: country(c).id }))

const lines = [
  ['SKB-L01', 'Line 1 PET Isotonik', 'Sukabumi'], ['SKB-L02', 'Line 2 PET Isotonik', 'Sukabumi'], ['SKB-L03', 'Line 3 Kaleng', 'Sukabumi'],
  ['SKB-L04', 'Line 4 Serbuk Sachet', 'Sukabumi'], ['ENX-L01', 'Line Tablet Effervescent', 'Sukabumi'], ['ENX-L02', 'Line Kapsul', 'Sukabumi'],
  ['KJY-L01', 'Line 1 PET', 'Kejayan'], ['KJY-L02', 'Line 2 PET Teh', 'Kejayan'], ['KJY-L03', 'Line Snack Bar Kedelai', 'Kejayan'], ['KJY-L04', 'Line Snack Bar Buah', 'Kejayan'],
].map(([code, name], i) => ({ id: i + 1, code, name, plant: code.startsWith('ENX') ? '1201' : code.startsWith('SKB') ? '1202' : '1203' }))

const products = [
  ['FG-B001', 'Minuman Isotonik 350 ml', 'Beverage', 'Sukabumi'], ['FG-B002', 'Minuman Isotonik 500 ml', 'Beverage', 'Sukabumi'],
  ['FG-B003', 'Minuman Isotonik 900 ml', 'Beverage', 'Sukabumi'], ['FG-B004', 'Minuman Isotonik Kaleng 330 ml', 'Beverage', 'Sukabumi'],
  ['FG-B005', 'Minuman Ion Rendah Gula 500 ml', 'Beverage', 'Kejayan'], ['FG-B006', 'Minuman Teh Hijau 350 ml', 'Beverage', 'Kejayan'],
  ['FG-B007', 'Minuman Energi Vitamin 120 ml', 'Beverage', 'Kejayan'], ['FG-S001', 'Tablet Effervescent Vitamin C 1000 mg', 'Supplement', 'Sukabumi'],
  ['FG-S002', 'Kapsul Multivitamin', 'Supplement', 'Sukabumi'], ['FG-S003', 'Serbuk Kolagen Sachet', 'Supplement', 'Sukabumi'],
  ['FG-N001', 'Snack Bar Kedelai Almond', 'Snack Bar', 'Kejayan'], ['FG-N002', 'Snack Bar Kedelai Cokelat', 'Snack Bar', 'Kejayan'],
  ['FG-N003', 'Snack Bar Kedelai Kismis', 'Snack Bar', 'Kejayan'], ['FG-N004', 'Snack Bar Kedelai Matcha', 'Snack Bar', 'Kejayan'],
].map(([code, name, category, site], i) => ({
  id: i + 1,
  code,
  name,
  category: { Beverage: 'BEV', Supplement: 'SUP', 'Snack Bar': 'SNB' }[category]!,
  plant: category === 'Supplement' ? '1201' : site === 'Sukabumi' ? '1202' : '1203',
}))

// ---------------------------------------------------------------- materials
type Cat = 'Beverage' | 'Supplement' | 'Snack Bar' | null
const K = 'KRITIS'
const N = 'POSITIVE'
const CAT: Record<string, string> = { Beverage: 'BEV', Supplement: 'SUP', 'Snack Bar': 'SNB' }
// [description, type, category, plants]
const catalog: [string, string, Cat, string[]][] = [
  ['Gula Pasir Rafinasi', K, 'Beverage', ['1202', '1203']],
  ['Fruktosa Cair (HFS 55)', K, 'Beverage', ['1202', '1203']],
  ['Asam Sitrat Anhidrat', K, 'Beverage', ['1202', '1203']],
  ['Natrium Sitrat Dihidrat', K, 'Beverage', ['1202', '1203']],
  ['Natrium Klorida (Garam Murni)', N, 'Beverage', ['1202', '1203']],
  ['Kalium Klorida', N, 'Beverage', ['1202', '1203']],
  ['Kalsium Laktat', K, 'Beverage', ['1202']],
  ['Magnesium Karbonat', N, 'Beverage', ['1202', '1203']],
  ['Perisa Grapefruit (Flavour)', K, 'Beverage', ['1202', '1203']],
  ['Perisa Lemon (Flavour)', K, 'Beverage', ['1203']],
  ['Perisa Jeruk Mandarin (Flavour)', K, 'Beverage', ['1202']],
  ['Asam Askorbat (Vitamin C)', K, 'Beverage', ['1202', '1203']],
  ['Taurin', K, 'Beverage', ['1203']],
  ['Kafein Anhidrat', K, 'Beverage', ['1203']],
  ['Pemanis Sukralosa', K, 'Beverage', ['1203']],
  ['Pewarna Karamel Kelas I', K, 'Beverage', ['1203']],
  ['Ekstrak Teh Hijau', K, 'Beverage', ['1203']],
  ['Botol PET 500 ml', N, 'Beverage', ['1202', '1203']],
  ['Label Shrink PET-G', N, 'Beverage', ['1202', '1203']],
  ['Kaleng Aluminium 330 ml', K, 'Beverage', ['1202']],
  ['Cangkang Kapsul Gelatin Sapi', K, 'Supplement', ['1201', '1202']],
  ['Cangkang Kapsul HPMC', K, 'Supplement', ['1201']],
  ['Magnesium Stearat', K, 'Supplement', ['1201', '1202']],
  ['Piridoksin HCl (Vitamin B6)', K, 'Supplement', ['1201']],
  ['Sianokobalamin (Vitamin B12)', K, 'Supplement', ['1201']],
  ['Kolekalsiferol (Vitamin D3)', K, 'Supplement', ['1201', '1202']],
  ['Zink Glukonat', K, 'Supplement', ['1201']],
  ['Kolagen Ikan Hidrolisat', K, 'Supplement', ['1202']],
  ['Ekstrak Jahe Merah', K, 'Supplement', ['1201']],
  ['Mikrokristalin Selulosa', K, 'Supplement', ['1201']],
  ['Laktosa Monohidrat', K, 'Supplement', ['1201']],
  ['Silikon Dioksida', N, 'Supplement', ['1201', '1202']],
  ['Natrium Bikarbonat', N, 'Supplement', ['1201']],
  ['Tepung Kedelai Utuh', K, 'Snack Bar', ['1203']],
  ['Kedelai Sangrai', K, 'Snack Bar', ['1203']],
  ['Cokelat Couverture Hitam', K, 'Snack Bar', ['1203']],
  ['Kacang Almond Panggang', K, 'Snack Bar', ['1203']],
  ['Kismis', K, 'Snack Bar', ['1203']],
  ['Mentega (Butter)', K, 'Snack Bar', ['1203']],
  ['Lesitin Kedelai', K, 'Snack Bar', ['1203']],
  ['Sirup Glukosa', K, 'Snack Bar', ['1203']],
  ['Susu Bubuk Skim', K, 'Snack Bar', ['1203']],
  ['Whey Protein Konsentrat 80%', K, 'Snack Bar', ['1203']],
  ['Minyak Sawit Fraksinasi', K, 'Snack Bar', ['1203']],
  ['Garam Dapur Beriodium', N, 'Snack Bar', ['1203']],
  ['Baking Powder Double Acting', K, 'Snack Bar', ['1203']],
  ['Pasta Kurma', K, 'Snack Bar', ['1203']],
  ['Matcha Bubuk', K, 'Snack Bar', ['1203']],
  ['Pelumas Mesin Food Grade H1', K, null, ['1201', '1202', '1203']],
  ['Deterjen CIP Alkali', K, null, ['1202', '1203']],
  ['Enzim Pembersih Membran', K, null, ['1202']],
]

const manufacturers: Record<string, string[]> = {
  IDN: ['PT Industri Gula Nusantara', 'PT Sinar Kimia Utama', 'PT Rasa Prima Flavours', 'PT Kedelai Agro Industri', 'PT Mulia Packaging'],
  MYS: ['Malaysia Bio Ingredients Bhd'], SGP: ['Singapore Flavour House Pte Ltd'], THA: ['Thai Fermentation Industry Co., Ltd'],
  CHN: ['Jiangsu Weikang Biotech', 'Hebei Huaxing Pharmaceutical'], JPN: ['Tokyo Nutrition Chemical K.K.'], KOR: ['Daesang Life Science'],
  IND: ['Gujarat Botanicals Ltd'], AUS: ['Victoria Dairy Ingredients'], NZL: ['Waikato Protein Ltd'], USA: ['Iowa Soy Processing LLC'],
  DEU: ['Bayern Gelatine Werke GmbH'], NLD: ['Zaandam Cocoa Works B.V.'], FRA: ['Grasse Arômes Naturels'], BEL: ['Tienen Sugar Refinery'],
}
const manufacturerRows = Object.entries(manufacturers)
  .flatMap(([cc, names]) => names.map((name) => ({ name, cc })))
  .map((m, i) => ({ id: i + 1, code: `MF-${String(i + 1).padStart(3, '0')}`, name: m.name, country_id: country(m.cc).id }))
const manufacturerId = (name: string) => manufacturerRows.find((m) => m.name === name)!.id
// Default distribution of a released material: Purchasing, PPIC, Production, Quality Control.
const DISTRIBUTION = ['PUR', 'PPIC', 'PRD', 'QC'].map((c) => dept(c))
const distributions: any[] = []
// Foreign halal bodies (LHLN) by country of the manufacturer.
const LHLN_BODY: Record<string, string> = { MYS: 'JAKIM', SGP: 'MUIS', THA: 'CICOT', CHN: 'SHC', JPN: 'JMA', KOR: 'KMF', IND: 'HIC', AUS: 'AFIC', NZL: 'FIANZ', USA: 'IFANCA', DEU: 'HFCE', NLD: 'HFCE', FRA: 'HFCE', BEL: 'HFCE' }

const materials: any[] = []
const requests: any[] = []
const histories: any[] = []
let codeSeq = 100100

for (const [desc, type, category, plants] of catalog) {
  codeSeq += 10
  const material_code = `${category ? 'RM' : 'SP'}-${codeSeq}`
  // 1-3 approved suppliers per material per plant (distinct vendors keep the identity index unique).
  for (const plant of plants) for (let v = 0, n = between(1, 3), base = between(0, suppliers.length - 1); v < n; v++) {
    const supplier = suppliers[(base + v * 7) % suppliers.length]
    const sc = countries.find((c) => c.id === supplier.country_id)!
    const manufacturer = pick(manufacturers[sc.code] ?? manufacturers.IDN)
    const site = PLANT_SITE[plant]
    const kritis = type === K
    const foreign = sc.code !== 'IDN'
    const halal_body = !kritis ? null : foreign ? 'LHLN' : rnd() < 0.8 ? 'BPJPH' : 'MUI'
    const expiresIn = between(-120, 1100)
    const expired_date = !kritis ? null : halal_body === 'BPJPH' && rnd() < 0.75 ? null : dayOffset(expiresIn)
    const prod = products.filter((p) => p.plant === plant && (!category || p.category === CAT[category]))
    const line = lines.filter((l) => l.plant === plant && (category !== 'Snack Bar' || l.name.includes('Snack')) && (category !== 'Beverage' || !l.name.includes('Snack')))
    const id = materials.length + 1
    const certFile = kritis
      ? addFile(`SH-${material_code}-${plant}.pdf`, `Sertifikat Halal - ${desc}`, [`Produsen: ${manufacturer}`, `Negara: ${sc.name}`, `Lembaga: ${halal_body}`, 'Dokumen contoh (seed data)'])
      : null
    const data = {
      plant,
      material_code,
      material_desc: desc,
      category: category ? CAT[category] : null,
      material_type: type,
      supplier_id: supplier.id,
      manufacturer_id: manufacturerId(manufacturer),
      halal_body,
      lph: halal_body === 'BPJPH' ? pick(['LPPOM', 'LPPOM', 'SUCOFINDO', 'SURVEYOR']) : null,
      cert_number: !kritis ? null : halal_body === 'BPJPH' ? `ID${between(31, 35)}${between(110000, 119999)}${between(10000, 99999)}${between(18, 25)}` : halal_body === 'LHLN' ? `${LHLN_BODY[sc.code]}-${between(1000, 9999)}/${between(2021, 2025)}` : `00${between(100000, 999999)}${between(10000, 99999)}`,
      bpjph_reg_number: halal_body === 'LHLN' ? `RSHLN-${between(2023, 2026)}-${between(10000, 99999)}` : null,
      expired_date,
      release_until: expired_date && expiresIn > 30 ? dayOffset(Math.min(expiresIn, between(60, 365))) : kritis ? null : dayOffset(between(180, 720)),
      product_id: prod.length ? pick(prod).id : null,
      line_id: line.length ? pick(line).id : null,
      distributed_to: DISTRIBUTION,
      packaging_file_id: null,
      attachment_file_id: null,
      certificate_file_id: certFile,
    }

    // Scenario: mostly released; some still in the approval pipeline, some rejected, some with an open change.
    const r = rnd()
    const scenario = r < 0.62 ? 'released' : r < 0.74 ? 'changeOpen' : r < 0.9 ? 'newOpen' : 'rejected'
    const start = -between(15, 420)
    const requester = pick(users.filter((u) => u.site === site || u.site === null).filter((u) => ['HALAL_TEAM', 'USER'].includes(u.role)))
    const releasedFlow = scenario === 'released' || scenario === 'changeOpen'

    const { distributed_to, ...columns } = data
    for (const department_id of distributed_to) distributions.push({ material_id: id, department_id })
    materials.push({
      id,
      ...columns,
      status: releasedFlow ? RELEASE : STEPS[0].status,
      is_active: releasedFlow ? rnd() > 0.06 : false,
      note: rnd() < 0.15 ? 'Perlu verifikasi ulang dokumen pendukung saat audit berikutnya' : null,
      created_by: requester.id,
      created_at: tsOffset(start),
      updated_at: tsOffset(start + 8),
    })

    // Walk a request through the steps, recording history.
    const walk = (version: number, type: string, payload: any, startDay: number, upto: number, outcome: 'release' | 'open' | 'rejected') => {
      const reqId = requests.length + 1
      let day = startDay
      const h = (action: string, from: string | null, to: string, u: (typeof users)[number], note: string | null = null, hour = between(8, 16)) =>
        histories.push({ id: histories.length + 1, request_id: reqId, material_id: id, action, from_status: from, to_status: to, user_id: u.id, role: u.role, note, created_at: tsOffset(day, hour) })
      h('Submit', null, STEPS[0].status, requester, type === 'Change' ? 'Pembaruan sertifikat halal dari produsen' : 'Pendaftaran bahan baru', 9)
      let status: string = STEPS[0].status
      let step = 1
      for (let i = 0; i < upto; i++) {
        day += between(1, 4)
        const approver = pick(usersBy(STEPS[i].role, site))
        if (outcome === 'rejected' && i === upto - 1) {
          // Same rule as the API: step 1 rejects to the requester, later steps go one step back.
          const to = i === 0 ? REJECTED : STEPS[i - 1].status
          h('Reject', status, to, approver, pick(['Sertifikat halal sudah kedaluwarsa, mohon lampirkan yang terbaru', 'Nama produsen pada sertifikat tidak sesuai dengan dokumen pembelian', 'Lampiran spesifikasi bahan belum ada']))
          status = to
          step = i === 0 ? 1 : i
          break
        }
        const last = i === STEPS.length - 1
        status = last ? RELEASE : STEPS[i + 1].status
        step = last ? STEPS.length : i + 2
        h(last ? 'Release' : 'Approve', STEPS[i].status, status, approver, rnd() < 0.3 ? 'Dokumen lengkap dan sesuai' : null)
      }
      requests.push({ id: reqId, material_id: id, version, request_type: type, plant, data: JSON.stringify(payload), status, current_step: status === REJECTED ? 1 : step, requested_by: requester.id, created_at: tsOffset(startDay), updated_at: tsOffset(day, 17) })
    }

    if (scenario === 'released') {
      walk(1, 'New', data, start, 4, 'release')
      if (rnd() < 0.3) walk(2, 'Change', data, Math.min(start + between(30, 60), -17), 4, 'release')
    } else if (scenario === 'changeOpen') {
      walk(1, 'New', data, start, 4, 'release')
      const pending = between(0, 3)
      walk(2, 'Change', { ...data, expired_date: data.expired_date && dayOffset(between(400, 1400)), certificate_file_id: certFile }, -between(pending * 4 + 1, pending * 4 + 12), pending, 'open')
      materials[materials.length - 1].status = STEPS[pending].status
    } else if (scenario === 'newOpen') {
      const pending = between(0, 3)
      walk(1, 'New', data, -between(pending * 4 + 1, pending * 4 + 20), pending, 'open')
      materials[materials.length - 1].status = STEPS[pending].status
    } else {
      walk(1, 'New', data, -between(17, 60), rnd() < 0.6 ? 1 : between(2, 4), 'rejected')
      materials[materials.length - 1].status = requests[requests.length - 1].status
    }
  }
}

// ---------------------------------------------------------------- certificates (produk perusahaan)
const certificates: any[] = []
const certificateProducts: any[] = []
const userId = (nik: string) => users.find((u) => u.employee_code === nik)!.id
const certVersions: any[] = []
for (const p of products) {
  const issued = -between(60, 1500)
  const old = issued < -1100 // terbit sebelum rezim tanpa masa berlaku, sertifikat lama 4 tahun
  const body = old ? 'MUI' : 'BPJPH'
  const file_id = addFile(`SH-${p.code}.pdf`, `Sertifikat Halal Produk - ${p.name}`, [`Kategori: ${p.category}`, `Plant: ${p.plant}`, `Penerbit: ${body}`, 'Dokumen contoh (seed data)'])
  const row = {
    id: certificates.length + 1,
    certificate_number: old ? `00${between(1000, 9999)}00${between(100000, 999999)}${between(10, 19)}` : `ID${between(31, 35)}${between(110000, 119999)}${between(10000, 99999)}${between(20, 25)}`,
    scope_note: rnd() < 0.3 ? 'Termasuk varian ukuran kemasan' : null,
    category: p.category,
    site: PLANT_SITE[p.plant],
    halal_body: body,
    lph: old ? null : pick(['LPPOM', 'SUCOFINDO', 'SURVEYOR']),
    fatwa_number: `Ketetapan Halal No. ${between(1000, 9999)}/KF-MUI/${between(2021, 2026)}`,
    issue_date: dayOffset(issued),
    valid_until: old ? dayOffset(issued + 1460) : null,
    version: 1,
    file_id,
    created_by: userId('10001'),
    created_at: tsOffset(issued),
    updated_at: tsOffset(issued),
  }
  if (rnd() < 0.4) {
    certVersions.push({ id: certVersions.length + 1, certificate_id: row.id, version: 1, data: JSON.stringify({ ...row, note: 'Terbitan awal' }), created_by: userId('10001'), created_at: tsOffset(issued) })
    row.version = 2
    row.updated_at = tsOffset(issued + 200)
    certVersions.push({ id: certVersions.length + 1, certificate_id: row.id, version: 2, data: JSON.stringify({ ...row, note: 'Penambahan varian rasa (pengembangan produk)' }), created_by: userId('10003'), created_at: tsOffset(issued + 200) })
  } else {
    certVersions.push({ id: certVersions.length + 1, certificate_id: row.id, version: 1, data: JSON.stringify({ ...row, note: 'Terbitan awal' }), created_by: userId('10001'), created_at: tsOffset(issued) })
  }
  certificates.push(row)
  certificateProducts.push({ certificate_id: row.id, product_id: p.id })
}

// ---------------------------------------------------------------- manual SJPH (5 kriteria)
const manualDocs: [string, string, string, string[]][] = [
  ['Manual Sistem Jaminan Produk Halal', 'Komitmen dan Tanggung Jawab', 'HLL', ['QA', 'QC', 'PUR', 'PPIC', 'LOG', 'PRD', 'TEC', 'RND', 'HCD', 'PD']],
  ['Kebijakan Halal Perusahaan', 'Komitmen dan Tanggung Jawab', 'HLL', ['QA', 'QC', 'PUR', 'PPIC', 'LOG', 'PRD', 'TEC', 'RND', 'HCD', 'PD']],
  ['SK Penetapan Penyelia Halal & Tim Manajemen Halal', 'Komitmen dan Tanggung Jawab', 'HCD', ['HLL', 'QA', 'HCD', 'PD']],
  ['Prosedur Pelatihan dan Edukasi Halal', 'Komitmen dan Tanggung Jawab', 'HCD', ['HLL', 'HCD']],
  ['Prosedur Pembelian Bahan', 'Bahan', 'PUR', ['HLL', 'PUR', 'QA']],
  ['Prosedur Persetujuan Bahan Baru & Perubahan Bahan', 'Bahan', 'HLL', ['HLL', 'PUR', 'RND', 'QA']],
  ['Prosedur Pemeriksaan Kedatangan Bahan', 'Bahan', 'QC', ['HLL', 'QC', 'LOG']],
  ['Daftar Bahan Halal', 'Bahan', 'HLL', ['HLL', 'PUR', 'QC', 'PRD', 'RND']],
  ['Prosedur Formulasi & Pengembangan Produk', 'Proses Produk Halal', 'RND', ['HLL', 'RND', 'QA']],
  ['Prosedur Produksi dan Pencegahan Kontaminasi', 'Proses Produk Halal', 'PRD', ['HLL', 'PRD', 'QA', 'TEC']],
  ['Prosedur Pencucian Fasilitas (Sertu) & CIP', 'Proses Produk Halal', 'TEC', ['HLL', 'PRD', 'TEC']],
  ['Prosedur Penyimpanan & Distribusi', 'Proses Produk Halal', 'LOG', ['HLL', 'LOG', 'PPIC']],
  ['Matriks Bahan vs Produk', 'Produk', 'HLL', ['HLL', 'RND', 'QA']],
  ['Prosedur Ketertelusuran (Traceability)', 'Produk', 'QA', ['HLL', 'QA', 'PPIC', 'LOG']],
  ['Prosedur Penanganan Produk Tidak Memenuhi Kriteria', 'Produk', 'QA', ['HLL', 'QA', 'PRD', 'LOG']],
  ['Prosedur Penggunaan Label Halal', 'Produk', 'RND', ['HLL', 'RND', 'QA']],
  ['Prosedur Audit Internal Halal', 'Pemantauan dan Evaluasi', 'HLL', ['HLL', 'QA', 'PD']],
  ['Prosedur Kaji Ulang Manajemen', 'Pemantauan dan Evaluasi', 'HLL', ['HLL', 'QA', 'PD']],
  ['Prosedur Pelaporan Perubahan ke BPJPH', 'Pemantauan dan Evaluasi', 'HLL', ['HLL', 'QA']],
  ['Formulir Tindakan Perbaikan (CAPA) Halal', 'Pemantauan dan Evaluasi', 'QA', ['HLL', 'QA', 'PRD']],
]
const criteria_code = (name: string) => criteria.find((c) => c.name === name)!.code as string
const manuals: any[] = []
const manualRevs: any[] = []
const manualAccess: any[] = []
manualDocs.forEach(([title, criteriaName, owner, access], i) => {
  const criteria = criteria_code(criteriaName)
  const id = i + 1
  const doc_number = `SJPH-${criteria.slice(1).padStart(2, '0')}-${String(i + 1).padStart(3, '0')}`
  const revs = between(0, 3)
  let day = -between(500, 900)
  let file_id = 0
  for (let rev = 0; rev <= revs; rev++) {
    file_id = addFile(`${doc_number}-Rev${rev}.pdf`, title, [`No. Dokumen: ${doc_number}`, `Revisi: ${rev}`, `Kriteria SJPH: ${criteria}`, 'Dokumen contoh (seed data)'])
    manualRevs.push({ id: manualRevs.length + 1, manual_id: id, revision: rev, file_id, remarks: rev === 0 ? 'Terbitan awal' : pick(['Penyesuaian dengan PP 42/2024', 'Penyesuaian Kriteria SJPH Kepkaban 20/2023', 'Perubahan struktur Tim Manajemen Halal', 'Penambahan lampiran formulir']), created_by: userId('10003'), created_at: tsOffset(day) })
    day += between(60, 200)
  }
  manuals.push({ id, doc_number, title, criteria, department_id: dept(owner), revision: revs, file_id, remarks: null, created_by: userId('10003'), created_at: manualRevs.find((r) => r.manual_id === id).created_at, updated_at: tsOffset(Math.min(day, -1)) })
  for (const a of access) manualAccess.push({ manual_id: id, department_id: dept(a) })
})

// ---------------------------------------------------------------- periodic reports
const reports: any[] = []
const thisYear = new Date().getFullYear()
for (const year of [thisYear - 2, thisYear - 1, thisYear]) {
  for (const plant of ['1202', '1203', '1201']) {
    const site = PLANT_SITE[plant]
    const add = (report_type: string, start: string, end: string, findings: number, summary: string) => {
      const typeName = reportTypes.find((t) => t.code === report_type)!.name as string
      if (start > dayOffset(0)) return // no reports for periods still in the future
      const file_id = addFile(`${report_type}-${plant}-${start}.pdf`, `${typeName} - Plant ${plant}`, [`Periode: ${start} s.d. ${end}`, `Temuan: ${findings}`, 'Dokumen contoh (seed data)'])
      reports.push({
        id: reports.length + 1,
        report_type,
        plant,
        period_start: start,
        period_end: end,
        auditor_name: pick(usersBy('PENYELIA', site)).name,
        auditee_department_id: dept(pick(['PRD', 'PUR', 'LOG', 'QC', 'RND'])),
        findings,
        summary,
        file_id,
        feedback_file_id: null,
        feedback_note: findings ? 'Tindakan perbaikan telah diverifikasi dan ditutup' : null,
        created_by: pick(usersBy('HALAL_TEAM', site)).id,
        created_at: `${end}T10:00:00.000Z`,
        updated_at: `${end}T10:00:00.000Z`,
      })
    }
    add('AUDIT_INTERNAL', `${year}-01-01`, `${year}-06-30`, between(0, 4), 'Audit internal semester I: pemeriksaan bahan, fasilitas, dan ketertelusuran')
    add('AUDIT_INTERNAL', `${year}-07-01`, `${year}-12-31`, between(0, 3), 'Audit internal semester II: pemeriksaan bahan, fasilitas, dan ketertelusuran')
    add('KAJI_ULANG', `${year}-01-01`, `${year}-12-31`, 0, 'Evaluasi efektivitas SJPH tahunan oleh manajemen puncak')
    if (plant !== '1201') add('LAPORAN_SJPH', `${year}-01-01`, `${year}-12-31`, 0, 'Laporan pelaksanaan SJPH tahunan')
  }
}
reports.push({ ...reports[0], id: reports.length + 1, report_type: 'AUDIT_LPH', period_start: `${thisYear - 1}-09-15`, period_end: `${thisYear - 1}-09-16`, auditor_name: 'Auditor Halal LPH LPPOM MUI', findings: 1, summary: 'Audit pembaruan / pengembangan produk oleh LPH', feedback_note: 'Ketidaksesuaian minor telah ditindaklanjuti' })

// ---------------------------------------------------------------- write
// Fresh schema every time, so seed data always matches migrate.ts.
await resetSchema()
await migrate()

const config = { sites, plants, categories, material_types: materialTypes, halal_bodies: halalBodies, lph, sjph_criteria: criteria, report_types: reportTypes, roles, workflow_states: workflow, settings, expiry_windows: expiryWindows, list_resources: listResources, list_fields: listFields, menus }
for (const [t, rows] of Object.entries(config)) await insertChunks(t, rows)

await insertChunks('departments', departments)
await insertChunks('users', users)
await insertChunks('countries', countries)
await insertChunks('suppliers', suppliers)
await insertChunks('manufacturers', manufacturerRows)
await insertChunks('lines', lines)
await insertChunks('products', products)
await insertChunks('files', files)
await insertChunks('materials', materials)
await insertChunks('material_distributions', distributions)
await insertChunks('material_requests', requests)
await insertChunks('approval_histories', histories)
await insertChunks('certificates', certificates)
await insertChunks('certificate_products', certificateProducts)
// certificate search_text includes product names, which exist only now
await sql`update certificates set search_text = null`.execute(db)
await insertChunks('certificate_versions', certVersions)
await insertChunks('manuals', manuals)
await insertChunks('manual_revisions', manualRevs)
await insertChunks('manual_access', manualAccess)
await insertChunks('reports', reports)

// Explicit ids were inserted; move every sequence past them.
for (const t of [...Object.keys(config), 'manufacturers', 'departments', 'users', 'countries', 'suppliers', 'lines', 'products', 'files', 'materials', 'material_requests', 'approval_histories', 'certificates', 'certificate_versions', 'manuals', 'manual_revisions', 'reports'])
  await sql`select setval(pg_get_serial_sequence(${t}, 'id'), coalesce((select max(id) from ${sql.table(t)}), 1))`.execute(db)

console.log(
  `Seeded: ${materials.length} materials, ${requests.length} requests, ${histories.length} history rows, ${certificates.length} certificates, ` +
    `${manuals.length} manuals, ${reports.length} reports, ${users.length} users. Password for all users: ${PASSWORD}`,
)
await pool.end()
