// Copyright 2026 Arun Ray
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import WorkflowRunPage from '@/app/workflow-runs/[id]/page'

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'run-abc123def456' }),
}))

// Mock useTenant hook
vi.mock('@/lib/hooks', () => ({
  useTenant: () => ({ tenantId: 'tenant-1' }),
}))

const mockRun = {
  run_id: 'abc123def456',
  workflow_id: 'settlement-wf',
  status: 'completed' as const,
  step_results: {
    'fetch-trades': {
      status: 'completed',
      output: { count: 100, trades: [{ id: 'T1', symbol: 'INFY' }] },
      duration_ms: 1500,
    },
    'analyze-risk': {
      status: 'completed',
      output: { risk_level: 'low', score: 25 },
      duration_ms: 3000,
    },
    'send-email': {
      status: 'completed',
      output: { sent: true },
      duration_ms: 500,
    },
  },
  output: { status: 'completed', message: 'Workflow executed successfully' },
  started_at: '2026-05-16T10:00:00Z',
  completed_at: '2026-05-16T10:05:00Z',
}

const mockRunWithError = {
  run_id: 'xyz789uvw123',
  workflow_id: 'settlement-wf',
  status: 'failed' as const,
  step_results: {
    'fetch-trades': {
      status: 'completed',
      output: { count: 0 },
      duration_ms: 1000,
    },
    'validate-trades': {
      status: 'failed',
      error: 'No trades found for date 2026-05-16',
      duration_ms: 500,
    },
  },
  error: 'Workflow failed at step validate-trades',
  started_at: '2026-05-16T11:00:00Z',
  completed_at: '2026-05-16T11:02:00Z',
}

describe('WorkflowRunPage', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  it('should render page with run ID', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockRun,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowRunPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('abc123de...')).toBeInTheDocument()
    })
  })

  it('should fetch run with tenant header', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockRun,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowRunPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/workflow-runs/run-abc123def456'),
        expect.objectContaining({
          headers: { 'X-Tenant-ID': 'tenant-1' },
        })
      )
    })
  })

  it('should display status overview grid', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockRun,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowRunPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Status')).toBeInTheDocument()
      expect(screen.getByText('Started')).toBeInTheDocument()
      expect(screen.getByText('Completed')).toBeInTheDocument()
      expect(screen.getByText('Steps')).toBeInTheDocument()
    })
  })

  it('should display run status badge', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockRun,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowRunPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('completed')).toBeInTheDocument()
    })
  })

  it('should display execution steps section', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockRun,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowRunPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Execution Steps')).toBeInTheDocument()
      expect(screen.getByText('fetch-trades')).toBeInTheDocument()
      expect(screen.getByText('analyze-risk')).toBeInTheDocument()
      expect(screen.getByText('send-email')).toBeInTheDocument()
    })
  })

  it('should display step status badges', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockRun,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowRunPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      const completedBadges = screen.getAllByText('completed')
      expect(completedBadges.length).toBeGreaterThan(0)
    })
  })

  it('should display step duration', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockRun,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowRunPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Duration: 1500ms')).toBeInTheDocument()
      expect(screen.getByText('Duration: 3000ms')).toBeInTheDocument()
    })
  })

  it('should display step output as JSON', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockRun,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowRunPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Output')).toBeInTheDocument()
      // Check that JSON is rendered (formatted with indentation)
      expect(screen.getByText(expect.stringContaining('count'))).toBeInTheDocument()
    })
  })

  it('should display final output section', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockRun,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowRunPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Final Output')).toBeInTheDocument()
      expect(screen.getByText(expect.stringContaining('Workflow executed successfully'))).toBeInTheDocument()
    })
  })

  it('should display error section when run failed', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockRunWithError,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowRunPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument()
      expect(screen.getByText('Workflow failed at step validate-trades')).toBeInTheDocument()
    })
  })

  it('should display failed step error message', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockRunWithError,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowRunPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('No trades found for date 2026-05-16')).toBeInTheDocument()
    })
  })

  it('should display failed step with error badge', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockRunWithError,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowRunPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      const failedBadges = screen.getAllByText('failed')
      expect(failedBadges.length).toBeGreaterThan(0)
    })
  })

  it('should count steps correctly', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockRun,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowRunPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument() // 3 steps
    })
  })

  it('should show DAG visualization tip', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockRun,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowRunPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText(expect.stringContaining('DAG visualization'))).toBeInTheDocument()
      expect(screen.getByText(expect.stringContaining('Phase D'))).toBeInTheDocument()
    })
  })

  it('should show loading state initially', () => {
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ ok: true, json: async () => mockRun }), 1000)
        )
    )

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowRunPage />
      </QueryClientProvider>
    )

    const spinners = document.querySelectorAll('svg.animate-spin')
    expect(spinners.length).toBeGreaterThan(0)
  })

  it('should show error state when fetch fails', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowRunPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Failed to load workflow run')).toBeInTheDocument()
      expect(screen.getByText('Back to Workflows')).toBeInTheDocument()
    })
  })

  it('should have back link to workflow runs', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockRun,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowRunPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      const backLink = screen.getAllByRole('link').find((link) =>
        link.getAttribute('href')?.includes('/workflows/settlement-wf/runs')
      )
      expect(backLink).toBeInTheDocument()
    })
  })

  it('should display workflow ID in breadcrumb', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockRun,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowRunPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText(expect.stringContaining('settlement-wf'))).toBeInTheDocument()
    })
  })

  it('should format dates in status overview', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockRun,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowRunPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      // Check that dates are formatted (should contain the year 2026)
      const allText = document.body.textContent
      expect(allText).toContain('2026')
    })
  })

  it('should show empty message for runs with no steps', async () => {
    const emptyRun = { ...mockRun, step_results: {} }

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => emptyRun,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowRunPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('No steps executed yet')).toBeInTheDocument()
    })
  })

  it('should show dash for missing completed time', async () => {
    const runningRun = { ...mockRun, status: 'running', completed_at: undefined }

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => runningRun,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowRunPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      const dashes = screen.queryAllByText('—')
      expect(dashes.length).toBeGreaterThan(0)
    })
  })

  it('should render JSON with proper formatting', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockRun,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowRunPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      // Find pre blocks that contain JSON
      const preBlocks = screen.getAllByRole('region')
      expect(preBlocks.length).toBeGreaterThan(0)
    })
  })
})
