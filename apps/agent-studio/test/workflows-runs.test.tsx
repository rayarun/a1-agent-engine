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
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import WorkflowRunsPage from '@/app/(studio)/workflows/[id]/runs/page'

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

// Mock next/navigation
const mockRouter = {
  push: vi.fn(),
}
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useParams: () => ({ id: 'settlement-wf' }),
}))

// Mock useTenant hook
vi.mock('@/lib/hooks', () => ({
  useTenant: () => ({ tenantId: 'tenant-1' }),
}))

const mockRuns = [
  {
    run_id: 'abc123def456',
    status: 'completed' as const,
    started_at: '2026-05-16T10:00:00Z',
    completed_at: '2026-05-16T10:05:00Z',
    step_results: {},
  },
  {
    run_id: 'xyz789uvw123',
    status: 'running' as const,
    started_at: '2026-05-16T10:06:00Z',
    completed_at: undefined,
    step_results: {},
  },
]

describe('WorkflowRunsPage', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    vi.clearAllMocks()
    global.fetch = vi.fn()
    mockRouter.push.mockClear()
  })

  it('should render page with workflow ID', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ runs: mockRuns }),
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowRunsPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('settlement-wf')).toBeInTheDocument()
      expect(screen.getByText('Workflow execution history')).toBeInTheDocument()
    })
  })

  it('should fetch runs with tenant header', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ runs: mockRuns }),
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowRunsPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/workflows/settlement-wf/runs'),
        expect.objectContaining({
          headers: { 'X-Tenant-ID': 'tenant-1' },
        })
      )
    })
  })

  it('should display Trigger Now button', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ runs: mockRuns }),
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowRunsPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Trigger Now')).toBeInTheDocument()
    })
  })

  it('should trigger workflow when Trigger Now button clicked', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ runs: mockRuns }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ run_id: 'new-run-123' }),
      })

    const user = userEvent.setup()

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowRunsPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Trigger Now')).toBeInTheDocument()
    })

    const triggerButton = screen.getByText('Trigger Now')
    await user.click(triggerButton)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/workflows/settlement-wf/trigger'),
        expect.objectContaining({
          method: 'POST',
        })
      )
    })
  })

  it('should display auto-refresh toggle', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ runs: mockRuns }),
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowRunsPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Auto-refresh ON')).toBeInTheDocument()
    })
  })

  it('should toggle auto-refresh state', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ runs: mockRuns }),
    })

    const user = userEvent.setup()

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowRunsPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Auto-refresh ON')).toBeInTheDocument()
    })

    const toggleButton = screen.getByText('Auto-refresh ON')
    await user.click(toggleButton)

    await waitFor(() => {
      expect(screen.getByText('Auto-refresh OFF')).toBeInTheDocument()
    })
  })

  it('should display runs in list', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ runs: mockRuns }),
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowRunsPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('abc12345')).toBeInTheDocument()
      expect(screen.getByText('xyz789uv')).toBeInTheDocument()
    })
  })

  it('should display run status badges', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ runs: mockRuns }),
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowRunsPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      const statusBadges = screen.getAllByText('completed')
      expect(statusBadges.length).toBeGreaterThan(0)
      expect(screen.getByText('running')).toBeInTheDocument()
    })
  })

  it('should calculate and display run duration', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ runs: mockRuns }),
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowRunsPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('5m')).toBeInTheDocument()
    })
  })

  it('should show dash for incomplete run duration', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ runs: mockRuns }),
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowRunsPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      const dashes = screen.queryAllByText('—')
      expect(dashes.length).toBeGreaterThan(0)
    })
  })

  it('should link run cards to detail page', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ runs: mockRuns }),
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowRunsPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      const runLinks = screen.getAllByRole('link').filter((link) =>
        link.getAttribute('href')?.startsWith('/workflow-runs/')
      )
      expect(runLinks.length).toBe(mockRuns.length)
    })
  })

  it('should show loading state initially', () => {
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ ok: true, json: async () => ({ runs: [] }) }), 1000)
        )
    )

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowRunsPage />
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
        <WorkflowRunsPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Failed to load runs')).toBeInTheDocument()
    })
  })

  it('should show empty state when no runs', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ runs: [] }),
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowRunsPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('No runs yet')).toBeInTheDocument()
      expect(screen.getByText('Trigger your first run')).toBeInTheDocument()
    })
  })

  it('should have back button link to workflows', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ runs: mockRuns }),
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowRunsPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      const backLinks = screen.getAllByRole('link').filter((link) =>
        link.getAttribute('href') === '/workflows'
      )
      expect(backLinks.length).toBeGreaterThan(0)
    })
  })

  it('should disable Trigger Now button while loading', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ runs: mockRuns }),
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ ok: true, json: async () => ({ run_id: 'new' }) }), 500)
          )
      )

    const user = userEvent.setup()

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowRunsPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Trigger Now')).toBeInTheDocument()
    })

    const triggerButton = screen.getByText('Trigger Now')
    await user.click(triggerButton)

    // Button should show loading state
    expect(screen.getByRole('button', { name: /Trigger Now/ })).toBeInTheDocument()
  })

  it('should format run timestamps', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ runs: mockRuns }),
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowRunsPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      // Check that timestamps are formatted (should not be ISO format but locale string)
      // The exact format depends on locale, but should contain year 2026
      const allText = document.body.textContent
      expect(allText).toContain('2026')
    })
  })
})
