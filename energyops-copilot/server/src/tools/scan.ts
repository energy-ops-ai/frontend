// Generic discovery tools. These don't replace query_data — they encode robust
// default methods so detection is consistent and still works when the dataset
// has no expected_value column (statistical baseline fallback).

import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { scanAnomalies, scanDataQuality } from '../db/scan.js';

const jsonText = (obj: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(obj, null, 2) }]
});

export const scanTools = [
  tool(
    'scan_anomalies',
    'Rank where the dataset is behaving unusually, scenario-blind, across a time range. Method "auto" uses deviation-from-expected if the data has it, otherwise a per-sensor statistical baseline (z-score). Returns a ranked shortlist of (sensor, peak time, magnitude). Use this to find what to investigate, then drill in with query_data.',
    {
      from: z.string().optional().describe('ISO start (default: full range)'),
      to: z.string().optional().describe('ISO end'),
      sensorIds: z
        .array(z.number())
        .optional()
        .describe('Limit to these sensor ids (default: all)'),
      method: z.enum(['auto', 'expected', 'baseline']).optional(),
      limit: z.number().int().positive().max(50).optional()
    },
    async input => jsonText(await scanAnomalies(input))
  ),

  tool(
    'scan_data_quality',
    'Find data-quality problems generically: flatlined/stale sensors and missing-data gaps over a time range. Use this to decide whether something is a real event or a data issue.',
    {
      from: z.string().optional(),
      to: z.string().optional(),
      sensorIds: z.array(z.number()).optional()
    },
    async input => jsonText(await scanDataQuality(input))
  )
];
