// Shared data types used by both the Express server and the React client.

export interface CreditCard {
  id: string;
  bankName: string;
  cardName: string;
  creditLimit: number;
  currentBalance: number;
  dueDate: string;
  aprPercent: number;
}

export interface ActiveLoan {
  id: string;
  lenderName: string;
  loanType: 'Personal Loan' | 'Home Loan' | 'Auto Loan' | 'Gold Loan' | 'Consumer Durable Loan' | 'Education Loan';
  isSecured: boolean;
  principalRemaining: number;
  monthlyEMI: number;
  interestRate: number;
  tenureMonthsRemaining: number;
}

export interface ScoreHistoryEntry {
  date: string;
  monthLabel: string;
  score: number;
  event?: string;
  utilization: number;
  dti: number;
}

export interface Bottleneck {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  currentValue: string;
  recommendedValue: string;
  impact: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  occupation: string;
  monthlyIncome: number;
  monthlyExpenses: number;
  cibilScore: number;
  scoreCategory: 'Poor' | 'Fair' | 'Good' | 'Excellent';
  creditCards: CreditCard[];
  activeLoans: ActiveLoan[];
  missedPaymentsLast24Months: number;
  hardInquiriesLast6Months: number;
  creditAgeYears: number;
  calculatedMetrics: {
    totalCreditLimit: number;
    totalCreditCardDebt: number;
    totalLoanDebt: number;
    totalTotalDebt: number;
    totalMonthlyEMI: number;
    creditUtilizationRatio: number;
    dtiRatio: number; // FOIR %
    discretionarySavings: number;
    securedDebt: number;
    unsecuredDebt: number;
    securedRatio: number;
    bottlenecks: Bottleneck[];
  };
  scoreHistory: ScoreHistoryEntry[];
  aiRoadmap?: {
    lastGeneratedAt: string;
    summary: string;
    cibilHealthGrade: string;
    bottleneckSummary: string;
    projectedScoreIn6Months: number;
    steps: Array<{
      stepNumber: number;
      title: string;
      description: string;
      category: 'Utilization' | 'Repayment' | 'Credit Mix' | 'DTI / FOIR' | 'Dispute / Bureau';
      potentialScoreImpact: number;
      timeframe: string;
      isCompleted?: boolean;
    }>;
    indianBankingAdvice: string;
  };
}

export interface ProfileSummary {
  id: string;
  name: string;
  email: string;
  cibilScore: number;
  scoreCategory: UserProfile['scoreCategory'];
  occupation: string;
  monthlyIncome: number;
  utilization: number;
  dtiRatio: number;
}

export interface BankOffer {
  id: string;
  bankName: string;
  bankLogoText: string;
  themeColor: string;
  badge: string;
  loanCategory: 'debt_consolidation' | 'gold_loan' | 'home_loan_balance_transfer' | 'personal_loan';
  productName: string;
  interestRateMin: number;
  interestRateMax: number;
  processingFee: string;
  minCibilScore: number;
  maxAmount: number;
  maxTenureMonths: number;
  features: string[];
  disbursalTime: string;
  partnerRating: number;
  officialApplyUrlNote: string;
}

export interface RefinanceResult {
  totalConsolidatedDebt: number;
  currentMonthlyObligation: number;
  refinancedMonthlyEMI: number;
  monthlySavings: number;
  annualSavings: number;
  lifetimeInterestSaved: number;
  currentBlendedInterestRate: number;
  refinancedRate: number;
  projectedCibilDelta: number;
}

export interface SimulationResult {
  currentScore: number;
  projectedScore: number;
  delta: number;
  projectedUtilization: number;
  projectedDTI: number;
  impactExplanation: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}
