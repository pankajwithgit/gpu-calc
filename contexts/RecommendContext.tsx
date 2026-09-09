'use client';

import * as React from 'react';
import type { RecommendResult } from '@/lib/api/recommend';

interface RecommendParams {
  model_path: string;
  system: string;
  isl: number;
  osl: number;
  ttft: number;
  tpot?: number;
  backend?: string;
  target_concurrency?: number;
  target_request_rate?: number;
  request_latency?: number;
  prefix?: number;
  model_config?: Record<string, unknown> | null;
}

interface RecommendState {
  params: RecommendParams | null;
  isLoading: boolean;
  result: RecommendResult | null;
  error: string | null;
  errorCode: string | null;
  elapsed: number;
  debugRequest: Record<string, unknown> | null;
  debugResponse: Record<string, unknown> | null;
  debugStatus: number | null;
  debugDuration: number | null;
  startSizing: (params: RecommendParams) => void;
  reset: () => void;
}

const RecommendContext = React.createContext<RecommendState>({
  params: null,
  isLoading: false,
  result: null,
  error: null,
  errorCode: null,
  elapsed: 0,
  debugRequest: null,
  debugResponse: null,
  debugStatus: null,
  debugDuration: null,
  startSizing: () => {},
  reset: () => {},
});

export function RecommendProvider({ children }: { children: React.ReactNode }) {
  const [params, setParams] = React.useState<RecommendParams | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [result, setResult] = React.useState<RecommendResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [errorCode, setErrorCode] = React.useState<string | null>(null);
  const [elapsed, setElapsed] = React.useState(0);
  const [debugRequest, setDebugRequest] = React.useState<Record<string, unknown> | null>(null);
  const [debugResponse, setDebugResponse] = React.useState<Record<string, unknown> | null>(null);
  const [debugStatus, setDebugStatus] = React.useState<number | null>(null);
  const [debugDuration, setDebugDuration] = React.useState<number | null>(null);

  const abortRef = React.useRef<AbortController | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = React.useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    if (!isLoading) { clearTimer(); return; }
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    return clearTimer;
  }, [isLoading, clearTimer]);

  const startSizing = React.useCallback((p: RecommendParams) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const requestBody: Record<string, unknown> = {
      model_path: p.model_path,
      system: p.system,
      isl: p.isl,
      osl: p.osl,
      ttft: p.ttft,
      tpot: p.tpot ?? 30,
      target_concurrency: p.target_concurrency ?? 32,
    };
    if (p.backend) requestBody.backend = p.backend;
    if (p.target_request_rate != null) {
      delete requestBody.target_concurrency;
      requestBody.target_request_rate = p.target_request_rate;
    }
    if (p.request_latency != null) requestBody.request_latency = p.request_latency;
    if (p.prefix != null && p.prefix > 0) requestBody.prefix = p.prefix;
    if (p.model_config != null) requestBody.model_config = p.model_config;

    setParams(p);
    setIsLoading(true);
    setResult(null);
    setError(null);
    setErrorCode(null);
    setDebugRequest(requestBody);
    setDebugResponse(null);
    setDebugStatus(null);
    setDebugDuration(null);

    const t0 = performance.now();

    fetch('/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    })
      .then(res => {
        if (!controller.signal.aborted) {
          setDebugStatus(res.status);
        }
        return res.json();
      })
      .then(data => {
        if (controller.signal.aborted) return;
        setDebugResponse(data as Record<string, unknown>);
        setDebugDuration(Math.round(performance.now() - t0));
        if (data.status === 'failed') {
          setError(data.error?.message || 'Unknown error');
          setErrorCode(data.error?.code || 'UNKNOWN');
        } else {
          setResult(data as RecommendResult);
        }
      })
      .catch(err => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setDebugDuration(Math.round(performance.now() - t0));
        setError(err instanceof Error ? err.message : 'Network error');
        setErrorCode('NETWORK_ERROR');
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
  }, []);

  const reset = React.useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setIsLoading(false);
    setResult(null);
    setError(null);
    setErrorCode(null);
    setElapsed(0);
    setParams(null);
    setDebugRequest(null);
    setDebugResponse(null);
    setDebugStatus(null);
    setDebugDuration(null);
  }, []);

  const value = React.useMemo<RecommendState>(
    () => ({ params, isLoading, result, error, errorCode, elapsed, debugRequest, debugResponse, debugStatus, debugDuration, startSizing, reset }),
    [params, isLoading, result, error, errorCode, elapsed, debugRequest, debugResponse, debugStatus, debugDuration, startSizing, reset]
  );

  return (
    <RecommendContext.Provider value={value}>
      {children}
    </RecommendContext.Provider>
  );
}

export function useRecommend(): RecommendState {
  return React.useContext(RecommendContext);
}
