import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const root = process.cwd()
const outDir = path.join(root, 'docs', 'qa', '2026-01-02')
fs.mkdirSync(outDir, { recursive: true })

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5173/'
const sampleFiles = [
  path.join(root, 'public', 'examples', 'example-psych-eval.txt'),
  path.join(root, 'public', 'examples', 'example-discharge-summary.txt'),
  path.join(root, 'public', 'examples', 'example-biopsychosocial.txt')
]

const settingsSeed = {
  openaiApiKey: 'test-key',
  model: 'gpt-5.2',
  serviceTier: 'standard',
  reasoningEffort: 'medium',
  verbosity: 'medium',
  pdfParser: 'local',
  pdfModel: 'gpt-5.2',
  showOpenQuestions: true,
  privacyMode: 'standard',
  semanticSearch: true,
  dsmBadgeStyle: 'compact'
}

let usageCounter = 0

function extractChunkIds(inputText) {
  const ids = new Set()
  const regex = /\[([A-Za-z0-9_-]+_chunk_\d+)\]/g
  let match
  while ((match = regex.exec(inputText)) !== null) {
    ids.add(match[1])
  }
  return Array.from(ids)
}

function makeSectionText(title) {
  if (/DSM-5 Criteria Analysis/i.test(title)) {
    return `**Major Depressive Disorder (MDD)** (status: meets based on documentation)
A1 Depressed mood [+] — "low mood 3 months"
A2 Anhedonia [+] — "no interest"
A3 Weight/appetite change [+] — "6 lb loss"
A4 Sleep disturbance [+] — "insomnia 4-5 hrs"
A5 Psychomotor [?]
A6 Fatigue [+] — "low energy"
A7 Worthlessness [?]
A8 Concentration [+] — "poor concentration"
A9 Suicidal ideation [+] — "passive SI, no plan"
Threshold: 7/9 required 5+ [MET]
Duration: [MET] — 3 months
Impairment: [?]
Rule-outs: mania [-]; substance [?]; medical [?]
Missing: functional impairment details`
  }
  if (/Substance Use History/i.test(title)) {
    return `Alcohol: onset 18; 1-2 drinks on weekends; last use 1 week ago; DSM-5 criteria: tolerance [?], withdrawal [-], craving [?], loss of control [?], time spent [?], activities given up [?], continued despite problems [?], hazardous use [?], social/role impairment [?]; Alcohol Use Disorder: [?].
Cannabis: onset [?]; occasional use; last use 2 weeks ago; DSM-5 criteria: tolerance [?], withdrawal [?], craving [?], loss of control [?], time spent [?], activities given up [?], continued despite problems [?], hazardous use [?], social/role impairment [?]; Cannabis Use Disorder: [?].
Tobacco: denies; DSM-5 criteria: tolerance [-], withdrawal [-], craving [-], loss of control [-], time spent [-], activities given up [-], continued despite problems [-], hazardous use [-], social/role impairment [-]; Tobacco Use Disorder: [-].`
  }
  if (/Problem List/i.test(title)) {
    return `Disposition: Outpatient; Safety plan: reviewed 11/2024; Follow-up: psychiatry 2 weeks, therapy 1 week.

1. **Major Depressive Disorder, recurrent, moderate, with anxious distress** — Sertraline 100mg daily; weekly CBT.
2. **Generalized Anxiety Disorder** — Continue SSRI; therapy focus on worry management.
3. **Insomnia Disorder, episodic** — Trazodone 50mg PRN; sleep hygiene education.`
  }
  if (/Follow-up & Safety/i.test(title)) {
    return `Safety plan: Reviewed 11/06/2024.
Risk factors: passive SI; job loss; limited support; lives alone.
Protective factors: engaged in treatment; supportive friend; future-oriented.`
  }
  if (/Documentation Note/i.test(title)) {
    return `Reviewed: discharge summary 11/06/2024; psych eval 11/15/2024; biopsychosocial 10/29/2024. No live interview; summary based on records.`
  }
  if (/ID \/ Chief Summary/i.test(title)) {
    return `33-year-old female; DOB 05/14/1991 (she/her).
Presenting for psychiatric evaluation.
Key psychiatric history: MDD; GAD; no prior hospitalizations; no suicide attempts.
Chief summary: ED presentation 11/2024 for worsening depressive symptoms with insomnia and passive SI amid job loss.`
  }
  if (/History of Present Illness/i.test(title)) {
    return `Symptom timeline/course: depressed mood x3 months with anhedonia, insomnia (4-5 hrs/night), decreased appetite, 6 lb weight loss.
Precipitating factors/stressors: job loss with financial strain.
Care episodes: ED 11/02/2024 → inpatient 11/02-11/06/2024; sertraline 50mg and trazodone started. Outpatient eval 11/15/2024; sertraline increased to 100mg.
Safety: passive SI without plan at ED; denies HI.

**Open questions:**
- Any lifetime suicide attempts or self-harm? (Reason: changes chronic risk stratification.)`
  }
  if (/Assessment/i.test(title)) {
    return `Records describe a 3-month depressive syndrome with neurovegetative features and functional impairment. Passive SI at ED without plan; no suicide attempts. PHQ-9 18 indicates moderately severe depression. Stressors include job loss, financial strain, limited supports. Documented diagnoses: MDD recurrent moderate; GAD.`
  }
  if (/Psychiatric History/i.test(title)) {
    return `Onset: first depressive episode age 22.
Course: three major episodes over 10 years, each 3-6 months.`
  }
  if (/Past Psychiatric History/i.test(title)) {
    return `Diagnoses: Major Depressive Disorder, recurrent, moderate, with anxious distress; Generalized Anxiety Disorder; r/o PTSD.
Hospitalizations: 11/02-11/06/2024 for depression with passive SI.
Suicide attempts: none.
Self-harm: denies.
Medication trials: sertraline 50mg → 100mg; trazodone 50mg PRN.
Psychotherapy: CBT group 2 years ago, partial benefit.
ECT/TMS: none.`
  }
  if (/Medical History/i.test(title)) {
    return `PCP: Dr. Smith, Family Medicine.
Conditions: hypothyroidism, migraines.
Surgeries: appendectomy 2015.
Allergies: NKDA.
Non-psych meds: levothyroxine 75mcg daily.
Labs: TSH 2.1; Vit D 18 (low); UDS THC+.`
  }
  if (/Social History/i.test(title)) {
    return `Living: alone in rented apartment.
Support: one close friend; limited contact with parents.
Education: bachelor's degree.
Employment: laid off from marketing position.
Legal: none.
Trauma: emotional abuse in childhood.
Functioning: financial strain; transportation barriers.`
  }
  if (/Barriers/i.test(title)) {
    return `Barriers: transportation, financial strain, limited local supports.
Strengths: motivated for treatment, insight, strong work history.`
  }
  if (/Reason for Visit/i.test(title)) {
    return `Evaluated for worsening depressive symptoms with insomnia and passive SI without plan.`
  }
  if (/Psychometrics/i.test(title)) {
    return `PHQ-9: 18/27 (moderately severe) on 11/15/2024. Elevated items: low interest (3); depressed mood (3); sleep (3); fatigue (2).`
  }
  if (/Psychiatric Review of Systems/i.test(title)) {
    return `Mood: depressed+, anhedonia+; Anxiety: worry+; Psychosis: denies; Safety: SI passive+, plan-; Trauma: emotional abuse+; Substance: alcohol occasional.`
  }
  if (/Family Psychiatric History/i.test(title)) {
    return `Mother: bipolar I. MGM: completed suicide age 55. Father: alcohol use disorder.`
  }
  return `${title}: Summary generated from chart evidence.`
}

function buildMockResponse(body) {
  const instructions = body?.instructions || ''
  const input = typeof body?.input === 'string' ? body.input : JSON.stringify(body?.input || '')

  // PDF parsing fallback
  if (Array.isArray(body?.input)) {
    const pdfPayload = { text: '[Page 1]\nSample PDF extract.', truncated: false }
    return { output_text: JSON.stringify(pdfPayload) }
  }

  const chunkIds = extractChunkIds(input)
  const citations = chunkIds.slice(0, 2).map(id => ({
    chunkId: id,
    excerpt: `Evidence from ${id}`
  }))

  if (instructions.includes('Output JSON: answers')) {
    const ids = []
    const idRegex = /\(([^)]+)\)\s+/g
    let match
    while ((match = idRegex.exec(input)) !== null) {
      ids.push(match[1])
    }
    const answers = (ids.length ? ids : ['q-1']).map((id, idx) => ({
      id,
      text: idx === 0 ? 'No lifetime suicide attempts documented.' : 'Insufficient evidence',
      citations: idx === 0 ? citations : []
    }))
    return { output_text: JSON.stringify({ answers }) }
  }

  if (instructions.includes('Output JSON: issues')) {
    return { output_text: JSON.stringify({ issues: [] }) }
  }

  if (instructions.includes('Chart Q&A')) {
    return { output_text: JSON.stringify({ text: '- Evidence supports the documented history.', citations }) }
  }

  const sectionMatch = input.match(/Section:\s*([^\n]+)/)
  const sectionTitle = sectionMatch ? sectionMatch[1].trim() : 'Section'
  const text = instructions.includes('Clinical editor')
    ? `${makeSectionText(sectionTitle)}\nUpdate: Added follow-up details and clarified plan.`
    : makeSectionText(sectionTitle)

  return { output_text: JSON.stringify({ text, citations }) }
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

await page.addInitScript((seed) => {
  localStorage.clear()
  localStorage.setItem('psych_intake_settings', JSON.stringify(seed))
  localStorage.removeItem('psych_intake_cases')
  localStorage.removeItem('psych_intake_last_case')
}, settingsSeed)

await page.route('https://api.openai.com/v1/responses', async route => {
  const body = route.request().postData() || '{}'
  let payload
  try {
    payload = JSON.parse(body)
  } catch {
    payload = {}
  }
  usageCounter += 1
  const inputTokens = 900 + usageCounter * 7
  const outputTokens = 260 + usageCounter * 3
  const cachedTokens = usageCounter % 2 === 0 ? 240 : 120
  const mock = buildMockResponse(payload)
  const usage = {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: inputTokens + outputTokens,
    input_token_details: {
      cached_tokens: cachedTokens,
      cached_tokens_details: { text_tokens: cachedTokens, audio_tokens: 0, image_tokens: 0 }
    }
  }
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      id: `resp_mock_${usageCounter}`,
      output_text: mock.output_text,
      usage
    })
  })
})

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' })

  const uploadInput = page.locator('input[type="file"][multiple]').first()
  await uploadInput.setInputFiles(sampleFiles)

  await page.waitForFunction(() => {
    const meta = document.querySelector('.document-meta.muted')
    const text = meta?.textContent || ''
    return /files/.test(text) && !/0\s+files/.test(text)
  }, { timeout: 20000 })

  await page.locator('button.generate-btn').click()
  await page.waitForFunction(() => {
    const num = parseInt(document.querySelector('.progress-num')?.textContent || '0', 10)
    const total = parseInt((document.querySelector('.progress-total')?.textContent || '/0').replace('/', ''), 10)
    return total > 0 && num === total
  }, { timeout: 30000 })

  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(outDir, '01-main.png') })

  const dsmSection = page.locator('[data-section-id="dsm5_analysis"]')
  await dsmSection.scrollIntoViewIfNeeded()
  await page.waitForTimeout(200)
  await page.screenshot({ path: path.join(outDir, '02-dsm-analysis.png') })

  const substanceSection = page.locator('[data-section-id="substance_use"]')
  await substanceSection.scrollIntoViewIfNeeded()
  await page.waitForTimeout(200)
  await page.screenshot({ path: path.join(outDir, '03-substance-use.png') })

  const hpiSection = page.locator('[data-section-id="hpi"]')
  await hpiSection.scrollIntoViewIfNeeded()
  await hpiSection.click()
  await hpiSection.locator('button[title="Edit section"]').click()
  await page.waitForSelector('.section-edit-shell')
  await page.screenshot({ path: path.join(outDir, '04-edit-mode.png') })

  await page.getByTitle('Usage').click()
  await page.waitForSelector('.usage-panel')
  await page.screenshot({ path: path.join(outDir, '05-usage-panel.png') })

  await page.getByTitle('Chat').click()
  await page.waitForSelector('.composer-input')
  await page.screenshot({ path: path.join(outDir, '06-chat-panel.png') })

  await page.getByTitle('Updates').click()
  await page.waitForSelector('.followup-panel')
  await page.getByRole('button', { name: 'Load example' }).click()
  await page.waitForFunction(() => {
    return document.querySelectorAll('.edit-card.update-card, .edit-card.answer-card').length > 0
  }, { timeout: 30000 })
  await page.screenshot({ path: path.join(outDir, '07-followup-updates.png') })

  await page.getByTitle('Settings').click()
  await page.waitForSelector('.modal')
  await page.screenshot({ path: path.join(outDir, '08-settings-modal.png') })
  await page.keyboard.press('Escape')

  await page.setViewportSize({ width: 1100, height: 780 })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(200)
  await page.screenshot({ path: path.join(outDir, '09-header-compact.png') })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(200)
  await page.screenshot({ path: path.join(outDir, '10-mobile.png') })
} finally {
  await browser.close()
}

console.log(`QA screenshots saved to ${outDir}`)
