import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { UserProfile } from './types.ts';

// jsPDF's built-in fonts have no ₹ glyph, so the report uses "Rs."
const inr = (v: number) => `Rs. ${Math.round(v || 0).toLocaleString('en-IN')}`;

export function exportReport(profile: UserProfile): void {
  const doc = new jsPDF();
  const m = profile.calculatedMetrics;

  doc.setFontSize(18);
  doc.text('Credit Health Report', 14, 18);
  doc.setFontSize(10);
  doc.text(`${profile.name} | ${profile.occupation}`, 14, 25);
  doc.text(`Generated on ${new Date().toLocaleDateString('en-IN')}`, 14, 30);

  autoTable(doc, {
    startY: 36,
    head: [['Metric', 'Value']],
    body: [
      ['CIBIL score', `${profile.cibilScore} (${profile.scoreCategory})`],
      ['Monthly income', inr(profile.monthlyIncome)],
      ['Total debt', inr(m.totalTotalDebt)],
      ['Monthly EMIs', inr(m.totalMonthlyEMI)],
      ['Credit utilization', `${m.creditUtilizationRatio}%`],
      ['FOIR / DTI', `${m.dtiRatio}%`],
      ['Missed payments (24 months)', String(profile.missedPaymentsLast24Months)],
      ['Hard inquiries (6 months)', String(profile.hardInquiriesLast6Months)],
    ],
  });

  const afterMetrics = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 100;

  if (m.bottlenecks.length > 0) {
    autoTable(doc, {
      startY: afterMetrics + 8,
      head: [['Bottleneck', 'Current', 'Target']],
      body: m.bottlenecks.map((b) => [b.title, b.currentValue, b.recommendedValue]),
    });
  }

  const roadmap = profile.aiRoadmap;
  if (roadmap) {
    const y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? afterMetrics;
    autoTable(doc, {
      startY: y + 8,
      head: [['Step', 'Action', 'Timeframe', 'Impact']],
      body: roadmap.steps.map((s) => [String(s.stepNumber), `${s.title}: ${s.description}`, s.timeframe, `+${s.potentialScoreImpact}`]),
      columnStyles: { 1: { cellWidth: 100 } },
    });
  }

  doc.save(`credit-report-${profile.name.replace(/\s+/g, '-').toLowerCase()}.pdf`);
}
