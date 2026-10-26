import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import type { CreditCard, ActiveLoan, ScoreHistoryEntry, Bottleneck, UserProfile } from './src/types.ts';

export type { CreditCard, ActiveLoan, ScoreHistoryEntry, Bottleneck, UserProfile };

// Load secrets from .env.local first, then .env
dotenv.config({ path: ['.env.local', '.env'] });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Initialize Google GenAI server-side (the API key never reaches the browser)
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const hasApiKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY');
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

/** Returns true (and answers 503) when no Gemini key is configured. */
function aiUnavailable(res: Response): boolean {
  if (hasApiKey) return false;
  res.status(503).json({
    error: 'GEMINI_API_KEY is not configured. Add it to .env.local and restart the server.',
  });
  return true;
}

// Helper calculation engine for Indian banking standards
export function computeProfileMetrics(profile: Partial<UserProfile>): UserProfile['calculatedMetrics'] {
  const cards = profile.creditCards || [];
  const loans = profile.activeLoans || [];
  const income = profile.monthlyIncome || 1;
  const expenses = profile.monthlyExpenses || 0;

  const totalCreditLimit = cards.reduce((sum, c) => sum + (Number(c.creditLimit) || 0), 0);
  const totalCreditCardDebt = cards.reduce((sum, c) => sum + (Number(c.currentBalance) || 0), 0);
  
  const totalLoanDebt = loans.reduce((sum, l) => sum + (Number(l.principalRemaining) || 0), 0);
  const totalMonthlyEMI = loans.reduce((sum, l) => sum + (Number(l.monthlyEMI) || 0), 0);
  const totalTotalDebt = totalCreditCardDebt + totalLoanDebt;

  const creditUtilizationRatio = totalCreditLimit > 0
    ? Math.round((totalCreditCardDebt / totalCreditLimit) * 100)
    : 0;

  // DTI or FOIR (Fixed Obligation to Income Ratio) in Indian Banking
  const dtiRatio = Math.round((totalMonthlyEMI / income) * 100);
  const discretionarySavings = Math.max(0, income - expenses - totalMonthlyEMI);

  let securedDebt = 0;
  let unsecuredDebt = totalCreditCardDebt;

  loans.forEach((l) => {
    if (l.isSecured) {
      securedDebt += Number(l.principalRemaining) || 0;
    } else {
      unsecuredDebt += Number(l.principalRemaining) || 0;
    }
  });

  const totalForRatio = securedDebt + unsecuredDebt;
  const securedRatio = totalForRatio > 0 ? Math.round((securedDebt / totalForRatio) * 100) : 0;

  // Bottleneck detection
  const bottlenecks: Bottleneck[] = [];

  if (creditUtilizationRatio > 30) {
    bottlenecks.push({
      id: 'high-utilization',
      severity: creditUtilizationRatio > 50 ? 'critical' : 'warning',
      title: 'High Revolving Credit Utilization',
      description: `Your card utilization is ${creditUtilizationRatio}%. Indian credit bureaus (CIBIL/Experian) heavily penalize utilization exceeding 30%.`,
      currentValue: `${creditUtilizationRatio}%`,
      recommendedValue: '< 30% (Ideal < 20%)',
      impact: '-35 to -60 points on CIBIL',
    });
  }

  if (dtiRatio > 45) {
    bottlenecks.push({
      id: 'high-dti',
      severity: dtiRatio > 60 ? 'critical' : 'warning',
      title: 'Elevated FOIR / Debt-to-Income',
      description: `Fixed loan obligations consume ${dtiRatio}% of your monthly income. Leading banks (HDFC, SBI, ICICI) cap acceptable FOIR at 40-50% for loan approvals.`,
      currentValue: `${dtiRatio}% FOIR`,
      recommendedValue: '< 40%',
      impact: 'High loan rejection risk & low borrowing eligibility',
    });
  }

  if ((profile.missedPaymentsLast24Months || 0) > 0) {
    bottlenecks.push({
      id: 'missed-payments',
      severity: 'critical',
      title: 'Reported Payment Overdues (DPD)',
      description: `You have ${profile.missedPaymentsLast24Months} late/missed payment record(s) on file. Repayment history constitutes 35% of your CIBIL score.`,
      currentValue: `${profile.missedPaymentsLast24Months} Late Record(s)`,
      recommendedValue: '0 DPD (100% On-time)',
      impact: '-50 to -90 points drag for 24 months',
    });
  }

  if ((profile.hardInquiriesLast6Months || 0) >= 3) {
    bottlenecks.push({
      id: 'excess-inquiries',
      severity: 'warning',
      title: 'Frequent Hard Inquiries',
      description: `${profile.hardInquiriesLast6Months} credit inquiries within 6 months signal credit hunger to underwriters.`,
      currentValue: `${profile.hardInquiriesLast6Months} Inquiries`,
      recommendedValue: '< 2 per half-year',
      impact: '-15 to -25 points temporary drop',
    });
  }

  if (totalForRatio > 0 && securedRatio < 20 && loans.length >= 2) {
    bottlenecks.push({
      id: 'skewed-mix',
      severity: 'info',
      title: 'Unfavorable Credit Mix (Unsecured Heavy)',
      description: 'Your portfolio is predominantly unsecured debt (personal loans & credit cards). Bureau algorithms reward a healthy mix of secured (auto/home/gold) and unsecured facilities.',
      currentValue: `${securedRatio}% Secured`,
      recommendedValue: '30-40% Healthy Balance',
      impact: 'Limits score velocity beyond 780+',
    });
  }

  return {
    totalCreditLimit,
    totalCreditCardDebt,
    totalLoanDebt,
    totalTotalDebt,
    totalMonthlyEMI,
    creditUtilizationRatio,
    dtiRatio,
    discretionarySavings,
    securedDebt,
    unsecuredDebt: totalTotalDebt - securedDebt,
    securedRatio,
    bottlenecks,
  };
}

export function determineScoreCategory(score: number): 'Poor' | 'Fair' | 'Good' | 'Excellent' {
  if (score >= 750) return 'Excellent';
  if (score >= 680) return 'Good';
  if (score >= 600) return 'Fair';
  return 'Poor';
}

// In-Memory Database initialized with realistic Indian financial ecosystem profiles
let dbProfiles: UserProfile[] = [
  {
    id: 'user_rahul_sharma',
    name: 'Rahul Sharma',
    email: 'rahul.sharma@example.com',
    phone: '+91 98201 45892',
    occupation: 'Software Engineer (Pune)',
    monthlyIncome: 85000,
    monthlyExpenses: 28000,
    cibilScore: 648,
    scoreCategory: 'Fair',
    missedPaymentsLast24Months: 2,
    hardInquiriesLast6Months: 4,
    creditAgeYears: 3.5,
    creditCards: [
      {
        id: 'card_1',
        bankName: 'HDFC Bank',
        cardName: 'Millennia Credit Card',
        creditLimit: 100000,
        currentBalance: 78500,
        dueDate: '15th of each month',
        aprPercent: 42,
      },
      {
        id: 'card_2',
        bankName: 'ICICI Bank',
        cardName: 'Amazon Pay Credit Card',
        creditLimit: 50000,
        currentBalance: 33500,
        dueDate: '22nd of each month',
        aprPercent: 39,
      },
    ],
    activeLoans: [
      {
        id: 'loan_1',
        lenderName: 'Bajaj Finserv',
        loanType: 'Personal Loan',
        isSecured: false,
        principalRemaining: 340000,
        monthlyEMI: 18500,
        interestRate: 15.5,
        tenureMonthsRemaining: 22,
      },
      {
        id: 'loan_2',
        lenderName: 'KreditBee',
        loanType: 'Personal Loan',
        isSecured: false,
        principalRemaining: 65000,
        monthlyEMI: 7200,
        interestRate: 21.0,
        tenureMonthsRemaining: 10,
      },
    ],
    calculatedMetrics: {
      totalCreditLimit: 150000,
      totalCreditCardDebt: 112000,
      totalLoanDebt: 405000,
      totalTotalDebt: 517000,
      totalMonthlyEMI: 25700,
      creditUtilizationRatio: 75,
      dtiRatio: 30,
      discretionarySavings: 31300,
      securedDebt: 0,
      unsecuredDebt: 517000,
      securedRatio: 0,
      bottlenecks: [],
    },
    scoreHistory: [
      { date: '2025-10-01', monthLabel: 'Oct 25', score: 620, event: 'Missed EMI reported by NBFC', utilization: 82, dti: 38 },
      { date: '2025-11-01', monthLabel: 'Nov 25', score: 628, event: 'Cleared overdue EMI', utilization: 80, dti: 35 },
      { date: '2025-12-01', monthLabel: 'Dec 25', score: 635, event: 'Regular billing cycle', utilization: 79, dti: 33 },
      { date: '2026-01-01', monthLabel: 'Jan 26', score: 640, event: 'Paid partial card balance', utilization: 77, dti: 31 },
      { date: '2026-02-01', monthLabel: 'Feb 26', score: 648, event: 'Onboarding assessment baseline', utilization: 75, dti: 30 },
    ],
  },
  {
    id: 'user_priya_patel',
    name: 'Priya Patel',
    email: 'priya.patel@example.com',
    phone: '+91 99302 78120',
    occupation: 'Marketing Director (Bengaluru)',
    monthlyIncome: 145000,
    monthlyExpenses: 45000,
    cibilScore: 735,
    scoreCategory: 'Good',
    missedPaymentsLast24Months: 0,
    hardInquiriesLast6Months: 1,
    creditAgeYears: 6.2,
    creditCards: [
      {
        id: 'card_3',
        bankName: 'Axis Bank',
        cardName: 'Magnus Credit Card',
        creditLimit: 350000,
        currentBalance: 68000,
        dueDate: '10th of each month',
        aprPercent: 36,
      },
      {
        id: 'card_4',
        bankName: 'SBI Card',
        cardName: 'SimplyCLICK',
        creditLimit: 200000,
        currentBalance: 32000,
        dueDate: '18th of each month',
        aprPercent: 39,
      },
    ],
    activeLoans: [
      {
        id: 'loan_3',
        lenderName: 'SBI',
        loanType: 'Auto Loan',
        isSecured: true,
        principalRemaining: 480000,
        monthlyEMI: 16200,
        interestRate: 8.9,
        tenureMonthsRemaining: 34,
      },
    ],
    calculatedMetrics: {
      totalCreditLimit: 550000,
      totalCreditCardDebt: 100000,
      totalLoanDebt: 480000,
      totalTotalDebt: 580000,
      totalMonthlyEMI: 16200,
      creditUtilizationRatio: 18,
      dtiRatio: 11,
      discretionarySavings: 83800,
      securedDebt: 480000,
      unsecuredDebt: 100000,
      securedRatio: 83,
      bottlenecks: [],
    },
    scoreHistory: [
      { date: '2025-10-01', monthLabel: 'Oct 25', score: 710, event: 'Auto loan sanctioned', utilization: 26, dti: 14 },
      { date: '2025-11-01', monthLabel: 'Nov 25', score: 718, event: 'On-time EMI & card payoff', utilization: 22, dti: 12 },
      { date: '2025-12-01', monthLabel: 'Dec 25', score: 724, event: 'Limit enhancement approved', utilization: 20, dti: 12 },
      { date: '2026-01-01', monthLabel: 'Jan 26', score: 730, event: 'Zero missed payments', utilization: 19, dti: 11 },
      { date: '2026-02-01', monthLabel: 'Feb 26', score: 735, event: 'Healthy credit mix established', utilization: 18, dti: 11 },
    ],
  },
];

// Initialize metrics for preloaded profiles
dbProfiles.forEach((p) => {
  p.calculatedMetrics = computeProfileMetrics(p);
  p.scoreCategory = determineScoreCategory(p.cibilScore);
});

// Profile endpoints
export const MOCK_BANK_OFFERS = [
  {
    id: 'sbi-xpress-credit',
    bankName: 'State Bank of India (SBI)',
    bankLogoText: 'SBI',
    themeColor: 'bg-blue-800 text-white',
    badge: 'Lowest PSU Rates',
    loanCategory: 'debt_consolidation',
    productName: 'SBI Xpress Credit Debt Consolidation',
    interestRateMin: 10.30,
    interestRateMax: 13.50,
    processingFee: '0.50% (Max ₹3,500 + GST)',
    minCibilScore: 680,
    maxAmount: 3000000,
    maxTenureMonths: 72,
    features: [
      'No prepayment penalty after 12 months per RBI guidelines',
      'Direct vendor payoff to close credit cards',
      'Concessional rates for corporate & govt employees',
      'Daily reducing balance method',
    ],
    disbursalTime: '24-48 Hours',
    partnerRating: 4.8,
    officialApplyUrlNote: 'Available via SBI YONO & branch banking',
  },
  {
    id: 'hdfc-smart-debt',
    bankName: 'HDFC Bank',
    bankLogoText: 'HDFC',
    themeColor: 'bg-blue-900 text-white',
    badge: 'Fastest Disbursal',
    loanCategory: 'debt_consolidation',
    productName: 'HDFC SmartDebt Balance Transfer & Personal Loan',
    interestRateMin: 10.50,
    interestRateMax: 13.75,
    processingFee: 'Flat ₹1,999 + GST festive offer',
    minCibilScore: 700,
    maxAmount: 4000000,
    maxTenureMonths: 60,
    features: [
      '10-second instant disbursal for existing customers',
      'Consolidate up to 4 credit cards and 2 personal loans into one single low EMI',
      'Zero physical paperwork with Aadhaar e-KYC',
      'Part-prepayment allowed with zero charges',
    ],
    disbursalTime: 'Instant to 4 Hours',
    partnerRating: 4.9,
    officialApplyUrlNote: 'Direct netbanking pre-approved portal',
  },
  {
    id: 'bob-retail-consolidation',
    bankName: 'Bank of Baroda',
    bankLogoText: 'BOB',
    themeColor: 'bg-orange-600 text-white',
    badge: 'Zero Processing Fee Promo',
    loanCategory: 'debt_consolidation',
    productName: 'Bank of Baroda Baroda Yodha Consolidation Loan',
    interestRateMin: 10.15,
    interestRateMax: 12.90,
    processingFee: 'Zero / Nil under current festival scheme',
    minCibilScore: 675,
    maxAmount: 2500000,
    maxTenureMonths: 60,
    features: [
      'Industry-leading 10.15% starting rate for CIBIL 720+',
      'Direct settlement with existing creditors to boost credit score instantly',
      'No hidden administrative charges',
      'Transparent MCLR-linked rate structure',
    ],
    disbursalTime: '1-2 Working Days',
    partnerRating: 4.7,
    officialApplyUrlNote: 'BOB World mobile app or nearest branch',
  },
  {
    id: 'icici-express-bt',
    bankName: 'ICICI Bank',
    bankLogoText: 'ICICI',
    themeColor: 'bg-red-800 text-white',
    badge: 'Pre-Approved Paperless',
    loanCategory: 'debt_consolidation',
    productName: 'ICICI Express Balance Transfer Facility',
    interestRateMin: 10.65,
    interestRateMax: 14.00,
    processingFee: '0.75% of sanctioned amount',
    minCibilScore: 700,
    maxAmount: 3500000,
    maxTenureMonths: 60,
    features: [
      'Eliminate 42% credit card APR with fixed low-interest personal loan',
      'Top-up loan facility available simultaneously',
      'Instant video KYC through iMobile app',
      'Customized monthly EMI date to align with salary credit',
    ],
    disbursalTime: 'Under 2 Hours',
    partnerRating: 4.8,
    officialApplyUrlNote: 'ICICI iMobile & Internet Banking',
  },
  {
    id: 'muthoot-gold-refinance',
    bankName: 'Muthoot Finance',
    bankLogoText: 'MUTHOOT',
    themeColor: 'bg-amber-600 text-white',
    badge: 'No CIBIL Cutoff Barrier',
    loanCategory: 'gold_loan',
    productName: 'Muthoot Secured Gold Loan Refinance',
    interestRateMin: 8.85,
    interestRateMax: 11.20,
    processingFee: 'Nil up to ₹5 Lakhs',
    minCibilScore: 550,
    maxAmount: 15000000,
    maxTenureMonths: 36,
    features: [
      'Perfect solution for sub-650 CIBIL borrowers trapped in 42% card debt',
      'Secured by gold ornaments with bank-grade vault insurance',
      'Flexible repayment: Pay interest monthly and principal at maturity',
      'Immediate cash flow relief of up to 70% vs high-interest unhedged debt',
    ],
    disbursalTime: '30 Minutes in Branch',
    partnerRating: 4.9,
    officialApplyUrlNote: 'Over 5,000 branches nationwide & Doorstep service',
  },
  {
    id: 'axis-quick-personal',
    bankName: 'Axis Bank',
    bankLogoText: 'AXIS',
    themeColor: 'bg-rose-900 text-white',
    badge: 'High Sanction Limit',
    loanCategory: 'personal_loan',
    productName: 'Axis 24x7 Digital Refinancing Loan',
    interestRateMin: 10.75,
    interestRateMax: 14.50,
    processingFee: '1.0% + GST',
    minCibilScore: 690,
    maxAmount: 4000000,
    maxTenureMonths: 60,
    features: [
      '100% end-to-end digital journey from loan comparison to disbursement',
      'Attractive discount of 0.25% for salary account holders',
      'Zero foreclosure fees on floating rate options',
      'Consolidate up to 5 obligations into one manageable EMI',
    ],
    disbursalTime: 'Same Day Disbursal',
    partnerRating: 4.7,
    officialApplyUrlNote: 'Axis Mobile or Axis Bank official portal',
  },
  {
    id: 'kotak-smart-transfer',
    bankName: 'Kotak Mahindra Bank',
    bankLogoText: 'KOTAK',
    themeColor: 'bg-red-700 text-white',
    badge: 'Flexible Dropline',
    loanCategory: 'debt_consolidation',
    productName: 'Kotak Smart Balance Transfer & Consolidation',
    interestRateMin: 10.75,
    interestRateMax: 14.25,
    processingFee: 'Flat ₹1,499 special promo',
    minCibilScore: 710,
    maxAmount: 3000000,
    maxTenureMonths: 60,
    features: [
      'Low initial processing fees with quick turnaround',
      'Option for dropline overdraft so you only pay interest on utilized funds',
      'Complimentary zero-balance 811 account with digital perks',
      'Dedicated relationship manager for debt restructuring',
    ],
    disbursalTime: '24 Hours',
    partnerRating: 4.6,
    officialApplyUrlNote: 'Kotak net banking & mobile app',
  },
  {
    id: 'sbi-home-loan-bt',
    bankName: 'SBI Home Loans',
    bankLogoText: 'SBI-HL',
    themeColor: 'bg-cyan-900 text-white',
    badge: 'Cheapest Retail Rate',
    loanCategory: 'home_loan_balance_transfer',
    productName: 'SBI Regular Home Loan Balance Transfer',
    interestRateMin: 8.40,
    interestRateMax: 9.15,
    processingFee: 'Nil for takeover of existing home loans',
    minCibilScore: 750,
    maxAmount: 50000000,
    maxTenureMonths: 360,
    features: [
      'Lowest home loan takeover rates in the Indian market',
      'Substantial Top-up loan available at home loan rates for debt consolidation',
      'Zero pre-payment and zero foreclosure charges as per RBI',
      'Up to 30 years repayment tenure to slash monthly FOIR',
    ],
    disbursalTime: '3-5 Working Days',
    partnerRating: 4.9,
    officialApplyUrlNote: 'SBI Home Loan Hubs across India',
  },
  {
    id: 'tata-capital-consolidation',
    bankName: 'Tata Capital',
    bankLogoText: 'TATA',
    themeColor: 'bg-blue-950 text-white',
    badge: 'Trusted Conglomerate',
    loanCategory: 'debt_consolidation',
    productName: 'Tata Capital Debt Consolidation Personal Loan',
    interestRateMin: 10.99,
    interestRateMax: 15.00,
    processingFee: '1.25% of loan amount',
    minCibilScore: 675,
    maxAmount: 2500000,
    maxTenureMonths: 72,
    features: [
      'Extended tenure up to 72 months to drastically reduce monthly outflow',
      'Transparent terms with no hidden insurance bundling',
      'Quick in-principle approval in 5 minutes',
      'Flexible EMI options during initial 6 months',
    ],
    disbursalTime: '24-48 Hours',
    partnerRating: 4.7,
    officialApplyUrlNote: 'Tata Capital official digital portal',
  },
];

// Mock API endpoint to fetch current Indian bank loan offers
app.get('/api/bank-offers', (req: Request, res: Response) => {
  const { category, minCibil, sort } = req.query;
  let offers = [...MOCK_BANK_OFFERS];

  if (category && typeof category === 'string' && category !== 'all') {
    offers = offers.filter((o) => o.loanCategory === category);
  }

  if (minCibil && !isNaN(Number(minCibil))) {
    const cibilVal = Number(minCibil);
    // Keep offers where borrower meets or is close to CIBIL requirements
    offers = offers.filter((o) => o.minCibilScore <= cibilVal + 40);
  }

  if (sort === 'rate_asc') {
    offers.sort((a, b) => a.interestRateMin - b.interestRateMin);
  } else if (sort === 'cibil_asc') {
    offers.sort((a, b) => a.minCibilScore - b.minCibilScore);
  } else if (sort === 'rating_desc') {
    offers.sort((a, b) => b.partnerRating - a.partnerRating);
  }

  res.json({
    timestamp: new Date().toISOString(),
    totalOffers: offers.length,
    offers,
  });
});

// Refinance savings calculation endpoint
app.post('/api/bank-offers/refinance-simulate', (req: Request, res: Response) => {
  try {
    const { debtItems, targetRate, tenureMonths } = req.body;
    // debtItems: Array<{ amount: number, rate: number, monthlyPayment: number }>
    if (!debtItems || !Array.isArray(debtItems) || debtItems.length === 0) {
      return res.status(400).json({ error: 'No debt items provided' });
    }

    const newRate = Number(targetRate) || 10.5;
    const tenure = Number(tenureMonths) || 36;

    let totalConsolidatedDebt = 0;
    let currentMonthlyObligation = 0;
    let weightedRateSum = 0;

    debtItems.forEach((d: any) => {
      const amt = Number(d.amount) || 0;
      const r = Number(d.rate) || 24;
      const emi = Number(d.monthlyPayment) || Math.round((amt * (r / 100)) / 12);
      totalConsolidatedDebt += amt;
      currentMonthlyObligation += emi;
      weightedRateSum += amt * r;
    });

    const currentBlendedInterestRate = totalConsolidatedDebt > 0
      ? Math.round((weightedRateSum / totalConsolidatedDebt) * 10) / 10
      : 24;

    // Refinanced EMI with reducing balance formula
    const monthlyR = newRate / 12 / 100;
    let refinancedMonthlyEMI = 0;
    if (monthlyR === 0) {
      refinancedMonthlyEMI = Math.round(totalConsolidatedDebt / tenure);
    } else {
      const factor = Math.pow(1 + monthlyR, tenure);
      refinancedMonthlyEMI = Math.round((totalConsolidatedDebt * monthlyR * factor) / (factor - 1));
    }

    const monthlySavings = Math.max(0, currentMonthlyObligation - refinancedMonthlyEMI);
    const annualSavings = monthlySavings * 12;

    // Total interest estimation over tenure
    const currentTotalPayment = currentMonthlyObligation * tenure;
    const currentEstimatedInterest = Math.max(0, currentTotalPayment - totalConsolidatedDebt);
    const refinancedTotalPayment = refinancedMonthlyEMI * tenure;
    const refinancedTotalInterest = Math.max(0, refinancedTotalPayment - totalConsolidatedDebt);
    const lifetimeInterestSaved = Math.max(0, currentEstimatedInterest - refinancedTotalInterest);

    // Projected CIBIL delta: Consolidating revolving card debt into a single personal loan drops card utilization to 0%, yielding +35 to +50 points!
    const hasCardDebt = debtItems.some((d: any) => d.type === 'card' || d.rate > 30);
    const projectedCibilDelta = hasCardDebt ? 42 : 25;

    res.json({
      totalConsolidatedDebt,
      currentMonthlyObligation,
      refinancedMonthlyEMI,
      monthlySavings,
      annualSavings,
      lifetimeInterestSaved,
      currentBlendedInterestRate,
      refinancedRate: newRate,
      projectedCibilDelta,
    });
  } catch (err: any) {
    console.error('Error in refinance simulation:', err);
    res.status(500).json({ error: 'Failed to simulate refinance savings' });
  }
});

// Profile endpoints
app.get('/api/profiles', (req: Request, res: Response) => {
  res.json({
    profiles: dbProfiles.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      cibilScore: p.cibilScore,
      scoreCategory: p.scoreCategory,
      occupation: p.occupation,
      monthlyIncome: p.monthlyIncome,
      utilization: p.calculatedMetrics.creditUtilizationRatio,
      dtiRatio: p.calculatedMetrics.dtiRatio,
    })),
  });
});

app.get('/api/profiles/:id', (req: Request, res: Response) => {
  const profile = dbProfiles.find((p) => p.id === req.params.id);
  if (!profile) {
    return res.status(404).json({ error: 'Profile not found' });
  }
  res.json({ profile });
});

// Scenario 1: User Onboarding and Initial Assessment
app.post('/api/profiles', (req: Request, res: Response) => {
  try {
    const data = req.body;
    const newId = `user_${Date.now()}`;
    const score = Number(data.cibilScore) || 650;

    const newProfile: UserProfile = {
      id: newId,
      name: data.name || 'New User',
      email: data.email || 'user@example.com',
      phone: data.phone || '+91 90000 00000',
      occupation: data.occupation || 'Salaried Professional',
      monthlyIncome: Number(data.monthlyIncome) || 50000,
      monthlyExpenses: Number(data.monthlyExpenses) || 20000,
      cibilScore: score,
      scoreCategory: determineScoreCategory(score),
      missedPaymentsLast24Months: Number(data.missedPaymentsLast24Months) || 0,
      hardInquiriesLast6Months: Number(data.hardInquiriesLast6Months) || 1,
      creditAgeYears: Number(data.creditAgeYears) || 2.0,
      creditCards: (data.creditCards || []).map((c: any, idx: number) => ({
        id: `card_${Date.now()}_${idx}`,
        bankName: c.bankName || 'HDFC Bank',
        cardName: c.cardName || 'Credit Card',
        creditLimit: Number(c.creditLimit) || 100000,
        currentBalance: Number(c.currentBalance) || 25000,
        dueDate: c.dueDate || '15th',
        aprPercent: Number(c.aprPercent) || 42,
      })),
      activeLoans: (data.activeLoans || []).map((l: any, idx: number) => ({
        id: `loan_${Date.now()}_${idx}`,
        lenderName: l.lenderName || 'SBI',
        loanType: l.loanType || 'Personal Loan',
        isSecured: Boolean(l.isSecured),
        principalRemaining: Number(l.principalRemaining) || 150000,
        monthlyEMI: Number(l.monthlyEMI) || 8000,
        interestRate: Number(l.interestRate) || 14.5,
        tenureMonthsRemaining: Number(l.tenureMonthsRemaining) || 24,
      })),
      calculatedMetrics: {
        totalCreditLimit: 0,
        totalCreditCardDebt: 0,
        totalLoanDebt: 0,
        totalTotalDebt: 0,
        totalMonthlyEMI: 0,
        creditUtilizationRatio: 0,
        dtiRatio: 0,
        discretionarySavings: 0,
        securedDebt: 0,
        unsecuredDebt: 0,
        securedRatio: 0,
        bottlenecks: [],
      },
      scoreHistory: [],
    };

    // Calculate metrics
    newProfile.calculatedMetrics = computeProfileMetrics(newProfile);

    // Initial score history baseline
    const now = new Date();
    const monthName = now.toLocaleString('default', { month: 'short' });
    const yearShort = String(now.getFullYear()).slice(-2);

    newProfile.scoreHistory = [
      {
        date: now.toISOString().slice(0, 10),
        monthLabel: `${monthName} ${yearShort}`,
        score: newProfile.cibilScore,
        event: 'Initial assessment & onboarding baseline',
        utilization: newProfile.calculatedMetrics.creditUtilizationRatio,
        dti: newProfile.calculatedMetrics.dtiRatio,
      },
    ];

    dbProfiles.push(newProfile);

    res.status(201).json({
      message: 'User profile registered and assessed successfully',
      profile: newProfile,
    });
  } catch (err: any) {
    console.error('Error creating profile:', err);
    res.status(500).json({ error: err.message || 'Failed to register profile' });
  }
});

// Scenario 4: Real-time Credit Health Monitoring & Debt Payoff
app.post('/api/profiles/:id/pay-debt', (req: Request, res: Response) => {
  try {
    const profile = dbProfiles.find((p) => p.id === req.params.id);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const { type, itemId, amountPaid, closeAccount } = req.body;
    const payment = Number(amountPaid) || 0;
    if (type !== 'card' && type !== 'loan') {
      return res.status(400).json({ error: "type must be 'card' or 'loan'" });
    }
    if (payment <= 0 && !closeAccount) {
      return res.status(400).json({ error: 'amountPaid must be greater than 0' });
    }
    let oldScore = profile.cibilScore;
    let eventDescription = '';

    if (type === 'card') {
      const card = profile.creditCards.find((c) => c.id === itemId);
      if (!card) return res.status(404).json({ error: 'Card not found' });

      const prevBal = card.currentBalance;
      card.currentBalance = Math.max(0, card.currentBalance - payment);
      eventDescription = `Paid ₹${payment.toLocaleString('en-IN')} towards ${card.bankName} card (Prev: ₹${prevBal.toLocaleString('en-IN')})`;
    } else if (type === 'loan') {
      const loan = profile.activeLoans.find((l) => l.id === itemId);
      if (!loan) return res.status(404).json({ error: 'Loan not found' });

      if (closeAccount || payment >= loan.principalRemaining) {
        profile.activeLoans = profile.activeLoans.filter((l) => l.id !== itemId);
        eventDescription = `Fully paid off and closed ${loan.loanType} with ${loan.lenderName}!`;
      } else {
        loan.principalRemaining = Math.max(0, loan.principalRemaining - payment);
        eventDescription = `Part-prepayment of ₹${payment.toLocaleString('en-IN')} on ${loan.lenderName} ${loan.loanType}`;
      }
    }

    // Recalculate metrics
    const newMetrics = computeProfileMetrics(profile);
    profile.calculatedMetrics = newMetrics;

    // Determine score improvement delta based on Indian CIBIL algorithms:
    // 1. Credit utilization drop impact:
    // If utilization was > 50% and drops below 30%, gain +25 to +40 points
    let delta = 0;
    const oldUtilization = profile.scoreHistory.length > 0 ? profile.scoreHistory[profile.scoreHistory.length - 1].utilization : 60;
    const utilDiff = oldUtilization - newMetrics.creditUtilizationRatio;

    if (utilDiff > 0) {
      delta += Math.min(45, Math.round(utilDiff * 0.7));
    }

    if (type === 'loan' && closeAccount) {
      // Removing high interest personal loan relieves FOIR
      delta += 15;
    }

    if (delta <= 0 && payment > 0) {
      delta = Math.min(12, Math.max(5, Math.round(payment / 20000)));
    }

    const newScore = Math.min(900, oldScore + delta);
    profile.cibilScore = newScore;
    profile.scoreCategory = determineScoreCategory(newScore);

    // Append to score history
    const d = new Date();
    const monthName = d.toLocaleString('default', { month: 'short' });
    const yearShort = String(d.getFullYear()).slice(-2);

    profile.scoreHistory.push({
      date: d.toISOString().slice(0, 10),
      monthLabel: `${monthName} ${yearShort} (Updated)`,
      score: newScore,
      event: eventDescription,
      utilization: newMetrics.creditUtilizationRatio,
      dti: newMetrics.dtiRatio,
    });

    res.json({
      message: 'Payment recorded and score recalculated',
      delta,
      newScore,
      scoreCategory: profile.scoreCategory,
      profile,
    });
  } catch (err: any) {
    console.error('Error paying debt:', err);
    res.status(500).json({ error: err.message || 'Failed to process debt payment' });
  }
});

// Update full profile metrics & state
app.put('/api/profiles/:id', (req: Request, res: Response) => {
  const profileIndex = dbProfiles.findIndex((p) => p.id === req.params.id);
  if (profileIndex === -1) {
    return res.status(404).json({ error: 'Profile not found' });
  }

  const existing = dbProfiles[profileIndex];
  const updatedData = { ...existing, ...req.body, id: existing.id };

  updatedData.calculatedMetrics = computeProfileMetrics(updatedData);
  updatedData.scoreCategory = determineScoreCategory(updatedData.cibilScore);

  dbProfiles[profileIndex] = updatedData;
  res.json({ profile: updatedData });
});

// Scenario 2: AI-Powered Financial Consultation with Gemini AI
app.post('/api/advisor/analyze', async (req: Request, res: Response) => {
  if (aiUnavailable(res)) return;
  try {
    const { profileId } = req.body;
    const profile = dbProfiles.find((p) => p.id === profileId);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const metrics = profile.calculatedMetrics;
    const prompt = `You are Shubham Vasu, Lead Financial & Credit Health Advisor specializing in the Indian banking ecosystem, CIBIL, Experian, CRIF High Mark, and RBI banking regulations.

Analyze the following Indian borrower's financial profile:
- Name: ${profile.name}
- Current CIBIL Score: ${profile.cibilScore} (${profile.scoreCategory})
- Monthly Income: ₹${profile.monthlyIncome.toLocaleString('en-IN')}
- Total Debt: ₹${metrics.totalTotalDebt.toLocaleString('en-IN')} (Credit Cards: ₹${metrics.totalCreditCardDebt.toLocaleString('en-IN')}, Loans: ₹${metrics.totalLoanDebt.toLocaleString('en-IN')})
- Total Credit Card Limit: ₹${metrics.totalCreditLimit.toLocaleString('en-IN')}
- Credit Card Utilization Ratio: ${metrics.creditUtilizationRatio}% (Threshold: 30%)
- Monthly Loan EMIs: ₹${metrics.totalMonthlyEMI.toLocaleString('en-IN')}
- Debt-to-Income / FOIR Ratio: ${metrics.dtiRatio}% (RBI/Bank Safe Cap: 40-50%)
- Missed Payments / DPD records in last 24 months: ${profile.missedPaymentsLast24Months}
- Hard Inquiries in last 6 months: ${profile.hardInquiriesLast6Months}
- Active Credit Cards: ${profile.creditCards.map((c) => `${c.bankName} ${c.cardName} (Bal: ₹${c.currentBalance}/₹${c.creditLimit})`).join(', ') || 'None'}
- Active Loans: ${profile.activeLoans.map((l) => `${l.lenderName} ${l.loanType} (EMI: ₹${l.monthlyEMI}, Bal: ₹${l.principalRemaining})`).join(', ') || 'None'}

Provide:
1. An executive diagnosis of their credit bottlenecks in the Indian context (e.g. CIBIL score drag due to high utilization, DPD records, FOIR constraints on future home/car loans).
2. A realistic 6-month projected CIBIL score if they follow your advice.
3. An exact, prioritized 5-step actionable roadmap tailored to Indian banking practices (such as paying high-interest APR cards first, pre-closing high EMI personal loans, requesting limit enhancement without hard pull, setting NACH auto-debit, raising CIBIL bureau disputes if wrongful DPD).
4. Concrete advice on navigating Indian banks (HDFC, SBI, ICICI) and credit bureau guidelines.`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction: `You are Shubham Vasu, an authoritative Indian credit rating and personal finance specialist.
Output strictly in valid JSON adhering to the specified schema.
Ensure your advice reflects Indian banking reality: mentions ₹ INR, CIBIL score nuances (750+ benchmark for prime rates), FOIR (Fixed Obligation to Income Ratio), DPD (Days Past Due), NACH mandate, and loan settlement versus closure.`,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: {
              type: Type.STRING,
              description: 'Executive summary of the borrower credit health and key vulnerabilities.',
            },
            cibilHealthGrade: {
              type: Type.STRING,
              description: 'e.g. Critical Attention Needed, Moderate Risk, Prime Eligible',
            },
            bottleneckSummary: {
              type: Type.STRING,
              description: 'Primary bottlenecks holding their score back.',
            },
            projectedScoreIn6Months: {
              type: Type.INTEGER,
              description: 'Projected realistic CIBIL score in 6 months.',
            },
            steps: {
              type: Type.ARRAY,
              description: 'Exact 5-step actionable roadmap.',
              items: {
                type: Type.OBJECT,
                properties: {
                  stepNumber: { type: Type.INTEGER },
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  category: {
                    type: Type.STRING,
                    description: 'One of: Utilization, Repayment, Credit Mix, DTI / FOIR, Dispute / Bureau',
                  },
                  potentialScoreImpact: {
                    type: Type.INTEGER,
                    description: 'Estimated points increase (e.g. 25, 40)',
                  },
                  timeframe: {
                    type: Type.STRING,
                    description: 'e.g. Month 1, Immediate, 30-60 Days',
                  },
                },
                required: ['stepNumber', 'title', 'description', 'category', 'potentialScoreImpact', 'timeframe'],
              },
            },
            indianBankingAdvice: {
              type: Type.STRING,
              description: 'Special strategic tips for Indian banks (CIBIL dispute, gold loan consolidation, FOIR rule, pre-closure charges exemption under RBI).',
            },
          },
          required: [
            'summary',
            'cibilHealthGrade',
            'bottleneckSummary',
            'projectedScoreIn6Months',
            'steps',
            'indianBankingAdvice',
          ],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    
    // Persist to profile
    profile.aiRoadmap = {
      lastGeneratedAt: new Date().toISOString(),
      summary: parsed.summary,
      cibilHealthGrade: parsed.cibilHealthGrade,
      bottleneckSummary: parsed.bottleneckSummary,
      projectedScoreIn6Months: parsed.projectedScoreIn6Months,
      steps: parsed.steps,
      indianBankingAdvice: parsed.indianBankingAdvice,
    };

    res.json({
      roadmap: profile.aiRoadmap,
    });
  } catch (err: any) {
    console.error('Error generating AI consultation:', err);
    res.status(500).json({ error: err.message || 'Failed to generate AI consultation' });
  }
});

// Interactive Shubham Vasu AI Credit Bot
app.post('/api/advisor/chat', async (req: Request, res: Response) => {
  if (aiUnavailable(res)) return;
  try {
    const { message, profileId, chatHistory } = req.body;
    const profile = dbProfiles.find((p) => p.id === profileId);

    const userContext = profile
      ? `Borrower Name: ${profile.name}
CIBIL Score: ${profile.cibilScore} (${profile.scoreCategory})
Monthly In-hand Income: ₹${profile.monthlyIncome.toLocaleString('en-IN')}
Total Debt: ₹${profile.calculatedMetrics.totalTotalDebt.toLocaleString('en-IN')}
Credit Card Utilization: ${profile.calculatedMetrics.creditUtilizationRatio}%
FOIR (Debt-to-Income): ${profile.calculatedMetrics.dtiRatio}%
Missed Payments: ${profile.missedPaymentsLast24Months}
Active Cards: ${profile.creditCards.map((c) => `${c.bankName}: ₹${c.currentBalance}/₹${c.creditLimit}`).join(', ') || 'None'}
Active Loans: ${profile.activeLoans.map((l) => `${l.lenderName} (${l.loanType}, EMI ₹${l.monthlyEMI})`).join(', ') || 'None'}`
      : 'Generic borrower inquiring about Indian credit systems';

    const systemPrompt = `You are Shubham Vasu, a premier Indian Credit & Financial Health Advisor bot.
You are articulate, practical, empowering, and deeply versed in Indian banking regulations (RBI guidelines), CIBIL / Experian reporting cycles (every 30-45 days), CIBIL dispute handling, FOIR calculation for home/personal loans, NACH mandates, difference between 'Closed' vs 'Settled' accounts, and tactical debt reduction (Avalanche vs Snowball method in ₹ INR).

Current User Context:
${userContext}

Rules:
- Address the user with empathy and concrete calculations in Indian Rupees (₹).
- If they ask about resolving high utilization, missed payments, loan pre-closure, or achieving 750+ score, give step-by-step guidance.
- Keep answers structured with bullet points or numbered advice where helpful, without generic fluff.
- Always sign off or present your advice as Shubham Vasu, Lead Credit Strategist.`;

    const formattedContents: any[] = [];
    if (chatHistory && Array.isArray(chatHistory)) {
      chatHistory.slice(-8).forEach((item: any) => {
        formattedContents.push({
          role: item.role === 'user' ? 'user' : 'model',
          parts: [{ text: item.content || item.text || '' }],
        });
      });
    }
    formattedContents.push({
      role: 'user',
      parts: [{ text: message || 'Hello Shubham, how can I improve my CIBIL score quickly?' }],
    });

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: formattedContents,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.7,
      },
    });

    res.json({
      reply: response.text || 'I am analyzing your credit file. Please give me a moment to review the CIBIL parameters.',
      advisor: 'Shubham Vasu',
    });
  } catch (err: any) {
    console.error('Error in Shubham Vasu bot chat:', err);
    res.status(500).json({ error: err.message || 'Failed to converse with Shubham Vasu bot' });
  }
});

// Scenario What-If Simulator API
app.post('/api/advisor/simulate', async (req: Request, res: Response) => {
  try {
    const { profileId, scenarioAction, amount } = req.body;
    const profile = dbProfiles.find((p) => p.id === profileId);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    const currentScore = profile.cibilScore;
    const currentMetrics = profile.calculatedMetrics;
    const amt = Number(amount) || 25000;

    let projectedScore = currentScore;
    let impactExplanation = '';
    let projectedUtilization = currentMetrics.creditUtilizationRatio;
    let projectedDTI = currentMetrics.dtiRatio;

    switch (scenarioAction) {
      case 'pay_credit_card': {
        const newCardDebt = Math.max(0, currentMetrics.totalCreditCardDebt - amt);
        projectedUtilization = currentMetrics.totalCreditLimit > 0
          ? Math.round((newCardDebt / currentMetrics.totalCreditLimit) * 100)
          : 0;
        const drop = currentMetrics.creditUtilizationRatio - projectedUtilization;
        const ptsGain = Math.min(50, Math.max(8, Math.round(drop * 0.8) + 10));
        projectedScore = Math.min(900, currentScore + ptsGain);
        impactExplanation = `Paying ₹${amt.toLocaleString('en-IN')} reduces credit card utilization from ${currentMetrics.creditUtilizationRatio}% down to ${projectedUtilization}%. In the Indian CIBIL algorithm, crossing under 30% generates an immediate boost of approximately +${ptsGain} points over 1-2 reporting cycles.`;
        break;
      }
      case 'preclose_personal_loan': {
        const closedEMI = profile.activeLoans.length > 0 ? profile.activeLoans[0].monthlyEMI : 10000;
        const newEMI = Math.max(0, currentMetrics.totalMonthlyEMI - closedEMI);
        projectedDTI = Math.round((newEMI / profile.monthlyIncome) * 100);
        const ptsGain = 20;
        projectedScore = Math.min(900, currentScore + ptsGain);
        impactExplanation = `Pre-closing high-interest personal loan frees up ₹${closedEMI.toLocaleString('en-IN')}/month in cash flow, lowering your FOIR from ${currentMetrics.dtiRatio}% to ${projectedDTI}%. This substantially improves your home loan eligibility with tier-1 lenders.`;
        break;
      }
      case 'card_limit_enhancement': {
        const newLimit = currentMetrics.totalCreditLimit + amt;
        projectedUtilization = Math.round((currentMetrics.totalCreditCardDebt / newLimit) * 100);
        const ptsGain = 14;
        projectedScore = Math.min(900, currentScore + ptsGain);
        impactExplanation = `Accepting a pre-approved credit limit increase of ₹${amt.toLocaleString('en-IN')} (without hard inquiry) dilutes your utilization to ${projectedUtilization}%, providing a safe +${ptsGain} point buffer.`;
        break;
      }
      case 'six_months_on_time': {
        const ptsGain = currentScore < 700 ? 38 : 22;
        projectedScore = Math.min(900, currentScore + ptsGain);
        impactExplanation = `Maintaining 100% on-time payment record across all credit lines for the next 6 consecutive billing cycles will age past historical 30-day DPD flags, restoring ~${ptsGain} points.`;
        break;
      }
      default: {
        projectedScore = currentScore + 15;
        impactExplanation = 'Disciplined debt reduction and zero inquiries will gradually trend your CIBIL score upward.';
      }
    }

    res.json({
      currentScore,
      projectedScore,
      delta: projectedScore - currentScore,
      projectedUtilization,
      projectedDTI,
      impactExplanation,
    });
  } catch (err: any) {
    console.error('Error simulating scenario:', err);
    res.status(500).json({ error: err.message || 'Failed to simulate scenario' });
  }
});

// Setup Vite middleware in dev or static serving in prod
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production' || process.argv.includes('--production');
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`Credit Assistant server running on http://localhost:${PORT}${hasApiKey ? '' : ' (AI features disabled: GEMINI_API_KEY missing)'}`);
  });
}

startServer();
