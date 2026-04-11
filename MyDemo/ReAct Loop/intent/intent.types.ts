export interface IntentResult {
  intent: 'rag' | 'agent' | 'db';
  confidence: number;
  reason: string;
}
