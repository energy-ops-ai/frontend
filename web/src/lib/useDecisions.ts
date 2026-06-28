import { useCallback, useEffect, useState } from 'react';
import { getDecisions, type Decision } from '@/lib/api';

// Decisions live outside the SSE stream — fetched over REST and refetched after
// a decision is recorded. Shared by the KPI strip and the insight cards.
export function useDecisions(sessionId: string) {
  const [decisions, setDecisions] = useState<Decision[]>([]);

  const refetch = useCallback(() => {
    getDecisions(sessionId)
      .then(setDecisions)
      .catch(() => {});
  }, [sessionId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { decisions, refetch };
}
