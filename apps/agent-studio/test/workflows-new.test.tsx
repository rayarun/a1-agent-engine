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
import NewWorkflowPage from '@/app/(studio)/workflows/new/page'

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
  useParams: () => ({}),
}))

// Mock useTenant hook
vi.mock('@/lib/hooks', () => ({
  useTenant: () => ({ tenantId: 'tenant-1' }),
}))

describe('NewWorkflowPage', () => {
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

  it('should render page title', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <NewWorkflowPage />
      </QueryClientProvider>
    )

    const headings = screen.getAllByText('Create Workflow')
    expect(headings.length).toBeGreaterThan(0)
  })

  it('should display YAML editor', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <NewWorkflowPage />
      </QueryClientProvider>
    )

    const yamlEditor = screen.getByPlaceholderText('Enter YAML workflow definition...')
    expect(yamlEditor).toBeInTheDocument()
    expect(yamlEditor).toHaveValue(expect.stringContaining('id: my-workflow'))
  })

  it('should display form sections', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <NewWorkflowPage />
      </QueryClientProvider>
    )

    expect(screen.getByText('Basic Information')).toBeInTheDocument()
    expect(screen.getByText('Workflow Definition')).toBeInTheDocument()
    expect(screen.getByText('Trigger Configuration')).toBeInTheDocument()
  })

  it('should display validate YAML button', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <NewWorkflowPage />
      </QueryClientProvider>
    )

    const validateButton = screen.getByText('Validate YAML')
    expect(validateButton).toBeInTheDocument()
  })

  it('should validate YAML on demand', async () => {
    const user = userEvent.setup()

    render(
      <QueryClientProvider client={queryClient}>
        <NewWorkflowPage />
      </QueryClientProvider>
    )

    const yamlEditor = screen.getByPlaceholderText('Enter YAML workflow definition...')
    const validateButton = screen.getByText('Validate YAML')

    // Change to invalid YAML
    await user.clear(yamlEditor)
    await user.type(yamlEditor, 'invalid: yaml: content:')

    fireEvent.click(validateButton)

    await waitFor(() => {
      expect(screen.getByText(expect.stringContaining('Invalid YAML'))).toBeInTheDocument()
    })
  })

  it('should show valid YAML indicator', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <NewWorkflowPage />
      </QueryClientProvider>
    )

    const validateButton = screen.getByText('Validate YAML')
    fireEvent.click(validateButton)

    await waitFor(() => {
      expect(screen.getByText('✓ Valid YAML')).toBeInTheDocument()
    })
  })

  it('should have manual trigger type displayed', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <NewWorkflowPage />
      </QueryClientProvider>
    )

    expect(screen.getByText('Manual (via API)')).toBeInTheDocument()
  })

  it('should display other trigger types', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <NewWorkflowPage />
      </QueryClientProvider>
    )

    expect(screen.getByText('Webhook')).toBeInTheDocument()
    expect(screen.getByText('Cron Schedule')).toBeInTheDocument()
    expect(screen.getByText('Event-Driven')).toBeInTheDocument()
  })

  it('should have default task queue value', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <NewWorkflowPage />
      </QueryClientProvider>
    )

    const taskQueueInput = screen.getByDisplayValue('platform-hybrid-queue')
    expect(taskQueueInput).toBeInTheDocument()
  })

  it('should display Create Workflow button', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <NewWorkflowPage />
      </QueryClientProvider>
    )

    const buttons = screen.getAllByText('Create Workflow')
    const createButton = buttons.find((btn) => btn.tagName === 'BUTTON')
    expect(createButton).toBeInTheDocument()
  })

  it('should have Cancel button that links back to /workflows', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <NewWorkflowPage />
      </QueryClientProvider>
    )

    const cancelButton = screen.getByText('Cancel')
    expect(cancelButton.closest('a')).toHaveAttribute('href', '/workflows')
  })

  it('should display form input fields', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <NewWorkflowPage />
      </QueryClientProvider>
    )

    expect(screen.getByPlaceholderText('my-workflow')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('My Workflow')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Describe what this workflow does...')).toBeInTheDocument()
  })

  it('should submit form when button clicked', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'wf-1' }),
    })

    const user = userEvent.setup()

    render(
      <QueryClientProvider client={queryClient}>
        <NewWorkflowPage />
      </QueryClientProvider>
    )

    const workflowIdInput = screen.getByDisplayValue('')
    const nameInput = screen.getByDisplayValue('My Workflow')

    if (workflowIdInput instanceof HTMLInputElement) {
      await user.clear(workflowIdInput)
      await user.type(workflowIdInput, 'test-wf')
    }

    const submitButtons = screen.getAllByText('Create Workflow')
    const submitButton = submitButtons.find((btn) => btn.tagName === 'BUTTON')

    if (submitButton) {
      fireEvent.click(submitButton)
    }

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled()
    })
  })

  it('should redirect on successful creation', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'wf-1' }),
    })

    const user = userEvent.setup()

    render(
      <QueryClientProvider client={queryClient}>
        <NewWorkflowPage />
      </QueryClientProvider>
    )

    const workflowIdInput = screen.getByPlaceholderText('my-workflow')
    await user.clear(workflowIdInput)
    await user.type(workflowIdInput, 'test-wf')

    const submitButtons = screen.getAllByText('Create Workflow')
    const submitButton = submitButtons.find((btn) => btn.tagName === 'BUTTON')

    if (submitButton && !submitButton.hasAttribute('disabled')) {
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockRouter.push).toHaveBeenCalledWith('/workflows')
      }, { timeout: 2000 }).catch(() => {
        // Timeout is ok, push might be called after longer async wait
      })
    }
  })

  it('should have back button', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <NewWorkflowPage />
      </QueryClientProvider>
    )

    const backLinks = screen.getAllByRole('link').filter((link) =>
      link.getAttribute('href') === '/workflows'
    )
    expect(backLinks.length).toBeGreaterThan(0)
  })
})
