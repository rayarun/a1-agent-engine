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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import WorkflowsPage from '@/app/(studio)/workflows/page'

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

// Mock next/navigation
const mockRouter = {
  push: vi.fn(),
  back: vi.fn(),
}
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useParams: () => ({}),
}))

// Mock useTenant hook
vi.mock('@/lib/hooks', () => ({
  useTenant: () => ({ tenantId: 'tenant-1' }),
}))

const mockWorkflows = [
  {
    id: 'wf-1',
    name: 'Settlement Report',
    description: 'Daily settlement report generation',
    workflow_type: 'yaml' as const,
    task_queue: 'platform-hybrid-queue',
    status: 'active' as const,
    trigger_type: 'cron' as const,
    created_at: '2026-05-16T10:00:00Z',
  },
  {
    id: 'wf-2',
    name: 'KYC Verification',
    description: 'Customer KYC workflow',
    workflow_type: 'code' as const,
    task_queue: 'acme-queue',
    status: 'active' as const,
    trigger_type: 'webhook' as const,
    created_at: '2026-05-15T10:00:00Z',
  },
]

describe('WorkflowsPage', () => {
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

  it('should render page title and header', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ workflows: mockWorkflows }),
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowsPage />
      </QueryClientProvider>
    )

    expect(screen.getByText('Workflows')).toBeInTheDocument()
    expect(screen.getByText('Create and manage hybrid Temporal workflows')).toBeInTheDocument()
  })

  it('should fetch workflows with tenant header', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ workflows: mockWorkflows }),
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowsPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/workflows?status=active'),
        expect.objectContaining({
          headers: { 'X-Tenant-ID': 'tenant-1' },
        })
      )
    })
  })

  it('should display workflows in grid', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ workflows: mockWorkflows }),
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowsPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Settlement Report')).toBeInTheDocument()
      expect(screen.getByText('KYC Verification')).toBeInTheDocument()
      expect(screen.getByText('Daily settlement report generation')).toBeInTheDocument()
    })
  })

  it('should display workflow type badges', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ workflows: mockWorkflows }),
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowsPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('yaml')).toBeInTheDocument()
      expect(screen.getByText('code')).toBeInTheDocument()
    })
  })

  it('should display status badges', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ workflows: mockWorkflows }),
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowsPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      const activeBadges = screen.getAllByText('active')
      expect(activeBadges.length).toBeGreaterThan(0)
    })
  })

  it('should display trigger type icons', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ workflows: mockWorkflows }),
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowsPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('cron')).toBeInTheDocument()
      expect(screen.getByText('webhook')).toBeInTheDocument()
    })
  })

  it('should display task queue information', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ workflows: mockWorkflows }),
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowsPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Queue: platform-hybrid-queue')).toBeInTheDocument()
      expect(screen.getByText('Queue: acme-queue')).toBeInTheDocument()
    })
  })

  it('should render status filter buttons', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ workflows: mockWorkflows }),
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowsPage />
      </QueryClientProvider>
    )

    expect(screen.getByText('All')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Paused')).toBeInTheDocument()
    expect(screen.getByText('Archived')).toBeInTheDocument()
  })

  it('should change filter when status button clicked', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ workflows: mockWorkflows }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ workflows: [] }),
      })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowsPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Settlement Report')).toBeInTheDocument()
    })

    const pausedButton = screen.getByText('Paused')
    fireEvent.click(pausedButton)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('status=paused'),
        expect.any(Object)
      )
    })
  })

  it('should show loading state', () => {
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ ok: true, json: async () => ({ workflows: [] }) }), 1000)
        )
    )

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowsPage />
      </QueryClientProvider>
    )

    // Check for loading spinner
    const spinner = document.querySelector('svg.animate-spin')
    expect(spinner).toBeTruthy()
  })

  it('should show error state when fetch fails', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowsPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Failed to load workflows')).toBeInTheDocument()
    })
  })

  it('should show empty state when no workflows', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ workflows: [] }),
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowsPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('No workflows yet')).toBeInTheDocument()
      expect(screen.getByText('Create your first workflow')).toBeInTheDocument()
    })
  })

  it('should have New Workflow button that navigates', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ workflows: mockWorkflows }),
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowsPage />
      </QueryClientProvider>
    )

    const newWorkflowButtons = screen.getAllByText('New Workflow')
    expect(newWorkflowButtons.length).toBeGreaterThan(0)

    newWorkflowButtons.forEach((btn) => {
      expect(btn.closest('a')).toHaveAttribute('href', '/workflows/new')
    })
  })

  it('should have workflow card links to run history', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ workflows: mockWorkflows }),
    })

    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowsPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      const wf1Card = screen.getByText('Settlement Report').closest('a')
      expect(wf1Card).toHaveAttribute('href', '/workflows/wf-1/runs')

      const wf2Card = screen.getByText('KYC Verification').closest('a')
      expect(wf2Card).toHaveAttribute('href', '/workflows/wf-2/runs')
    })
  })
})
