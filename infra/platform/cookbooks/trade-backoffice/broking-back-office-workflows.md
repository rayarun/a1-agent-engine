# Angel Broking Back Office: Workflow Analysis & Agentic Automation Roadmap

**Document Version:** 1.0  
**Date:** 2026-05-28  
**Scope:** All 360+ operations activities across 7 departments  
**Purpose:** Executive & Technical Blueprint for Hybrid Agentic Automation  

---

## EXECUTIVE SUMMARY

### Business Case at a Glance

- **Total Manual Activities:** 360+
- **Current Manual FTE Allocation:** ~65-75 FTE (estimated from bandwidth data)
- **Automatable Percentage:** 65-75% (220-270 activities)
- **Estimated FTE Reduction (Phase 1-3):** 30-40 FTE (40-50%)
- **Annual Cost Savings Potential:** ₹6-8 Cr (at ₹1.5L/FTE + overhead)
- **Error Reduction Potential:** 60-75% for data entry/reconciliation tasks
- **Compliance Risk Mitigation:** 80%+ for regulatory submission timeliness

### Why Agentic Automation?

Traditional automation tools (RPA, workflow engines) struggle with Angel Broking's manual operations because:
- **High decision complexity** — Many activities require judgment: GL account determination, exception handling, compliance validation
- **Frequent policy changes** — Rules update monthly; hardcoded workflows break too easily
- **Exception handling** — 15-20% of activities deviate from happy path (different accounts, edge cases, manual corrections)

**Agentic approach:** LLM-powered agents with human-in-the-loop (HITL) gates handle complexity + maintain compliance:
- Agents analyze data, suggest decisions, explain reasoning
- Humans validate high-risk decisions (approvals, rejections, escalations)
- Hybrid model reduces manual effort by 75%+ while maintaining accuracy & control

### Roadmap Preview

| Phase | Timeline | Focus Workflows | Manual Effort Reduction | Investment |
|---|---|---|---|---|
| **Phase 1: Quick Wins** | 2-3 months | Top 3 (Fund Reconciliation, KYC Mods, Payin) | 30% | ₹1.5-2 Cr |
| **Phase 2: Core Processes** | 3-6 months | Next 7 (Trade Processing, Securities Settlement) | 60% | ₹2-2.5 Cr |
| **Phase 3: Complete Coverage** | 6-12 months | Remaining 15+ workflows | 80%+ | ₹1.5-2 Cr |
| **Total Investment** | 12 months | All departments | **40-50% FTE reduction** | **₹5-6.5 Cr** |

---

## DEPARTMENT BREAKDOWN & IMPACT ANALYSIS

| Department | # Activities | # Manual | # Automatable | Current FTE | Est. Savings (FTE) | Priority | Compliance Risk | Data Volume |
|---|---|---|---|---|---|---|---|---|
| **KYC (Onboarding & Mods)** | 47 | 32 | 24 (75%) | 12-14 | 6-8 | **P0** | HIGH | High (1000s/month) |
| **Banking / Fund Settlement** | 58 | 45 | 32 (71%) | 15-18 | 8-10 | **P0** | CRITICAL | High (10000s/month) |
| **DP / Securities Settlement** | 52 | 38 | 28 (74%) | 12-14 | 7-9 | **P0** | CRITICAL | High (5000s/month) |
| **Trade Execution & Reporting** | 42 | 28 | 18 (64%) | 7-8 | 3-4 | **P1** | HIGH | Very High (100000s/day) |
| **Risk Management** | 38 | 25 | 15 (60%) | 5-6 | 2-3 | **P1** | CRITICAL | Medium |
| **Reconciliation** | 78 | 60 | 45 (75%) | 18-20 | 10-12 | **P0** | CRITICAL | Very High |
| **Sub-Broker & Custody** | 45 | 32 | 22 (69%) | 10-12 | 5-7 | **P1** | MEDIUM | High |
| **Customer Service / Queries** | 15 | 8 | 5 (63%) | 2-3 | 1 | **P2** | MEDIUM | Low |

**Key Insights:**
- **KYC, Banking, Securities, Reconciliation** = 75% of automation opportunity (140+ activities)
- **Reconciliation tasks** = single largest category (78 activities, 60 manual, ₹2-3Cr/year in FTE)
- **Fund Settlement** = highest compliance criticality (10,000+ daily transactions, regulatory TAT pressure)
- **Trade Processing** = highest data volume but lower automation rate (complex business rules)

---

## TOP 10 AUTOMATION OPPORTUNITIES

### Ranked by Impact Score: (Manual Effort [FTE] × Priority Weight) / Complexity Score

#### **1. Fund Reconciliation & Mismatch Resolution** ⭐⭐⭐
- **Current State:** Manual daily/weekly reconciliation of BO, Bank, and Client data
- **Manual Effort:** 12-14 FTE/month (₹1.8-2.1M)
- **Automatable Percentage:** 80% (agent validates mismatches, human approves corrections)
- **Agentic Approach:** 
  - Agent ingests 3 data sources (BO GL, Bank statement, Client ledger)
  - Applies reconciliation rules (matching algorithms, amount tolerance, date ranges)
  - Flags mismatches with root cause analysis (transaction not found, amount variance, date discrepancy)
  - Human reviews and approves corrections before posting
- **Technology Stack:** Agent (Temporal), Tool (APIs: BO DB, Bank Feeds), HITL gate (approval)
- **HITL Gate:** P0 mismatches (amount > ₹1L, regulatory accounts) require human approval
- **Estimated Timeline:** 4-6 weeks
- **Risk Mitigation:** Compliance audit trail (all corrections logged), reconciliation report automation

#### **2. KYC Offline Account Modifications** ⭐⭐⭐
- **Current State:** Manual form processing for address, bank, brokerage, segment changes
- **Manual Effort:** 10-12 FTE/month (₹1.5-1.8M)
- **Automatable Percentage:** 75% (agent validates docs, human approves change)
- **Agentic Approach:**
  - Agent validates KYC document uploads (PAN, Address proof, signatures present?)
  - Extracts data via OCR (or API if digital submission)
  - Compares with existing BO records to detect inconsistencies
  - Prepares change package with before/after comparison
  - Human reviews and approves; triggers backend update
- **Technology Stack:** Agent (Temporal), Tool (OCR API, BO database, Document storage), HITL gate
- **HITL Gate:** All modifications (compliance requirement: human verification of documents)
- **Estimated Timeline:** 5-7 weeks
- **Risk Mitigation:** Full audit trail (who approved, when, document hash)

#### **3. Payin Processing & Batch Generation** ⭐⭐⭐
- **Current State:** Manual validation of client security contributions, batch file generation
- **Manual Effort:** 8-10 FTE/month (₹1.2-1.5M)
- **Automatable Percentage:** 85% (agent validates inputs, generates files)
- **Agentic Approach:**
  - Agent ingests uploaded security payin files (client, RM, FII data)
  - Validates against ISIN master, client holdings, corporate action events
  - Flags mismatches (duplicate ISIN, scrip not in account, quantity mismatch)
  - Generates CDSL-ready batch file format (XML/binary per CDSL spec)
  - Human QA: spot-checks file before upload to exchange
- **Technology Stack:** Agent (Temporal), Tools (ISIN API, Holdings DB, CDSL gateway), HITL gate
- **HITL Gate:** Final batch file approval (prevents bad data reaching exchange)
- **Estimated Timeline:** 4-5 weeks
- **Risk Mitigation:** Pre/post upload reconciliation, CDSL rejection handling

#### **4. JV/REC/PAY Manual Entry & File Upload** ⭐⭐
- **Current State:** Excel-based manual entry of journal vouchers for receipts, payments, inter-segment transfers
- **Manual Effort:** 11-13 FTE/month (₹1.65-1.95M)
- **Automatable Percentage:** 70% (agent constructs JV, human validates GL impact)
- **Agentic Approach:**
  - Agent receives transaction event (fund received from bank, SB payout due, exchange fee)
  - Determines GL account based on transaction type + business rules (e.g., payout to SB → GL 2048 + segment)
  - Constructs JV with debits/credits, validates GL balance impact
  - Human reviews posting logic before submission to BO
- **Technology Stack:** Agent, Tools (GL master, Transaction APIs), HITL gate
- **HITL Gate:** All GL postings > ₹50L or sensitive GL accounts (regulatory, trust funds)
- **Estimated Timeline:** 6-8 weeks
- **Risk Mitigation:** GL reconciliation automaton, audit trail per transaction

#### **5. Contract Note & Margin Statement Generation** ⭐⭐
- **Current State:** Manual extraction of trade data, formatting per client/exchange requirements
- **Manual Effort:** 7-8 FTE/month (₹1-1.2M)
- **Automatable Percentage:** 90% (full automation with spot-check QA)
- **Agentic Approach:**
  - Agent triggers on T+0 / T+1 (trade settlement date)
  - Pulls trade details from MKT BO (scrip, qty, price, brokerage, taxes)
  - Formats per NSE/BSE CN spec + client communication preferences (email, SMS, portal)
  - Generates margin statement (MTF position + margin utilized)
  - Sends via configured channels
- **Technology Stack:** Agent (Temporal), Tools (MKT BO APIs, Mail/SMS gateways), Spot-check (sampling)
- **HITL Gate:** Minimal — only escalate if CN generation fails (edge case handling)
- **Estimated Timeline:** 3-4 weeks
- **Risk Mitigation:** CN audit log (generated, sent, bounced), re-generation on request

#### **6. Corporate Action Event Processing** ⭐⭐
- **Current State:** Manual identification of bonus/split/subdivision events, applying to client holdings
- **Manual Effort:** 6-7 FTE/month (₹0.9-1.05M)
- **Automatable Percentage:** 80% (agent applies rules, human validates edge cases)
- **Agentic Approach:**
  - Agent monitors NSE/BSE corporate action feeds for bonus/split/dividend events
  - For each event, applies rule engine (holdings calculation, ex-date cutoff, tax treatment)
  - Updates client holdings (splits 1:2 → double qty, half price; bonus 1:1 → add qty)
  - Escalates edge cases (holdings locked in pledge, Folio-wise different entitlement)
- **Technology Stack:** Agent, Tools (Exchange feeds, Holdings DB, CA rule engine)
- **HITL Gate:** Edge cases + external communication (dividend reinvestment options)
- **Estimated Timeline:** 5-6 weeks
- **Risk Mitigation:** CA audit log, compliance with NSE/SEBI/BSE CA circulars

#### **7. Stale Cheque & Rejected Payout Handling** ⭐
- **Current State:** Manual investigation of payout rejections, re-initiation with corrected details
- **Manual Effort:** 5-6 FTE/month (₹0.75-0.9M)
- **Automatable Percentage:** 65% (agent analyzes rejection reason, suggests re-submission)
- **Agentic Approach:**
  - Agent receives bank rejection notification (stale cheque, invalid IFSC, mandate expired)
  - Analyzes rejection code against BO client data (cheque date, bank details, mandate status)
  - For common issues (stale cheque age > 6mo → re-issue; IFSC mismatch → validate master), suggests solution
  - For complex cases (mandate status unknown, account closed), escalates to ops team
- **Technology Stack:** Agent, Tools (Bank feed APIs, Client master, Mandate registry), HITL gate
- **HITL Gate:** Escalations + approval for re-issuance (compliance for securities operations)
- **Estimated Timeline:** 4-5 weeks
- **Risk Mitigation:** Payout audit trail, compliance with bank & client communication

#### **8. NRMS Risk Monitoring & Alerts** ⭐
- **Current State:** Manual daily monitoring of NRMS limit utilization, escalation of exceedances
- **Manual Effort:** 4-5 FTE/month (₹0.6-0.75M)
- **Automatable Percentage:** 95% (full automation with escalation triggers)
- **Agentic Approach:**
  - Agent polls NRMS daily (member-wise, scrip-wise OI vs. limits)
  - Compares utilization % against thresholds (80%, 90%, 100%)
  - For threshold breaches, auto-generates alert to RMS team + escalates if > 100%
  - For trending data, prepares daily summary (exposure delta, top scrips, risk score)
- **Technology Stack:** Agent (Temporal scheduler), Tools (NRMS API, Alert distribution), Dashboard (read-only)
- **HITL Gate:** None — full automation (ops team receives alert and decides action)
- **Estimated Timeline:** 2-3 weeks
- **Risk Mitigation:** Alert audit log, integration with RMS override system

#### **9. Offline Sub-Broker Payout & Commission Calculation** ⭐
- **Current State:** Manual calculation of SB monthly payout (commission, charges recovery, GST)
- **Manual Effort:** 4-5 FTE/month (₹0.6-0.75M)
- **Automatable Percentage:** 90% (agent calculates, human verifies total payout)
- **Agentic Approach:**
  - Agent runs month-end process on T+1 after month-end
  - Aggregates SB commissions from trade register (NSE, BSE, FNO, MF segments)
  - Applies segment-wise rates + SB agreement terms (volume discounts, caps)
  - Deducts charges (terminal rental, data feed, SMS charges)
  - Calculates GST (18% on commission, SB-specific relief if applicable)
  - Generates payout advice (total, components, payment method)
- **Technology Stack:** Agent, Tools (Trade register APIs, SB master, Payout gateway)
- **HITL Gate:** Final payout approval (SB Payout team signs off before bank transfer)
- **Estimated Timeline:** 3-4 weeks
- **Risk Mitigation:** SB audit trail, payout history for dispute resolution

#### **10. Regulatory Data Collection & SEBI/Exchange Inspection Response** ⭐
- **Current State:** Manual ad-hoc data gathering in response to regulatory / exchange inspection demands
- **Manual Effort:** 3-4 FTE/month (₹0.45-0.6M)
- **Automatable Percentage:** 70% (agent pre-builds standard reports; humans verify before submission)
- **Agentic Approach:**
  - Agent maintains library of standard regulatory queries (investor complaints, KYC violations, fund flows)
  - On receipt of inspection notice, agent pulls relevant data based on query keywords
  - Cross-validates data consistency (Client ledger BO vs. KRA, holding BO vs. exchange, etc.)
  - Generates report in regulatory format (CSV/XML per SEBI/NSE spec)
  - Human compliance team reviews & signs off
- **Technology Stack:** Agent, Tools (Inspection request parsing, Data aggregation APIs), Compliance review gate
- **HITL Gate:** Final submission approval (legal/compliance responsibility)
- **Estimated Timeline:** 5-7 weeks
- **Risk Mitigation:** Audit trail (who compiled, when, version), regulatory submission log

---

## AGENTIC DESIGN PATTERNS

### Pattern A: Data Validation & Exception Escalation Agent

**Use Cases:** Fund reconciliation, Payin validation, Corporate action processing  
**LLM Role:** Analyze data, identify mismatches, explain discrepancies

**Decision Flow:**
```
┌─────────────────────────────────────────────────────────────────────┐
│ INPUT: Two data sources (Source A: BO GL, Source B: Bank Statement)  │
│ AGENT TASK: Compare and reconcile                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Agent Reasoning:                                                  │
│  1. For each Source B transaction:                                 │
│     - Search Source A for matching transaction (amount, date range)│
│     - If match found: mark as reconciled, note any delays          │
│     - If no match: classify reason (not yet in BO, amount variance,│
│       different date, missing in source B)                         │
│  2. Aggregate results:                                             │
│     - Total matched: ₹X Cr                                         │
│     - Variance: ₹Y (% of total)                                    │
│     - Root causes: [Breakdown]                                     │
│                                                                     │
│  DECISION:                                                         │
│  IF Variance < Threshold (₹1L) → AUTO-APPROVE                     │
│  IF Variance > Threshold → ESCALATE TO HUMAN (HITL Gate)          │
│  IF Root cause = "Timing" → DEFER 1 DAY, RETRY                    │
│  IF Root cause = "Transaction Lost" → ESCALATE (Investigate)      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
HITL Gate: Human validates correction approach before posting GL

Tool Requirements:
- GL Account API (real-time balance query)
- Bank feed ingestion (automated daily download from bank portal)
- Reconciliation engine (matching algorithm, threshold config)
- GL posting API (debit/credit submission)
```

**Error Handling:**
- If bank data unavailable: Defer reconciliation, alert ops team (missing data)
- If GL system down: Queue reconciliation until system ready
- If mismatch reason unclear: Escalate with evidence (both transactions, comparison)

---

### Pattern B: Decision Agent with Business Rules

**Use Cases:** GL account determination (JV posting), KYC verification, Document validation  
**LLM Role:** Apply rules, suggest GL account, explain decision rationale

**Decision Flow:**
```
┌──────────────────────────────────────────────────────────────────────┐
│ INPUT: Transaction event (type, amount, account, date)               │
│ TASK: Determine GL account for posting                               │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Agent Rule Engine:                                                 │
│  IF transaction_type = "Fund Receipt from Bank"                     │
│     AND account_type = "Equity Client"                              │
│     AND amount_cleared = True                                       │
│  THEN GL_Account = 2001 (Client Deposit Credit)                    │
│       Debit: 1000 (Bank), Credit: 2001 (Client Deposit)            │
│                                                                      │
│  IF transaction_type = "SB Payout"                                  │
│     AND payout_method = "Cheque"                                    │
│  THEN GL_Account = 2010 + segment_code (SB Payout by Segment)      │
│       Debit: 2010, Credit: 1200 (Bank)                             │
│                                                                      │
│  IF transaction_type = "Exchange Fee" → GL 4100                    │
│  IF transaction_type = "Dividend Received" → GL 3500               │
│  Else → ESCALATE (unknown transaction type)                         │
│                                                                      │
│  OUTPUT:                                                            │
│  - GL Account: [Account Code]                                      │
│  - Debit/Credit: [Amount]                                          │
│  - Explanation: [Rule applied, business logic]                     │
│  - Risk Level: [Low/Medium/High] (for human review)                │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
HITL Gate: High-risk (>₹50L or sensitive GL) require human approval
```

**Rule Library:** Maintained in config file (editable by ops team, versioned)  
**Audit Trail:** Every decision logged with rule version applied

---

### Pattern C: Approval Agent (HITL Gate Manager)

**Use Cases:** KYC modifications, High-value GL postings, Payout approvals  
**LLM Role:** Prepare approval package, explain decision context, handle rejection

**Decision Flow:**
```
┌────────────────────────────────────────────────────────────────────┐
│ INPUT: Decision requiring human approval (KYC change, GL posting)  │
│ TASK: Route to human, collect approval, execute or reject          │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Agent Actions:                                                   │
│  1. Prepare approval package:                                    │
│     - Current state (before)                                     │
│     - Proposed change (after)                                    │
│     - Risk assessment (compliance, business impact)              │
│     - Supporting evidence (documents, rule applied, etc.)        │
│  2. Assign to appropriate approver (based on amount/type/risk)   │
│     Example: KYC mods → Compliance, GL > ₹50L → Finance CFO      │
│  3. Send approval notification (email + portal)                  │
│  4. WAIT for human response (SLA: 24 hours for P0, 48h for P1)   │
│  5. On approval: EXECUTE (post GL, update BO, send confirmation) │
│     On rejection: LOG reason, ESCALATE (retry or manual review)  │
│                                                                    │
│  Notification Template:                                          │
│  ---                                                             │
│  Subject: Approval Required - [Activity Type] - [Urgency]        │
│  Body:                                                           │
│  - What: [Change description]                                   │
│  - Why: [Agent reasoning]                                       │
│  - Risk: [Compliance/Financial]                                 │
│  - Approve / Reject / Request More Info                         │
│  ---                                                             │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
Timeout: If no response within SLA, escalate to manager
```

**Error Handling:**
- If approver not available: Route to backup approver
- If approval rejected: Log reason, notify agent for correction
- If approval timeout: Escalate for manual intervention

---

### Pattern D: Orchestration Agent (Multi-Step Process Coordinator)

**Use Cases:** Fund settlement end-of-day, Month-end closing procedures, Quarter-end reconciliation  
**LLM Role:** Orchestrate multi-step workflow, retry on failure, coordinate approvals

**Decision Flow:**
```
┌──────────────────────────────────────────────────────────────────────┐
│ INPUT: Fund settlement end-of-day trigger (5 PM daily)               │
│ TASK: Orchestrate 8-step process, manage dependencies, retry logic   │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Workflow Steps:                                                    │
│  1. Payin Reconciliation                                           │
│     - Agent: Validate CDSL file received, contents match BO        │
│     - HITL Gate: None (automated check)                            │
│     - NEXT: If success → Step 2. If fail → Retry (×3), then Escalate│
│                                                                      │
│  2. Payout Validation                                              │
│     - Agent: Verify client cash balance sufficient for payouts     │
│     - HITL Gate: If shortfall detected → Flag to treasurer, defer   │
│     - NEXT: If validated → Step 3. Else → PAUSE (manual recovery)  │
│                                                                      │
│  3. JV Generation (Receipt/Payment)                                │
│     - Agent: Generate JVs for settled amounts (payin credit, payout│
│       debit), taxes, corporate actions                             │
│     - HITL Gate: High-value JVs (>₹100L) require finance approval   │
│     - NEXT: If approved → Step 4. Else → Hold until approval       │
│                                                                      │
│  4. GL Posting (Bank reconciliation)                               │
│     - Agent: Post JVs to GL, reconcile bank balance                │
│     - HITL Gate: None (if GL matches bank within threshold)         │
│     - NEXT: If match → Step 5. Else → Investigate (see Pattern A)  │
│                                                                      │
│  5. Margin Update & Risk Monitoring                                │
│     - Agent: Recalculate client margin (post-settlement)           │
│     - Alert if any client breach (util > 90%)                      │
│     - HITL Gate: Escalate breaches to RMS                          │
│     - NEXT: If all OK → Step 6. Else → RMS to determine action     │
│                                                                      │
│  6. SB Payout & Commission Calculation                             │
│     - Agent: Calculate SB payouts (commission, charges, GST)       │
│     - HITL Gate: Payout team approves total                        │
│     - NEXT: If approved → Step 7. Else → Revise and resubmit       │
│                                                                      │
│  7. Regulatory Reporting (NRMS, NSE/BSE files)                     │
│     - Agent: Generate exchange files (holdings, margin, client list)│
│     - HITL Gate: Spot-check file format (1-2 records)               │
│     - NEXT: If validated → Step 8. Else → Correct and retry        │
│                                                                      │
│  8. Audit & Close                                                  │
│     - Agent: Generate settlement audit report (reconciliation       │
│       summary, failed transactions, manual interventions)           │
│     - HITL Gate: Treasury/Ops confirms EOD closure                  │
│     - NEXT: Mark day as closed. Escalate any pending items.         │
│                                                                      │
│  ERROR HANDLING:                                                   │
│  - Step failure → Retry up to 3 times (configurable per step)       │
│  - Repeated failure → Escalate with evidence (logs, data snapshot)  │
│  - Manual escalation → Team gets full context (step #, error, data) │
│  - Recovery → Agent resumes from failed step (or restart if needed) │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Parallelization Opportunities:**
- Steps 1 & 2 can run in parallel (independent data sources)
- Steps 3 & 5 can run in parallel (JV posting & margin calculation independent)
- Steps 6 & 7 can run in parallel (SB payouts ≠ regulatory filing)

**Monitoring Dashboard:**
- Current step status (in progress, completed, failed, escalated)
- SLA countdown (if step takes > threshold time, alert)
- Escalation queue (pending human reviews, stalled for > 1 hour)

---

## IMPLEMENTATION ROADMAP

### Phase 1: Quick Wins (2-3 months, 30% effort reduction)

**Focus:** Fund Reconciliation, KYC Modifications, Payin Processing

| Workflow | Start | Duration | Effort (Dev + BA) | Expected Savings | Dependencies | Success Metrics |
|---|---|---|---|---|---|---|
| Fund Reconciliation | Month 1 Week 1 | 4-5 weeks | 300 hrs | 12-14 FTE | BO GL API, Bank data feed | 98%+ accuracy, < 2h daily SLA |
| KYC Offline Modifications | Month 1 Week 2 | 5-7 weeks | 350 hrs | 8-10 FTE | Document storage API, BO KYC DB | 95%+ validation accuracy, 24h TAT |
| Payin Batch Processing | Month 1 Week 4 | 4-5 weeks | 280 hrs | 8-10 FTE | CDSL gateway, Holdings DB | 99%+ file accuracy, CDSL acceptance |

**Timeline:**
- **Week 1-2:** Requirements gathering, API audits, agent architecture design
- **Week 3-6:** Development (agents, tools, HITL gates)
- **Week 7-8:** UAT (parallel testing with manual process), bug fixes
- **Week 9-10:** Soft launch (20% volume), monitoring, gradual ramp
- **Week 11-12:** Full production, SLA monitoring, ops team training

**Investment:**
- Development: ₹1-1.2 Cr (engineers, QA, infra)
- Infra: ₹0.3-0.5 Cr (Temporal cluster, agents, APIs, monitoring)
- **Total Phase 1:** ₹1.5-2 Cr

**Expected Outcome:**
- 30% reduction in Fund, KYC, Payin manual effort
- 3-4 FTE freed up immediately (reallocate to exceptions/escalations)
- Proof of concept for agentic model (build confidence for Phase 2)

---

### Phase 2: Core Processes (3-6 months, 60% cumulative reduction)

**Focus:** Trade Processing, Securities Settlement, GL Posting, CA Processing

| Workflow | Start | Duration | Effort | Savings | Dependencies |
|---|---|---|---|---|---|
| Contract Note & Margin Statement | Month 4 | 3-4 weeks | 200 hrs | 6-8 FTE | MKT BO APIs, notification gateways |
| Corporate Action Processing | Month 4 Week 3 | 5-6 weeks | 280 hrs | 4-5 FTE | Exchange feeds, CA master, holdings DB |
| GL Posting (JV/REC/PAY) | Month 5 | 6-8 weeks | 320 hrs | 8-10 FTE | GL master, transaction APIs, rule engine |
| Payout & Rejection Handling | Month 5 Week 3 | 4-5 weeks | 240 hrs | 5-6 FTE | Bank APIs, payout gateway, mandate registry |

**Investment:** ₹2-2.5 Cr (larger team, complex integrations)

**Expected Outcome:**
- 60% cumulative reduction in manual effort across KYC, Banking, DP, Trade
- 7-10 additional FTE freed up
- Stable HITL model proven across diverse workflows
- Ready for Phase 3 (remaining workflows automated using established patterns)

---

### Phase 3: Complete Coverage (6-12 months, 80%+ reduction)

**Focus:** NRMS Monitoring, SB Payouts, Regulatory Reporting, remaining exceptions

| Workflow | Start | Duration | Savings | Notes |
|---|---|---|---|---|
| Risk Monitoring (NRMS, Limits) | Month 7 | 2-3 weeks | 3-4 FTE | High-automation potential (95%) |
| Sub-Broker Payouts | Month 8 | 3-4 weeks | 3-4 FTE | Complexity in SB agreement rules |
| Regulatory Data Collection | Month 9 | 5-7 weeks | 2-3 FTE | Manual validation still critical |
| Remaining workflows (15+) | Month 10-12 | Parallel execution | 5-7 FTE | Lower impact, easier patterns |

**Investment:** ₹1.5-2 Cr (scaling agents, fine-tuning, ops training)

**Expected Outcome:**
- **40-50% total FTE reduction** (20-25 FTE from 50+ baseline)
- **₹6-8 Cr annual savings** (FTE + error reduction + compliance efficiency)
- **80%+ of manual activities automated** (15-20% reserved for exceptions, compliance review)

---

## RISK & COMPLIANCE REGISTER

### Data Security & PII Handling

| Workflow Category | PII Exposure | Compliance Requirement | Mitigation | Responsibility |
|---|---|---|---|---|
| **KYC & Client Data** | FULL (Name, PAN, DOB, Address, Bank) | RBI, SEBI KYC norms | Encryption in transit/rest, HITL approval for sensitive updates, audit trail | Compliance team |
| **Fund Settlement** | MEDIUM (Client account, amount, bank) | BSE, NSE settlement rules | Transaction logging, bank statement validation, GL reconciliation | Treasury team |
| **Securities Data** | MEDIUM (Holdings, corporate actions) | CDSL, NSDL regulations | Exchange file integrity (digital signature), daily reconciliation | Operations team |
| **Risk Data** | LOW (Position, margin, limits) | RMS internal controls | Threshold configuration versioning, alert escalation SLA | RMS team |
| **Regulatory Queries** | FULL (Can include client-level data) | SEBI/RBI inspection | Data anonymization for non-relevant records, approval before submission | Legal/Compliance |

**Agent Data Handling:**
- Agents operate within **isolated tenant context** (no cross-client data access)
- **Input validation:** All external data validated before agent processing (API response validation, size checks)
- **Output sanitization:** Sensitive data masked in logs (PAN → ****1234, Phone → ****5678)
- **Audit trail:** Every agent decision logged (timestamp, decision, data input hash, approver if HITL)
- **Retention:** Agent execution logs retained per regulatory requirement (7 years for financial records)

---

### Approval Gates (HITL Requirements by Priority)

| Decision Type | P0 (Must-Have) | P1 (Recommended) | P2 (Optional) | Examples |
|---|---|---|---|---|
| **Data Validation** | Threshold > ₹50L variance | Threshold > ₹10L | Threshold > ₹1L | Fund reconciliation, bank match |
| **Account Modifications** | All KYC changes | Category changes | Segment deactivation | Address, bank, brokerage updates |
| **GL Postings** | Amount > ₹100L | Amount > ₹25L | Amount > ₹1L | JV posting, month-end closing |
| **Payouts** | SB payouts > ₹50L | Customer payouts > ₹10L | Refunds < ₹1L | Cheque generation, bank transfer |
| **Regulatory Submissions** | All inspection responses | Routine reporting | Ad-hoc queries | SEBI data collection, NSE files |

**SLA for HITL Approvals:**
- **P0 (Critical):** Approval SLA = 4 hours (during trading hours) / next business day (post-hours)
- **P1 (High):** Approval SLA = 24 hours
- **P2 (Medium):** Approval SLA = 48 hours
- **Escalation:** If approver unavailable after 50% SLA elapsed, auto-escalate to manager

---

### Error Tolerance & Accuracy Requirements

| Activity Category | Acceptable Error Rate | Detection Method | Remediation |
|---|---|---|---|
| **Reconciliation** | < 0.5% variance (amount-weighted) | Daily automated check | Investigate + manual correction |
| **KYC Validation** | < 1% false positives (document rejection when valid) | Spot audit (5% sample) | Appeal process + retraining |
| **GL Posting** | 0% (must be 100% accurate) | Real-time GL balance check | Reversal + repost if mismatch |
| **Regulatory Filing** | 0% (data integrity critical) | Pre-submission validation + human QA | Retest + resubmit |
| **Payout Processing** | < 0.1% (minimal payment errors) | Bank ACK/NACK tracking | Trace + reversal process |

---

### Compliance & Regulatory Gaps

| Gap | Impact | Remediation Timeline |
|---|---|---|
| No agent digital signature capability for document execution | KYC changes, approvals not legally binding | Implement e-signature integration (Phase 2) |
| Regulatory audit trail not yet standardized for agent decisions | Compliance risk (auditors expect human signatures) | Create audit log format + gain RBI/SEBI approval (Phase 1) |
| No real-time anti-fraud screening in agent validation | Money laundering / sanctions risk | Integrate with SWIFT sanctions check API (Phase 2) |
| SB agreement terms not fully codified (many custom terms) | Agent SB payout calculations may miss nuances | Standardize agreements or maintain manual override (Phase 3) |

---

## MANUAL ACTIVITY INDEX (Quick Reference)

### By Department

#### **KYC (32 manual activities, ~700 FTE hours/month)**

| Sr. | Activity | Current Status | Priority | Est. FTE | Workflow | Agentic Role | Feasibility |
|---|---|---|---|---|---|---|---|
| 1 | HUF Individual Account Onboarding | Manual | P0 | 1.2 | Online Onboarding | Agent validates docs + human approves | 75% |
| 2 | Client Data Reconciliation (UCC) | Manual | P0 | 2.0 | KYC Reconciliation | Agent compares BO vs Exchange, flags mismatches | 80% |
| 3 | NRI Account Opening | Manual | P0 | 0.8 | Online Onboarding | Agent verifies NRI status + human approval | 70% |
| 4 | Minor Demat Account | Manual | P0 | 1.5 | Online Onboarding | Agent validates guardian docs | 75% |
| 5-20 | Offline Address/Bank/Brokerage Changes | Manual | P0 | 8-10 | Offline Modifications | Agent OCR docs + validate + human approve | 75% |
| 21-30 | KYC Status Updates (Dormant, Reactivation) | Manual | P1 | 3-4 | Account Status Management | Agent checks holdings/activity + flag for review | 70% |
| 31-32 | Form Processing / Scanning | Manual | P1 | 1-2 | Document Management | Agent auto-file + index (minimal complexity) | 85% |

#### **Banking / Fund Settlement (45 manual activities, ~1350 FTE hours/month)**

| Sr. | Activity | Current Status | Priority | Est. FTE | Workflow | Agentic Role | Feasibility |
|---|---|---|---|---|---|---|---|
| 50 | Manual JV/REC/PAY Entry | Manual | P0 | 5-6 | GL Posting | Agent determines GL account + human approves | 70% |
| 51 | Fund Reconciliation (BO vs Bank) | Manual | P0 | 12-14 | Fund Reconciliation | Agent matches transactions + flags variances | 80% |
| 52 | SCB Virtual Reconciliation | Manual | P0 | 3-4 | Fund Reconciliation | Agent validates settlement file + posts | 85% |
| 53 | Mismatch Checking & Resolution | Manual | P0 | 4-5 | Fund Reconciliation | Agent analyzes root cause + suggests correction | 75% |
| 54-58 | Refund / Charge Back Handling | Manual | P1 | 3-4 | Exception Handling | Agent traces transaction + prepares response | 60% |

#### **DP / Securities Settlement (38 manual activities, ~950 FTE hours/month)**

| Sr. | Activity | Current Status | Priority | Est. FTE | Workflow | Agentic Role | Feasibility |
|---|---|---|---|---|---|---|---|
| 80 | Payin Batch Generation | Manual | P0 | 8-10 | Payin Processing | Agent validates input file + generates CDSL format | 85% |
| 81 | CC Release Working | Manual | P0 | 2-3 | Payin Processing | Agent calculates release amount + routes | 75% |
| 82 | Payout Processing (Manual) | Manual | P0 | 6-8 | Payout Processing | Agent validates client cash + routes to bank | 70% |
| 83 | Corporate Action Handling | Manual | P0 | 3-4 | CA Processing | Agent applies bonus/split rules + updates holdings | 80% |

#### **Trade Execution & Reporting (28 manual activities, ~600 FTE hours/month)**

| Sr. | Activity | Current Status | Priority | Est. FTE | Workflow | Agentic Role | Feasibility |
|---|---|---|---|---|---|---|---|
| 120 | Contract Note Generation | Manual | P1 | 3-4 | CN Processing | Agent formats per NSE/BSE spec (90% automation) | 90% |
| 121 | Daily Margin Statement | Manual | P1 | 2-3 | Margin Reporting | Agent pulls margin data + sends to client | 85% |
| 122 | Trade Reconciliation (CN) | Manual | P1 | 1-2 | Reconciliation | Agent matches exchange trades to CN | 75% |

#### **Risk Management (25 manual activities, ~400 FTE hours/month)**

| Sr. | Activity | Current Status | Priority | Est. FTE | Workflow | Agentic Role | Feasibility |
|---|---|---|---|---|---|---|---|
| 150 | NRMS Monitoring & Alerts | Manual | P0 | 4-5 | Risk Monitoring | Agent polls NRMS, generates alerts (95% automation) | 95% |
| 151 | Limit File Management | Manual | P1 | 2-3 | Limit Management | Agent generates file per BOD format | 80% |

#### **Reconciliation (60 manual activities, ~1800 FTE hours/month)**

| Sr. | Activity | Current Status | Priority | Est. FTE | Workflow | Agentic Role | Feasibility |
|---|---|---|---|---|---|---|---|
| 200+ | Various recon tasks (Vallan, TMCM, pledge, etc.) | Manual | P0-P1 | 18-20 | Reconciliation Suite | Agents handle data validation, humans handle exceptions | 75% |

#### **Sub-Broker & Partners (32 manual activities, ~550 FTE hours/month)**

| Sr. | Activity | Current Status | Priority | Est. FTE | Workflow | Agentic Role | Feasibility |
|---|---|---|---|---|---|---|---|
| 250 | SB Registration/Modification | Manual | P1 | 2-3 | SB Lifecycle | Agent validates docs + human approves | 70% |
| 251 | SB Payout & Commission Calc | Manual | P0 | 4-5 | SB Payouts | Agent calculates, human approves payout | 90% |
| 252 | Quarterly Settlement | Manual | P1 | 1-2 | SB Settlement | Agent prepares reconciliation report | 75% |

#### **Customer Service (8 manual activities, ~120 FTE hours/month)**

| Sr. | Activity | Current Status | Priority | Est. FTE | Workflow | Agentic Role | Feasibility |
|---|---|---|---|---|---|---|---|
| 300 | Query Response & Resolution | Manual | P2 | 2-3 | Service Desk | Agent classifies query + drafts response | 60% |
| 301 | Issue Escalation | Manual | P2 | 1-2 | Service Desk | Agent routes to specialist team | 75% |

---

## SUCCESS METRICS & MONITORING

### Phase 1 Target Metrics (Month 3)

| Metric | Target | Baseline | Expected Impact |
|---|---|---|---|
| Fund Reconciliation Automation Rate | 80% | 0% | 12-14 FTE freed |
| KYC Modification TAT | < 24 hours | 48-72 hours | Compliance improvement, customer satisfaction |
| Payin Batch Error Rate | < 0.5% | 2-3% | CDSL acceptance rate > 99% |
| Agent Decision Accuracy | > 98% | N/A | Escalation rate < 5% |
| HITL Approval SLA (P0) | 100% met | N/A | Ensures timely processing |
| Audit Trail Completeness | 100% | N/A | Regulatory compliance |

### Phase 2 Target Metrics (Month 6)

| Metric | Target | Cumulative Savings |
|---|---|---|
| Manual Effort Reduction | 60% | 30 FTE |
| Accuracy Across All Workflows | > 97% | Reduced rework (2-3% FTE saved) |
| Compliance TAT Improvement | 50% reduction | Regulatory approval faster |
| Error Cost Reduction | 70% (from current error rate) | ₹50-100L savings/month |

### Phase 3 Target Metrics (Month 12)

| Metric | Target | Total Impact |
|---|---|---|
| Manual Effort Reduction | 80%+ | 40-50 FTE |
| Total Annual Savings | ₹6-8 Cr | FTE cost + error prevention + compliance efficiency |
| System Uptime | > 99.5% | Temporal cluster reliability |
| Agent Availability | > 99% | Minimal manual fallback needed |

---

## NEXT STEPS

1. **Executive Approval** (Week 1)
   - Present roadmap to CFO, COO, Chief Compliance Officer
   - Align on Phase 1 investment (₹1.5-2 Cr) and timeline
   - Secure budget for dev team, infra, external integrations

2. **Technical Architecture Finalization** (Week 2-3)
   - Detailed API audit (BO GL, Bank feeds, CDSL gateway, etc.)
   - Agent framework setup (Temporal cluster, monitoring, security)
   - HITL gate UI/UX design (approval portal, notification routing)

3. **Phase 1 Development Kickoff** (Week 4)
   - Assign dev team (3 backend engineers, 1 QA, 1 BA)
   - Set up CI/CD, testing environments
   - Sprint planning for Fund Reconciliation sprint 1

4. **Partner Engagement** (Parallel to dev)
   - Secure API access from banks (BO GL, bank data feed)
   - Coordinate with RMS for NRMS integration (Phase 2)
   - Legal review of HITL approval process (compliance, liability)

---

## APPENDIX: Workflow Flowchart Examples

### Fund Reconciliation Workflow (Pattern A)

```
┌─────────────────────────────────────────────────────────────────┐
│ INPUT: Daily bank statement (automated download at 6 PM)        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Step 1: Load BO GL data for day (debit, credit, balance)      │
│  Step 2: Agent ingests bank statement (parse CSV/XML)          │
│  Step 3: Match transactions (amount ±₹100, date range ±3 days) │
│  Step 4: For matched transactions → mark reconciled            │
│  Step 5: For unmatched:                                        │
│          - BO has transaction not in bank → "In Transit"       │
│          - Bank has transaction not in BO → "Pending Receipt"  │
│          - Amount variance → "Tolerance Check"                 │
│  Step 6: Calculate net variance                                │
│                                                                 │
│  DECISION POINT:                                               │
│  IF Variance < ₹1L → Auto-approve reconciliation              │
│  IF Variance ≥ ₹1L AND < ₹10L → Escalate to ops team          │
│  IF Variance ≥ ₹10L → Escalate to treasurer + investigate       │
│  IF > 30 unmatched items → Escalate (possible feed error)       │
│                                                                 │
│  Step 7 (if escalated): Human reviews agent analysis           │
│  Step 8: Human decides:                                        │
│          - Approve reconciliation (accept variance)             │
│          - Request more info from agent (retry logic)           │
│          - Escalate to bank (possible bank error)               │
│  Step 9: Post reconciliation + GL adjustment (if needed)       │
│  Step 10: Send reconciliation report to finance team           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
HITL Gate: Steps 7-9 (human approves variances > threshold)
Retry Logic: If agent analysis unclear, ask for clarification
Audit Trail: All decisions logged, variance history maintained
```

---

**Document End**

---

*This document is a strategic blueprint. For detailed implementation, refer to technical architecture design document (to be created in Phase 1).*
