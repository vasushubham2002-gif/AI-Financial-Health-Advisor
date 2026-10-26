import type {
  BankOffer,
  ChatMessage,
  ProfileSummary,
  RefinanceResult,
  SimulationResult,
  UserProfile,
} from './types.ts';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

const post = <T>(url: string, body: unknown) =>
  request<T>(url, { method: 'POST', body: JSON.stringify(body) });

export const api = {
  listProfiles: () => request<{ profiles: ProfileSummary[] }>('/api/profiles').then((r) => r.profiles),

  getProfile: (id: string) => request<{ profile: UserProfile }>(`/api/profiles/${id}`).then((r) => r.profile),

  createProfile: (data: unknown) =>
    post<{ profile: UserProfile }>('/api/profiles', data).then((r) => r.profile),

  payDebt: (id: string, body: { type: 'card' | 'loan'; itemId: string; amountPaid: number; closeAccount?: boolean }) =>
    post<{ delta: number; newScore: number; profile: UserProfile }>(`/api/profiles/${id}/pay-debt`, body),

  analyze: (profileId: string) =>
    post<{ roadmap: NonNullable<UserProfile['aiRoadmap']> }>('/api/advisor/analyze', { profileId }).then(
      (r) => r.roadmap,
    ),

  chat: (message: string, profileId: string, chatHistory: ChatMessage[]) =>
    post<{ reply: string }>('/api/advisor/chat', { message, profileId, chatHistory }).then((r) => r.reply),

  simulate: (profileId: string, scenarioAction: string, amount: number) =>
    post<SimulationResult>('/api/advisor/simulate', { profileId, scenarioAction, amount }),

  bankOffers: (params: { category?: string; minCibil?: number; sort?: string }) => {
    const qs = new URLSearchParams();
    if (params.category) qs.set('category', params.category);
    if (params.minCibil) qs.set('minCibil', String(params.minCibil));
    if (params.sort) qs.set('sort', params.sort);
    return request<{ offers: BankOffer[] }>(`/api/bank-offers?${qs.toString()}`).then((r) => r.offers);
  },

  refinance: (body: {
    debtItems: Array<{ amount: number; rate: number; monthlyPayment: number; type?: string }>;
    targetRate: number;
    tenureMonths: number;
  }) => post<RefinanceResult>('/api/bank-offers/refinance-simulate', body),
};
