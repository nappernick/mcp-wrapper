// src/evals/Schemas.ts
import type { JSONSchemaType } from 'ajv';

interface CustomerFeedbackAnalysis {
  sentiment: 'positive' | 'negative' | 'neutral';
  key_issues: string[];
  action_items: {
    team: string;
    task: string;
  }[];
}

const CustomerFeedbackAnalysisSchema: JSONSchemaType<CustomerFeedbackAnalysis> = {
  type: 'object',
  properties: {
    sentiment: { type: 'string', enum: ['positive', 'negative', 'neutral'] },
    key_issues: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
    },
    action_items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          team: { type: 'string' },
          task: { type: 'string' },
        },
        required: ['team', 'task'],
        additionalProperties: false,
      },
      minItems: 1,
    },
  },
  required: ['sentiment', 'key_issues', 'action_items'],
  additionalProperties: false,
};

export { CustomerFeedbackAnalysisSchema };
export type { CustomerFeedbackAnalysis };