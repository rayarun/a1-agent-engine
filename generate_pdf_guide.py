#!/usr/bin/env python3
"""Generate rich PDF Platform Guide with embedded screenshots."""

import os
import re
from datetime import datetime
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle, TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor, black, white
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer,
    PageBreak, Image, KeepTogether, Preformatted
)
from reportlab.lib import colors
from reportlab.pdfgen import canvas
import textwrap
from PIL import Image as PILImage

# Configuration
DESKTOP_PATH = os.path.expanduser("~/Desktop")

# Discover screenshots from Desktop
def discover_screenshots():
    """Dynamically discover May 14 screenshots from Desktop - correct order."""
    screenshots = {}
    if os.path.exists(DESKTOP_PATH):
        files = sorted([f for f in os.listdir(DESKTOP_PATH) if 'Screenshot 2026-05-14' in f and f.endswith('.png')])

        # Map indices to correct labels (skip duplicate Cookbooks at index 5)
        mapping = {
            0: "System Agents",
            1: "Dashboard",
            2: "LLM Configuration",
            3: "System Tools",
            4: "Cookbooks",
            # Skip index 5 (duplicate Cookbooks)
            6: "Knowledge Graphs Admin",
            7: "System Skills",
            8: "MCP Servers",
            9: "Agents Studio",
            10: "Knowledge Graphs Studio",
            11: "Cookbooks Studio",
            12: "Chat"
        }

        for idx, label in mapping.items():
            if idx < len(files):
                screenshots[label] = files[idx]

    return screenshots

SCREENSHOTS = discover_screenshots()

OUTPUT_PATH = "/Users/arun.ray/personal-projects/a1-agent-engine/PLATFORM_GUIDE.pdf"

def get_screenshot_path(filename):
    """Get full path to screenshot."""
    path = os.path.join(DESKTOP_PATH, filename)
    # Normalize path for macOS
    path = os.path.expanduser(path)
    return path

def get_image_dimensions(img_path, max_width=7*inch, max_height=4.5*inch):
    """Calculate image dimensions maintaining aspect ratio."""
    try:
        img = PILImage.open(img_path)
        width, height = img.size
        aspect = height / width

        if width > max_width / inch * 72:
            width = max_width / inch * 72
            height = width * aspect

        if height > max_height / inch * 72:
            height = max_height / inch * 72
            width = height / aspect

        return width, height
    except Exception as e:
        print(f"Warning: Could not read image {img_path}: {e}")
        return max_width, max_height

def create_pdf():
    """Create rich PDF guide."""

    # Verify screenshots exist
    missing = []
    for name, filename in SCREENSHOTS.items():
        path = get_screenshot_path(filename)
        if not os.path.exists(path):
            missing.append(f"{filename} ({path})")

    if missing:
        print(f"⚠ Missing screenshots:")
        for m in missing:
            print(f"  - {m}")

    # Create PDF document
    doc = SimpleDocTemplate(
        OUTPUT_PATH,
        pagesize=letter,
        rightMargin=0.5*inch,
        leftMargin=0.5*inch,
        topMargin=0.5*inch,
        bottomMargin=0.5*inch,
    )

    # Define styles
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=28,
        textColor=HexColor('#1a1a1a'),
        spaceAfter=12,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold',
    )

    heading1_style = ParagraphStyle(
        'CustomHeading1',
        parent=styles['Heading1'],
        fontSize=16,
        textColor=HexColor('#2c3e50'),
        spaceAfter=12,
        spaceBefore=12,
        fontName='Helvetica-Bold',
    )

    heading2_style = ParagraphStyle(
        'CustomHeading2',
        parent=styles['Heading2'],
        fontSize=13,
        textColor=HexColor('#34495e'),
        spaceAfter=8,
        spaceBefore=8,
        fontName='Helvetica-Bold',
    )

    normal_style = ParagraphStyle(
        'CustomNormal',
        parent=styles['Normal'],
        fontSize=10,
        textColor=HexColor('#333333'),
        alignment=TA_JUSTIFY,
        spaceAfter=6,
        leading=14,
    )

    # Build document content
    story = []

    # Title Page
    story.append(Spacer(1, 1.5*inch))
    story.append(Paragraph("A1 Agent Engine", title_style))
    story.append(Paragraph("Platform Guide", ParagraphStyle(
        'SubTitle', parent=styles['Normal'], fontSize=20,
        textColor=HexColor('#2980b9'), alignment=TA_CENTER, spaceAfter=24
    )))
    story.append(Spacer(1, 0.3*inch))
    story.append(Paragraph(
        "Comprehensive guide for platform operators and domain architects",
        ParagraphStyle('SubSubTitle', parent=styles['Normal'], fontSize=12,
                      textColor=HexColor('#7f8c8d'), alignment=TA_CENTER, spaceAfter=12)
    ))
    story.append(Spacer(1, 0.5*inch))
    story.append(Paragraph(f"Generated: {datetime.now().strftime('%B %d, %Y')}",
                          ParagraphStyle('Meta', parent=styles['Normal'], fontSize=9,
                                       textColor=HexColor('#95a5a6'), alignment=TA_CENTER)))
    story.append(PageBreak())

    # Table of Contents
    story.append(Paragraph("Table of Contents", heading1_style))
    story.append(Spacer(1, 0.2*inch))

    toc_items = [
        "1. Admin Console Overview",
        "2. Admin Console Sections",
        "3. Agent Studio Sections",
        "4. Core Concepts",
        "5. Common Workflows",
        "6. Best Practices",
    ]

    for item in toc_items:
        story.append(Paragraph(f"• {item}", normal_style))

    story.append(PageBreak())

    # Section 1: Admin Console
    story.append(Paragraph("Admin Console", heading1_style))
    story.append(Paragraph(
        "The Admin Console is the central management interface for platform operators. Located at "
        "<b>localhost:3001</b> (development), it provides comprehensive tools to manage infrastructure, "
        "configure LLM providers, monitor system health, and oversee multi-tenant deployments. Platform "
        "operators use this interface to ensure the platform runs smoothly, securely, and cost-effectively.",
        normal_style
    ))
    story.append(Spacer(1, 0.2*inch))

    # Dashboard
    story.append(Paragraph("1. Dashboard", heading2_style))
    story.append(Paragraph(
        "<b>Purpose:</b> Real-time overview of platform health and activity.",
        normal_style
    ))
    story.append(Paragraph(
        "<b>Key Metrics:</b>",
        normal_style
    ))

    dashboard_items = [
        "Active Tenants: Number of tenant workspaces currently running",
        "Active Workflows: Real-time Temporal workflow count and status",
        "LLM Mode: Current LLM provider (Mock, Anthropic, OpenAI)",
        "Service Health: Status of all microservices and their endpoints",
        "Tenant Management: View all registered tenants with workflow quotas and token budgets",
    ]
    for item in dashboard_items:
        story.append(Paragraph(f"• {item}", normal_style))

    story.append(Spacer(1, 0.15*inch))
    dash_path = get_screenshot_path(SCREENSHOTS["Dashboard"])
    if os.path.exists(dash_path):
        w, h = get_image_dimensions(dash_path)
        story.append(Image(dash_path, width=w, height=h))
        story.append(Spacer(1, 0.1*inch))

    story.append(PageBreak())

    # LLM Configuration
    story.append(Paragraph("2. LLM Configuration", heading2_style))
    story.append(Paragraph(
        "<b>Purpose:</b> Configure LLM providers and manage model access globally and per-tenant.",
        normal_style
    ))
    story.append(Paragraph(
        "<b>Platform LLM Mode:</b> Select which LLM backend powers your agents:",
        normal_style
    ))

    llm_modes = [
        "<b>Mock (Development):</b> Deterministic responses for testing and development without incurring costs",
        "<b>Anthropic:</b> Claude models via Anthropic API for production deployments",
        "<b>OpenAI:</b> GPT models via OpenAI API as an alternative provider",
    ]
    for mode in llm_modes:
        story.append(Paragraph(f"• {mode}", normal_style))

    story.append(Paragraph(
        "<b>Model Access Control:</b> Configure which models are available platform-wide or per-tenant:",
        normal_style
    ))

    model_list = [
        "claude-3-5-sonnet - Recommended for balanced performance and cost",
        "claude-3-opus - Most capable model for complex reasoning tasks",
        "gpt-4 - OpenAI alternative for specific use cases",
    ]
    for model in model_list:
        story.append(Paragraph(f"• {model}", normal_style))

    story.append(Paragraph(
        "<b>Per-Model Configuration:</b> Enable or disable models globally or per-tenant, set API key routing, "
        "configure fallback models, and monitor token usage and costs in real-time.",
        normal_style
    ))

    story.append(Spacer(1, 0.15*inch))
    llm_path = get_screenshot_path(SCREENSHOTS["LLM Configuration"])
    if os.path.exists(llm_path):
        w, h = get_image_dimensions(llm_path)
        story.append(Image(llm_path, width=w, height=h))
        story.append(Spacer(1, 0.1*inch))

    story.append(PageBreak())

    # System Tools
    story.append(Paragraph("3. System Tools", heading2_style))
    story.append(Paragraph(
        "<b>Purpose:</b> Manage platform-level tools available to all agents across all tenants.",
        normal_style
    ))
    story.append(Paragraph(
        "<b>Tool Categories:</b>",
        normal_style
    ))

    tools_categories = [
        ("<b>Infrastructure Tools:</b>", [
            "bash - Shell command execution (sandbox-controlled)",
            "deployment-checker - Kubernetes deployment validation",
            "log-analyzer - Log aggregation and analysis",
        ]),
        ("<b>Knowledge Graph Tools:</b>", [
            "kg-create-graph - Create knowledge graphs",
            "kg-add-node - Add nodes to KGs",
            "kg-add-edge - Create relationships",
            "kg-query - Query KGs",
            "kg-search - Full-text search over KGs",
            "kg-semantic-search - NLP-powered semantic search",
        ]),
        ("<b>Data Tools:</b>", [
            "http-request - HTTP API calls",
            "code-executor - Python/JavaScript execution (sandboxed)",
        ]),
    ]

    for category_name, tools_list in tools_categories:
        story.append(Paragraph(category_name, normal_style))
        for tool in tools_list:
            story.append(Paragraph(f"  • {tool}", normal_style))

    story.append(Paragraph(
        "<b>Tool Configuration:</b> View tool documentation, track usage across tenants, and monitor execution metrics.",
        normal_style
    ))

    story.append(Spacer(1, 0.15*inch))
    tools_path = get_screenshot_path(SCREENSHOTS["System Tools"])
    if os.path.exists(tools_path):
        w, h = get_image_dimensions(tools_path)
        story.append(Image(tools_path, width=w, height=h))
        story.append(Spacer(1, 0.1*inch))

    story.append(PageBreak())

    # System Agents Screenshot
    story.append(Paragraph("4. System Agents", heading2_style))
    story.append(Paragraph(
        "<b>Purpose:</b> Pre-built system agents for platform operations and automation.",
        normal_style
    ))
    story.append(Paragraph(
        "<b>Available System Agents:</b>",
        normal_style
    ))

    agents_data = [
        ['Agent', 'Version', 'Use Case'],
        ['Manifest Assistant', '1.0.0', 'Help with agent manifest generation'],
        ['Test Generator', '1.0.0', 'Generate unit tests for code changes'],
        ['Code Reviewer', '1.0.0', 'Peer code review automation'],
        ['Deployment Checker', '1.0.0', 'Validate deployment configurations'],
    ]
    agents_table = Table(agents_data, colWidths=[1.8*inch, 1*inch, 3*inch])
    agents_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), HexColor('#2c3e50')),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('BACKGROUND', (0, 1), (-1, -1), HexColor('#ecf0f1')),
        ('GRID', (0, 0), (-1, -1), 1, HexColor('#95a5a6')),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, HexColor('#f8f9fa')]),
    ]))
    story.append(agents_table)

    story.append(Paragraph(
        "<b>Features:</b> View agent manifests, enable/disable per tenant, monitor execution logs, and manage agent versions.",
        normal_style
    ))

    story.append(Spacer(1, 0.15*inch))
    agents_path = get_screenshot_path(SCREENSHOTS["System Agents"])
    if os.path.exists(agents_path):
        w, h = get_image_dimensions(agents_path)
        story.append(Image(agents_path, width=w, height=h))
        story.append(Spacer(1, 0.1*inch))

    story.append(PageBreak())

    # Cookbooks
    story.append(Paragraph("5. Cookbooks", heading2_style))
    story.append(Paragraph(
        "<b>Purpose:</b> Domain-specific agent templates for rapid deployment and knowledge sharing.",
        normal_style
    ))
    story.append(Paragraph(
        "<b>Cookbook Anatomy:</b>",
        normal_style
    ))

    cookbook_anatomy = [
        "<b>Overview:</b> Description and use case, domain tags, version and maintenance status",
        "<b>Variables:</b> Parameterized configuration (org_name, env_names, alert_channel, etc.)",
        "<b>Agents:</b> Pre-built agent definitions ready to import",
        "<b>Knowledge Graphs:</b> Domain ontologies and relationships included",
        "<b>MCP Recommendations:</b> Suggested MCP servers for the domain",
    ]
    for item in cookbook_anatomy:
        story.append(Paragraph(f"• {item}", normal_style))

    story.append(Paragraph(
        "<b>Example: DevOps-SRE Cookbook</b> includes 2 agents (deployment-validator, incident-responder), "
        "1 Knowledge Graph (DevOps Platform ontology with 14 nodes and 19 relationships), and 8 MCP recommendations.",
        normal_style
    ))

    story.append(Spacer(1, 0.15*inch))
    cookbook_path = get_screenshot_path(SCREENSHOTS["Cookbooks"])
    if os.path.exists(cookbook_path):
        w, h = get_image_dimensions(cookbook_path)
        story.append(Image(cookbook_path, width=w, height=h))
        story.append(Spacer(1, 0.1*inch))

    story.append(PageBreak())

    # Knowledge Graphs (Admin)
    story.append(Paragraph("6. Knowledge Graphs", heading2_style))
    story.append(Paragraph(
        "<b>Purpose:</b> Store and manage domain ontologies with interactive visualization and semantic search.",
        normal_style
    ))
    story.append(Paragraph(
        "<b>Knowledge Graph Features:</b>",
        normal_style
    ))

    kg_features = [
        "<b>Structure:</b> Nodes (entities), Edges (relationships), Schema (type definitions), Embedding (auto-embedding for semantic search)",
        "<b>Visualization:</b> Interactive node-link diagram with color-coded nodes and relationship edges",
        "<b>Interaction:</b> Filter by node type, search across the graph, view node attributes, explore relationships",
        "<b>Capabilities:</b> Full-text search, semantic similarity search, relationship traversal, schema validation, version history",
    ]
    for feature in kg_features:
        story.append(Paragraph(f"• {feature}", normal_style))

    story.append(Paragraph(
        "<b>Use Cases:</b> Infrastructure relationship mapping, service dependency graphs, team hierarchy and ownership, "
        "feature/capability trees, policy compliance mappings.",
        normal_style
    ))

    story.append(Spacer(1, 0.15*inch))
    kg_admin_path = get_screenshot_path(SCREENSHOTS.get("Knowledge Graphs Admin", ""))
    if kg_admin_path and os.path.exists(kg_admin_path):
        w, h = get_image_dimensions(kg_admin_path)
        story.append(Image(kg_admin_path, width=w, height=h))
        story.append(Spacer(1, 0.1*inch))

    story.append(PageBreak())

    # System Skills
    story.append(Paragraph("7. System Skills", heading2_style))
    story.append(Paragraph(
        "<b>Purpose:</b> Pre-built domain skills for reuse across agents with approval controls.",
        normal_style
    ))
    story.append(Paragraph(
        "<b>Available System Skills:</b>",
        normal_style
    ))

    skills_data = [
        ['Skill', 'Mutating', 'Requires Approval'],
        ['kg-semantic-search', 'No', 'No'],
        ['backup-validator', 'No', 'No'],
        ['log-analyzer', 'No', 'No'],
        ['deployment-checker', 'Yes', 'Yes'],
        ['diagnostic-agent', 'Yes', 'Yes'],
    ]
    skills_table = Table(skills_data, colWidths=[2*inch, 1.2*inch, 1.8*inch])
    skills_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), HexColor('#2c3e50')),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('BACKGROUND', (0, 1), (-1, -1), HexColor('#ecf0f1')),
        ('GRID', (0, 0), (-1, -1), 1, HexColor('#95a5a6')),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, HexColor('#f8f9fa')]),
    ]))
    story.append(skills_table)

    story.append(Paragraph(
        "<b>Features:</b> Browse skill catalog, view documentation, configure approval requirements (HITL), and monitor skill usage.",
        normal_style
    ))

    story.append(Spacer(1, 0.15*inch))
    skills_path = get_screenshot_path(SCREENSHOTS.get("System Skills", ""))
    if skills_path and os.path.exists(skills_path):
        w, h = get_image_dimensions(skills_path)
        story.append(Image(skills_path, width=w, height=h))
        story.append(Spacer(1, 0.1*inch))

    story.append(PageBreak())

    # MCP Servers
    story.append(Paragraph("8. MCP Servers", heading2_style))
    story.append(Paragraph(
        "<b>Purpose:</b> Manage Model Context Protocol integrations for extending platform capabilities.",
        normal_style
    ))
    story.append(Paragraph(
        "<b>MCP Server Management:</b>",
        normal_style
    ))

    mcp_features = [
        "Register global MCP servers available to all tenants",
        "Configure authentication (API keys, OAuth) for each server",
        "Monitor server health and connectivity in real-time",
        "Issue tokens for external MCP clients (e.g., Claude Desktop)",
        "Manage token lifecycle and permissions",
        "Revoke tokens as needed for security",
    ]
    for feature in mcp_features:
        story.append(Paragraph(f"• {feature}", normal_style))

    story.append(Paragraph(
        "<b>Benefits:</b> Integrate external AI models, extend platform with custom tools via MCP protocol, "
        "and manage multi-agent ecosystems across different providers.",
        normal_style
    ))

    story.append(Spacer(1, 0.15*inch))
    mcp_path = get_screenshot_path(SCREENSHOTS.get("MCP Servers", ""))
    if mcp_path and os.path.exists(mcp_path):
        w, h = get_image_dimensions(mcp_path)
        story.append(Image(mcp_path, width=w, height=h))
        story.append(Spacer(1, 0.1*inch))

    story.append(PageBreak())

    # Agent Studio Section
    story.append(PageBreak())
    story.append(Paragraph("Agent Studio", heading1_style))
    story.append(Paragraph(
        "Agent Studio is the workspace for domain architects to design, test, and manage agents. Located at "
        "<b>localhost:3000</b> (development), it provides tools to compose agents from skills, manage knowledge graphs, "
        "test agents in real-time, and access domain templates. This is where you build and validate the autonomous agents "
        "that solve your business problems.",
        normal_style
    ))
    story.append(Spacer(1, 0.2*inch))

    # Agents
    story.append(Paragraph("1. Agents", heading2_style))
    story.append(Paragraph(
        "<b>Purpose:</b> Create and manage autonomous agents with LLM models, skills composition, and custom system prompts.",
        normal_style
    ))
    story.append(Paragraph(
        "<b>Agent Definition:</b>",
        normal_style
    ))

    agent_def = [
        "Name and description for identification and discovery",
        "Model selection (Claude, GPT) - the LLM backbone",
        "Max iterations - control runaway agent behavior",
        "Skills composition - which domain capabilities to include",
        "System prompt customization - guide agent behavior and focus",
        "Tools access - read-only or full capability access",
    ]
    for item in agent_def:
        story.append(Paragraph(f"• {item}", normal_style))

    story.append(Paragraph(
        "<b>Agent Lifecycle:</b> Draft (in development) → Active (ready for use) → Deprecated (no longer recommended) → "
        "Archived (legacy agents). Each agent executes as a Temporal durable workflow, surviving failures and maintaining "
        "an audit trail.",
        normal_style
    ))

    story.append(Spacer(1, 0.15*inch))
    studio_agents_path = get_screenshot_path(SCREENSHOTS.get("Agents Studio", ""))
    if studio_agents_path and os.path.exists(studio_agents_path):
        w, h = get_image_dimensions(studio_agents_path)
        story.append(Image(studio_agents_path, width=w, height=h))
        story.append(Spacer(1, 0.1*inch))

    story.append(PageBreak())

    # Agent Studio Knowledge Graphs
    story.append(Paragraph("2. Knowledge Graphs", heading2_style))
    story.append(Paragraph(
        "<b>Purpose:</b> Browse and visualize domain knowledge to understand the context available to your agents.",
        normal_style
    ))
    story.append(Paragraph(
        "<b>KG Interaction:</b>",
        normal_style
    ))

    kg_interaction = [
        "Visual node-link diagram showing entities and their relationships",
        "Filter by node type to focus on specific entity categories",
        "Search for specific nodes and validate they exist in the graph",
        "View node properties and detailed attributes",
        "Explore relationships and connection paths",
        "Semantic search over graph content",
    ]
    for item in kg_interaction:
        story.append(Paragraph(f"• {item}", normal_style))

    story.append(Paragraph(
        "<b>Use Cases:</b> Understand domain structure before building agents, validate that agent knowledge is complete, "
        "identify knowledge gaps, and plan knowledge enrichment initiatives.",
        normal_style
    ))

    story.append(Spacer(1, 0.15*inch))
    studio_kg_path = get_screenshot_path(SCREENSHOTS.get("Knowledge Graphs Studio", ""))
    if studio_kg_path and os.path.exists(studio_kg_path):
        w, h = get_image_dimensions(studio_kg_path)
        story.append(Image(studio_kg_path, width=w, height=h))
        story.append(Spacer(1, 0.1*inch))

    story.append(PageBreak())

    # Agent Studio Cookbooks
    story.append(Paragraph("3. Cookbooks", heading2_style))
    story.append(Paragraph(
        "<b>Purpose:</b> Access and customize domain-specific agent templates for rapid deployment.",
        normal_style
    ))
    story.append(Paragraph(
        "<b>Cookbook Workflow:</b>",
        normal_style
    ))

    cookbook_workflow = [
        "<b>1. Browse</b> available cookbooks by domain (DevOps, Security, etc.)",
        "<b>2. Review</b> template structure including agents, KGs, and variables needed",
        "<b>3. Import</b> cookbook into your tenant with variable customization",
        "<b>4. Customize</b> variables for your specific environment (org_name, env_names, etc.)",
        "<b>5. Deploy</b> agents and knowledge graphs automatically",
        "<b>6. Extend</b> with custom modifications as needed",
    ]
    for step in cookbook_workflow:
        story.append(Paragraph(f"• {step}", normal_style))

    story.append(Paragraph(
        "<b>Example: Importing DevOps-SRE Cookbook</b> - Configure org_name to 'My Company', env_names to "
        "'dev,staging,prod', alert_channel to '#incidents'. Result: 2 agents deployed, DevOps Platform KG created "
        "with 14 nodes and 19 edges, and 8 MCP recommendations configured.",
        normal_style
    ))

    story.append(Spacer(1, 0.15*inch))
    studio_cookbook_path = get_screenshot_path(SCREENSHOTS.get("Cookbooks Studio", ""))
    if studio_cookbook_path and os.path.exists(studio_cookbook_path):
        w, h = get_image_dimensions(studio_cookbook_path)
        story.append(Image(studio_cookbook_path, width=w, height=h))
        story.append(Spacer(1, 0.1*inch))

    story.append(PageBreak())

    # Chat Interface
    story.append(Paragraph("4. Chat Interface", heading2_style))
    story.append(Paragraph(
        "<b>Purpose:</b> Test agents in real-time conversation before deploying to production.",
        normal_style
    ))
    story.append(Paragraph(
        "<b>Chat Features:</b>",
        normal_style
    ))

    chat_features = [
        "Send messages to agents and receive responses",
        "View agent reasoning and planning process in detail",
        "Monitor all tool calls made and their results",
        "Track token usage for cost estimation",
        "Export conversation history for documentation",
        "Review execution logs and error traces",
    ]
    for feature in chat_features:
        story.append(Paragraph(f"• {feature}", normal_style))

    story.append(Paragraph(
        "<b>Agent Response Process:</b>",
        normal_style
    ))

    response_process = [
        "1. Agent receives user message",
        "2. Plans approach using available tools and knowledge",
        "3. Executes tools (bash, API calls, KG searches, skills)",
        "4. Iterates until task complete or max iterations reached",
        "5. Returns final response to user with reasoning trace",
    ]
    for step in response_process:
        story.append(Paragraph(f"• {step}", normal_style))

    story.append(Spacer(1, 0.15*inch))
    chat_path = get_screenshot_path(SCREENSHOTS.get("Chat", ""))
    if chat_path and os.path.exists(chat_path):
        w, h = get_image_dimensions(chat_path)
        story.append(Image(chat_path, width=w, height=h))
        story.append(Spacer(1, 0.1*inch))

    story.append(PageBreak())

    # Core Concepts
    story.append(Paragraph("Core Concepts", heading1_style))
    story.append(Paragraph(
        "Understanding these fundamental concepts is essential for operating and extending the platform effectively. "
        "Each component plays a specific role in the agent orchestration system.",
        normal_style
    ))
    story.append(Spacer(1, 0.2*inch))

    # Agents
    story.append(Paragraph("1. Agents", heading2_style))
    story.append(Paragraph(
        "Autonomous entities that reason about problems, invoke tools, and execute tasks. Agents are powered by LLM models "
        "and execute as Temporal durable workflows, surviving failures and maintaining an audit trail.",
        normal_style
    ))
    story.append(Paragraph(
        "<b>Agent Properties:</b> Model (Claude/GPT), Skills (reusable capabilities), Tools (direct system access), "
        "State (memory of interactions), Constraints (max iterations, token limits)",
        normal_style
    ))
    story.append(Spacer(1, 0.1*inch))

    # Skills
    story.append(Paragraph("2. Skills", heading2_style))
    story.append(Paragraph(
        "Reusable agent capabilities composed from tools with domain-specific logic. Skills encapsulate tool complexity, "
        "provide versioning, enable approval workflows, and are tenant-scoped for security.",
        normal_style
    ))
    story.append(Paragraph(
        "<b>Skill Composition:</b> Tool(s) + Configuration + Approval Rules = Skill. Example: kg-semantic-search skill "
        "uses the kg-semantic-search tool; backup-validator skill uses bash and monitoring tools.",
        normal_style
    ))
    story.append(Spacer(1, 0.1*inch))

    # Tools
    story.append(Paragraph("3. Tools", heading2_style))
    story.append(Paragraph(
        "Atomic functions agents invoke to accomplish work. Tools include infrastructure commands (bash), API integrations "
        "(http-request), knowledge queries (kg-search), and sandboxed code execution (code-executor).",
        normal_style
    ))
    story.append(Paragraph(
        "<b>Safety Model:</b> Mutating tools (modify state) require approval before execution. Read-only tools (queries) "
        "execute without approval. All tool access is logged and can be revoked by administrators.",
        normal_style
    ))
    story.append(Spacer(1, 0.1*inch))

    # Knowledge Graphs
    story.append(Paragraph("4. Knowledge Graphs", heading2_style))
    story.append(Paragraph(
        "Semantic graphs storing domain ontologies and relationships. KGs enable agents to reason about complex systems, "
        "understand dependencies, and make informed decisions based on domain knowledge.",
        normal_style
    ))
    story.append(Paragraph(
        "<b>KG Structure:</b> Nodes (typed entities like Service, Team, Infrastructure), Edges (relationships with labels "
        "like 'owns', 'depends-on'), Attributes (node properties), Schema (type system and constraints)",
        normal_style
    ))
    story.append(Spacer(1, 0.1*inch))

    # Cookbooks
    story.append(Paragraph("5. Cookbooks", heading2_style))
    story.append(Paragraph(
        "Domain-specific templates for rapid agent composition. Cookbooks package complete solutions: agents, knowledge graphs, "
        "tools, and configuration variables—enabling teams to deploy production-ready agents in minutes.",
        normal_style
    ))
    story.append(Paragraph(
        "<b>Benefits:</b> Accelerate development, enforce best practices, ensure consistency, enable knowledge sharing across teams",
        normal_style
    ))
    story.append(Spacer(1, 0.1*inch))

    # Multi-Tenancy
    story.append(Paragraph("6. Multi-Tenancy", heading2_style))
    story.append(Paragraph(
        "Secure isolation of customer data and workloads. PostgreSQL Row-Level Security (RLS) enforces tenant boundaries at the "
        "database layer—not just application code. Each agent, skill, and knowledge graph belongs to exactly one tenant.",
        normal_style
    ))
    story.append(Paragraph(
        "<b>Isolation Mechanisms:</b> RLS at DB layer, tenant-scoped API keys, separate Temporal task queues, connection pooling "
        "per tenant, independent scaling and billing per tenant",
        normal_style
    ))
    story.append(Spacer(1, 0.1*inch))

    # HITL Approval
    story.append(Paragraph("7. HITL (Human-In-The-Loop) Approval", heading2_style))
    story.append(Paragraph(
        "Critical operations require human authorization before execution. Mutating tools (bash, data modifications), "
        "high-risk workflows, and policy exceptions require approval. The approval workflow maintains audit trails and provides "
        "transparency for compliance.",
        normal_style
    ))
    story.append(Paragraph(
        "<b>Workflow:</b> Agent plans action → Sends approval request with context → Human reviews → Approve/Reject → "
        "Agent proceeds or halts → Audit logged",
        normal_style
    ))
    story.append(Spacer(1, 0.2*inch))

    story.append(PageBreak())

    # Common Workflows
    story.append(Paragraph("Common Workflows", heading1_style))
    story.append(Spacer(1, 0.15*inch))

    # Workflow 1
    story.append(Paragraph("Workflow 1: Deploy a Domain Agent", heading2_style))
    story.append(Paragraph(
        "This workflow guides you through importing a template cookbook and customizing it for your environment.",
        normal_style
    ))
    steps_w1 = [
        "<b>1. Browse Cookbooks:</b> Agent Studio → Cookbooks. Select the template matching your domain (DevOps, Security, etc.)",
        "<b>2. Review Structure:</b> Examine agents, knowledge graphs, and tools included. Check variables needed.",
        "<b>3. Import:</b> Click 'Import Cookbook' and provide variable values (org_name='My Company', env_names='dev,staging,prod')",
        "<b>4. Customize:</b> Agents are created automatically. Extend with additional skills if needed.",
        "<b>5. Test:</b> Use Chat interface to send test messages and validate agent behavior.",
        "<b>6. Deploy:</b> Mark agent status as 'active' and configure approval requirements.",
    ]
    for step in steps_w1:
        story.append(Paragraph(step, normal_style))
        story.append(Spacer(1, 0.08*inch))

    story.append(Spacer(1, 0.15*inch))

    # Workflow 2
    story.append(Paragraph("Workflow 2: Create a Custom Agent", heading2_style))
    story.append(Paragraph(
        "Build a new agent from scratch tailored to your specific needs.",
        normal_style
    ))
    steps_w2 = [
        "<b>1. Define Agent:</b> Agent Studio → Agents → New. Enter name, description, and select LLM model.",
        "<b>2. Configure:</b> Set max iterations to control runaway behavior, select system prompt focus.",
        "<b>3. Compose Skills:</b> Add relevant skills from the catalog. Each skill provides domain-specific capabilities.",
        "<b>4. Test Immediately:</b> Use Chat to send test messages and monitor tool invocations.",
        "<b>5. Review Logs:</b> Examine execution traces. Identify tool failures or optimization opportunities.",
        "<b>6. Refine & Iterate:</b> Adjust skill selection, refine system prompt, increase iterations if needed.",
        "<b>7. Activate:</b> Set status to 'active' when satisfied with behavior.",
    ]
    for step in steps_w2:
        story.append(Paragraph(step, normal_style))
        story.append(Spacer(1, 0.08*inch))

    story.append(Spacer(1, 0.15*inch))

    # Workflow 3
    story.append(Paragraph("Workflow 3: Troubleshoot Agent Failures", heading2_style))
    story.append(Paragraph(
        "Systematic approach to diagnosing and fixing agent execution problems.",
        normal_style
    ))
    steps_w3 = [
        "<b>1. Locate Failure:</b> Agent Studio → Logs. Find the failing execution by agent name and timestamp.",
        "<b>2. Analyze:</b> Review tool calls and outputs. Identify where execution diverged from expected.",
        "<b>3. Check Tools:</b> Admin Console → System Tools. Verify the tool is enabled and not blocked by approvals.",
        "<b>4. Validate Skills:</b> Agent Studio → Skills. Confirm skill uses correct tool and configuration is valid.",
        "<b>5. Inspect Knowledge:</b> Agent Studio → Knowledge Graphs. Search for entities agent is trying to find.",
        "<b>6. Fix Agent:</b> Adjust skill selection, refine system prompt, or increase max iterations.",
        "<b>7. Retest:</b> Run agent again in Chat interface. Verify fix works end-to-end.",
    ]
    for step in steps_w3:
        story.append(Paragraph(step, normal_style))
        story.append(Spacer(1, 0.08*inch))

    story.append(PageBreak())

    # Best Practices
    story.append(Paragraph("Best Practices", heading1_style))
    story.append(Paragraph(
        "Follow these guidelines to build reliable, secure, and maintainable agent systems.",
        normal_style
    ))
    story.append(Spacer(1, 0.15*inch))

    # Agent Design
    story.append(Paragraph("Agent Design", heading2_style))
    story.append(Paragraph("<b>Do:</b>", normal_style))
    do_items = [
        "Compose agents from well-tested skills with clear purposes",
        "Use descriptive system prompts that guide behavior and focus",
        "Limit max iterations (typically 5-10) to prevent runaway loops",
        "Enable HITL approval for risky operations (bash, deployment, data changes)",
        "Test extensively in Chat before deploying to production",
    ]
    for item in do_items:
        story.append(Paragraph(f"✓ {item}", normal_style))

    story.append(Paragraph("<b>Don't:</b>", normal_style))
    dont_items = [
        "Give agents unlimited tool access without approval gates",
        "Mix too many unrelated skills (focus on single domain per agent)",
        "Use overly verbose system prompts that confuse intent",
        "Deploy to production without thorough testing",
        "Ignore or bypass approval requirements",
    ]
    for item in dont_items:
        story.append(Paragraph(f"✗ {item}", normal_style))

    story.append(Spacer(1, 0.15*inch))

    # Knowledge Graphs
    story.append(Paragraph("Knowledge Graph Management", heading2_style))
    story.append(Paragraph("<b>Do:</b>", normal_style))
    kg_do = [
        "Keep schemas consistent and well-documented",
        "Update graphs regularly to reflect current system state",
        "Validate graph integrity and consistency periodically",
        "Use semantic relationships meaningfully (not random connections)",
        "Ensure agents can discover context they need",
    ]
    for item in kg_do:
        story.append(Paragraph(f"✓ {item}", normal_style))

    story.append(Paragraph("<b>Don't:</b>", normal_style))
    kg_dont = [
        "Treat knowledge graphs as one-time snapshots",
        "Allow schema drift without documentation",
        "Create disconnected subgraphs or isolated nodes",
        "Overload nodes with unrelated attributes",
        "Forget to embed node data for semantic search",
    ]
    for item in kg_dont:
        story.append(Paragraph(f"✗ {item}", normal_style))

    story.append(Spacer(1, 0.15*inch))

    # Security & Compliance
    story.append(Paragraph("Security & Compliance", heading2_style))
    story.append(Paragraph("<b>Do:</b>", normal_style))
    sec_do = [
        "Enforce tenant isolation—never bypass RLS policies",
        "Rotate MCP tokens regularly and audit access logs",
        "Enable approval for all sensitive operations",
        "Keep audit logs retained for compliance investigations",
        "Validate cross-tenant data access is technically impossible",
    ]
    for item in sec_do:
        story.append(Paragraph(f"✓ {item}", normal_style))

    story.append(Paragraph("<b>Don't:</b>", normal_style))
    sec_dont = [
        "Bypass approval workflows for convenience",
        "Mix secrets or credentials in logs or chat history",
        "Grant excessive permissions to single agents",
        "Trust unvalidated inputs from users or external APIs",
        "Delete audit logs prematurely",
    ]
    for item in sec_dont:
        story.append(Paragraph(f"✗ {item}", normal_style))

    story.append(Spacer(1, 0.15*inch))

    # Monitoring & Observability
    story.append(Paragraph("Monitoring & Observability", heading2_style))
    story.append(Paragraph("<b>Do:</b>", normal_style))
    mon_do = [
        "Track agent execution metrics (success rates, latency, cost)",
        "Monitor tool invocation patterns for anomalies",
        "Alert on failure rate spikes or resource exhaustion",
        "Export logs regularly for analysis and archival",
        "Review cost trends to catch runaway spending",
    ]
    for item in mon_do:
        story.append(Paragraph(f"✓ {item}", normal_style))

    story.append(Paragraph("<b>Don't:</b>", normal_style))
    mon_dont = [
        "Ignore failing agents without investigation",
        "Assume everything is working (verify with dashboards)",
        "Skim monitoring dashboards without acting on alerts",
        "Let logs grow unbounded without rotation",
        "Miss early warning signs of systemic issues",
    ]
    for item in mon_dont:
        story.append(Paragraph(f"✗ {item}", normal_style))

    story.append(PageBreak())

    # Quick Reference & Troubleshooting
    story.append(Paragraph("Quick Reference & Troubleshooting", heading1_style))
    story.append(Spacer(1, 0.15*inch))

    # Service Port Summary
    story.append(Paragraph("Service Ports", heading2_style))
    ports_data = [
        ['Service', 'Port', 'Description'],
        ['API Gateway', '8080', 'Entry point for all API requests'],
        ['Workflow Initiator', '8081', 'Temporal workflow dispatcher'],
        ['MCP Registry', '8090', 'MCP server hub'],
        ['Agent Studio', '3000', 'Frontend for domain architects'],
        ['Admin Console', '3001', 'Frontend for platform operators'],
    ]

    ports_table = Table(ports_data, colWidths=[1.8*inch, 1*inch, 3.2*inch])
    ports_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), HexColor('#2c3e50')),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('BACKGROUND', (0, 1), (-1, -1), HexColor('#ecf0f1')),
        ('GRID', (0, 0), (-1, -1), 1, HexColor('#95a5a6')),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, HexColor('#f8f9fa')]),
    ]))

    story.append(ports_table)
    story.append(Spacer(1, 0.2*inch))

    # Common Issues & Solutions
    story.append(Paragraph("Common Issues & Solutions", heading2_style))

    issues_data = [
        ['Issue', 'Root Cause', 'Solution'],
        ['Agent fails with "Tool not found"', 'Tool not enabled in System Tools', 'Admin Console → System Tools → Verify tool is enabled'],
        ['"Approval required" error', 'Mutating tool requires authorization', 'Review HITL settings in Skills, provide approval in Agent Studio'],
        ['Knowledge graph search returns nothing', 'KG not imported or not embedded', 'Agent Studio → Knowledge Graphs → Re-import and verify nodes exist'],
        ['Cookbook import fails', 'Missing required variables', 'Check all required variables provided, verify variable format'],
        ['Chat timeout / max iterations exceeded', 'Task too complex or agent misconfigured', 'Increase max_iter setting, simplify task, or refocus agent'],
    ]

    issues_table = Table(issues_data, colWidths=[1.4*inch, 1.8*inch, 3*inch])
    issues_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), HexColor('#2c3e50')),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('BACKGROUND', (0, 1), (-1, -1), HexColor('#ecf0f1')),
        ('GRID', (0, 0), (-1, -1), 1, HexColor('#95a5a6')),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, HexColor('#f8f9fa')]),
    ]))

    story.append(issues_table)
    story.append(Spacer(1, 0.2*inch))

    # Getting Help
    story.append(Paragraph("Getting Help", heading2_style))
    help_resources = [
        "<b>View Execution Logs:</b> Agent Studio → Logs. Shows detailed traces of agent reasoning and tool calls.",
        "<b>Check Audit Trail:</b> Admin Console → Audit Log. System-wide event history for debugging.",
        "<b>Review Architecture:</b> See architecture.md for system design, data flow, and integration patterns.",
        "<b>API Reference:</b> Admin API at port 8089 with endpoints for agents, workflows, approvals.",
        "<b>Documentation:</b> README.md for project overview, requirements.md for feature specifications.",
    ]
    for resource in help_resources:
        story.append(Paragraph(f"• {resource}", normal_style))
        story.append(Spacer(1, 0.06*inch))

    story.append(Spacer(1, 0.15*inch))

    # Key Reminders
    story.append(Paragraph("Key Reminders", heading2_style))
    reminders = [
        "<b>Temporal is the only execution engine</b> – All agent workflows run through Temporal (no direct async/background jobs)",
        "<b>Tenant isolation is enforced at DB layer</b> – PostgreSQL RLS policies prevent cross-tenant access",
        "<b>All tool calls route through Skill Dispatcher</b> – Direct tool execution is not supported",
        "<b>Approve mutating operations carefully</b> – Review context thoroughly before approving sensitive actions",
        "<b>Monitor costs continuously</b> – LLM token usage and workflow execution minutes drive spending",
        "<b>Keep knowledge graphs current</b> – Stale or incomplete KGs lead to poor agent decisions",
    ]
    for reminder in reminders:
        story.append(Paragraph(f"→ {reminder}", normal_style))
        story.append(Spacer(1, 0.06*inch))

    story.append(PageBreak())

    # Footer
    story.append(Paragraph("Document Information", heading2_style))
    footer_data = [
        f"<b>Generated:</b> {datetime.now().strftime('%B %d, %Y at %I:%M %p')}",
        "<b>Version:</b> 1.0.0",
        "<b>Document:</b> A1 Agent Engine Platform Guide - Complete How-To",
        "<b>For:</b> Platform Operators & Domain Architects",
    ]
    for footer_item in footer_data:
        story.append(Paragraph(footer_item, ParagraphStyle(
            'Footer', parent=styles['Normal'], fontSize=9, textColor=HexColor('#7f8c8d')
        )))

    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph(
        "This guide provides comprehensive coverage of the A1 Agent Engine platform, including Admin Console and Agent Studio interfaces, "
        "core concepts, common workflows, and best practices. For additional support, refer to the online documentation or contact your platform team.",
        ParagraphStyle(
            'Disclaimer', parent=styles['Normal'], fontSize=8, textColor=HexColor('#95a5a6'), alignment=TA_JUSTIFY
        )
    ))

    # Build PDF
    doc.build(story)
    print(f"✓ PDF generated: {OUTPUT_PATH}")
    print(f"✓ Total screenshots embedded: {len([s for s in SCREENSHOTS.values() if os.path.exists(get_screenshot_path(s))])}")
    print(f"✓ File size: {os.path.getsize(OUTPUT_PATH) / 1024 / 1024:.2f} MB")

if __name__ == "__main__":
    create_pdf()
