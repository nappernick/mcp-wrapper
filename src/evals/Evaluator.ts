// src/evals/Evaluator.ts
import Ajv from 'ajv';
import type { JSONSchemaType } from 'ajv';
import logger from '../utils/Logger';

interface EvaluationResult {
  prompt: string;
  expected: any;
  actual: any;
  passed: boolean;
  errors?: string[];
}

class Evaluator {
  private ajv: Ajv;

  constructor() {
    this.ajv = new Ajv();
  }

  /**
   * Validates the actual response against the expected JSON schema.
   * @param schema JSON schema defining the expected format.
   * @param actual The actual response from the LLM.
   */
  validateSchema<T>(schema: JSONSchemaType<T>, actual: any): { valid: boolean; errors?: string[] } {
    const validate = this.ajv.compile(schema);
    const valid = validate(actual);
    if (!valid) {
      const errors = validate.errors?.map(err => `${err.instancePath} ${err.message}`) || [];
      return { valid: false, errors };
    }
    return { valid: true };
  }

  /**
   * Compares the actual response with the expected response.
   * @param expected The expected response.
   * @param actual The actual response.
   */
  compareResponses(expected: any, actual: any): { passed: boolean; errors?: string[] } {
    const errors: string[] = [];
    
    // Check structure matches
    if (typeof expected !== typeof actual) {
      return { passed: false, errors: [`Type mismatch: expected ${typeof expected} but got ${typeof actual}`] };
    }

    // For objects (including arrays)
    if (typeof expected === 'object') {
      // Check if all expected keys exist in actual
      for (const key of Object.keys(expected)) {
        if (!(key in actual)) {
          errors.push(`Missing key: ${key}`);
          continue;
        }

        // For arrays, check length and type of elements
        if (Array.isArray(expected[key])) {
          if (!Array.isArray(actual[key])) {
            errors.push(`${key} should be an array`);
            continue;
          }
          
          // For action_items, check that each item has required fields
          if (key === 'action_items') {
            const missingFields = actual[key].filter((item: any) => 
              !item.team || !item.task
            );
            if (missingFields.length > 0) {
              errors.push(`Some action items are missing required fields (team/task)`);
            }
          }
        }

        // For sentiment, check it's one of the allowed values
        if (key === 'sentiment') {
          const allowedValues = ['positive', 'negative', 'neutral'];
          if (!allowedValues.includes(actual[key])) {
            errors.push(`Invalid sentiment value: ${actual[key]}`);
          }
        }
      }
    }

    return {
      passed: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Runs an evaluation.
   * @param prompt The prompt sent to the LLM.
   * @param expected The expected response object.
   * @param actual The actual LLM response.
   * @param schema Optional JSON schema for format validation.
   */
  runEvaluation(prompt: string, expected: any, actual: any, schema?: object): EvaluationResult {
    let passed = true;
    const errors: string[] = [];

    if (schema) {
      const validation = this.validateSchema(schema as JSONSchemaType<any>, actual);
      if (!validation.valid) {
        passed = false;
        errors.push(...(validation.errors || []));
      }
    }

    // Compare responses
    const comparison = this.compareResponses(expected, actual);
    if (!comparison.passed) {
      passed = false;
      errors.push(...(comparison.errors || []));
    }

    return {
      prompt,
      expected,
      actual,
      passed,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}

export default Evaluator;
export type { EvaluationResult };