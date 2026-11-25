export interface CopilotTable {
  columns: string[];
  rows: string[][];
}

export interface CopilotAnswer {
  answer: string;
  intent: string;
  sources: string[];
  table: CopilotTable | null;
  product_id: string | null;
  suggestions: string[];
}
