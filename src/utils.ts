export const formatINR = (value: number): string =>
  `₹${Math.round(value || 0).toLocaleString('en-IN')}`;

export const scoreColor = (score: number): string => {
  if (score >= 750) return '#16a34a';
  if (score >= 680) return '#65a30d';
  if (score >= 600) return '#d97706';
  return '#dc2626';
};

export const categoryBadge = (category: string): string => {
  switch (category) {
    case 'Excellent':
      return 'bg-green-100 text-green-800';
    case 'Good':
      return 'bg-lime-100 text-lime-800';
    case 'Fair':
      return 'bg-amber-100 text-amber-800';
    default:
      return 'bg-red-100 text-red-800';
  }
};
