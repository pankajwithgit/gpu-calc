// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({
    hydrated: true,
    hfToken: '',
    defaultModel: 'settings/default-model',
    inferenceBackend: 'vllm',
    backendVersion: 'latest',
  }),
}));

vi.mock('@/lib/app-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/app-config')>();
  return {
    ...actual,
    getAppConfig: () => ({
      ...actual.getAppConfig(),
      defaultSystem: 'retired_gpu',
    }),
  };
});

vi.mock('@/lib/hooks/useAicCatalog', () => ({
  useAicCatalog: () => ({
    gpuOptions: [
      { systemId: 'h200_sxm', displayName: 'NVIDIA H200', vramGb: 141 },
      { systemId: 'h100_sxm', displayName: 'NVIDIA H100', vramGb: 80 },
    ],
    modelOptions: ['Qwen/Qwen2.5-7B-Instruct', 'settings/default-model'],
    modelSpecs: new Map(),
    isLoading: false,
  }),
}));

vi.mock('@/components/ui/ModelInput', () => ({
  ModelInput: ({ id, model, onChange }: { id: string; model: string; onChange: (value: string) => void }) => (
    <label>Model<input id={id} aria-label="Model" value={model} onChange={(event) => onChange(event.target.value)} /></label>
  ),
}));

vi.mock('@/components/ModelComboBox/ModelComboBox', () => ({
  ComboBox: ({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) => (
    <label>Model<input id={id} aria-label="Model" value={value} onChange={(event) => onChange(event.target.value)} /></label>
  ),
}));

vi.mock('@/components/ui/GpuSystemInput', () => ({
  GpuSystemInput: ({ id, value, onChange, gpuOptions }: {
    id: string;
    value: string;
    onChange: (value: string) => void;
    gpuOptions: Array<{ systemId: string; displayName: string }>;
  }) => (
    <label>GPU<select id={id} aria-label="GPU system" value={value} onChange={(event) => onChange(event.target.value)}>
      {gpuOptions.map((gpu) => <option key={gpu.systemId} value={gpu.systemId}>{gpu.displayName}</option>)}
    </select></label>
  ),
}));

vi.mock('./quickEstimateHelpers', () => ({
  Term: ({ children }: React.PropsWithChildren) => <>{children}</>,
  FlipTile: ({ children }: React.PropsWithChildren) => <>{children}</>,
  Sparkline: () => null,
  useCountUp: (value: number) => value,
}));
vi.mock('@/components/ProductTour', () => ({ ProductTour: () => null }));
vi.mock('./SaveEstimateModal', () => ({ SaveEstimateModal: () => null }));
vi.mock('@/components/GpuChipLoader/GpuChipLoader', () => ({ GpuChipLoader: () => null }));
vi.mock('@/components/ui/InfoStrip', () => ({
  InfoStrip: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  InfoStripAction: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));

import PerformanceEstimate from './PerformanceEstimate';

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => {
      if (key.includes('saved-estimates')) return '[]';
      return 'seen';
    }),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  });
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({ data: [] }),
  })));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  window.history.replaceState({}, '', '/performance');
  vi.unstubAllGlobals();
});

async function mountAt(search: string) {
  window.history.replaceState({}, '', `/performance${search}`);
  await act(async () => {
    root.render(<PerformanceEstimate />);
    await Promise.resolve();
  });
  return {
    model: container.querySelector<HTMLInputElement>('#qe-model'),
    gpu: container.querySelector<HTMLSelectElement>('#qe-gpu'),
  };
}

describe('performance page widget handoff', () => {
  it('hydrates both destination controls without settings overwriting the model', async () => {
    const { model, gpu } = await mountAt(
      '?model=Qwen%2FQwen2.5-7B-Instruct&system=h100_sxm',
    );
    expect(model?.value).toBe('Qwen/Qwen2.5-7B-Instruct');
    expect(gpu?.value).toBe('h100_sxm');
  });

  it('ignores invalid handoff values and uses safe page defaults', async () => {
    const { model, gpu } = await mountAt('?model=javascript%3Aalert(1)&system=h200%20sxm');
    expect(model?.value).toBe('settings/default-model');
    expect(gpu?.value).toBe('h200_sxm');
  });
});
