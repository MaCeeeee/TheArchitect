================================================================================
  TheArchitect - Enterprise Architecture Management Platform
================================================================================

  3D Visualization | TOGAF 10 | ArchiMate 3.2 | AI Copilot | Governance

================================================================================


WHAT IS THEARCHITECT?

  TheArchitect is a full-stack Enterprise Architecture Management (EAM) platform
  that lets organizations model, visualize, and govern their IT and business
  architecture in an interactive 3D environment.

  It follows TOGAF 10 methodology and ArchiMate 3.2 notation with 60 element
  types across 8 architecture layers: Motivation, Strategy, Business, Data,
  Application, Technology, Physical, and Implementation & Migration.

  Live: https://thearchitect.site


CORE FEATURES

  3D Architecture Visualization
    - Interactive Three.js scene with 8 layered planes
    - Elements rendered as 3D nodes with color-coded layers
    - Connection lines showing relationships (composition, serving, flow, etc.)
    - 2D and 3D view modes, X-Ray overlays, cost gravity visualization

  Blueprint Generator (AI)
    - Generate a complete enterprise architecture from a plain-language
      business description
    - 6-card guided questionnaire (no architecture jargon required)
    - Auto-fill from uploaded documents (PDF, Excel, PowerPoint)
    - Two-pass AI generation: elements first, then connections
    - SSE streaming for real-time progress feedback
    - Preview, edit, and import into your project

  AI Copilot
    - Context-aware assistant that understands your architecture
    - Ask questions, get recommendations, analyze dependencies
    - Dual LLM support: OpenAI and Anthropic (auto-fallback)

  Transformation Roadmap
    - Define plateaus (current state, target state, transitions)
    - Work packages with cost estimates and timeline
    - Gap analysis between architecture states
    - Visual plateau navigation in 3D view

  Compliance Pipeline
    - Upload industry standards (TOGAF, ISO 27001, GDPR, etc.)
    - 7-stage document parsing and requirement extraction
    - AI-powered matching of requirements to architecture elements
    - Compliance matrix with scoring and gap identification

  Governance Workflows
    - Policy management with approval workflows
    - Architecture review boards
    - Change request tracking
    - Audit trail for all modifications

  Stochastic Simulation (Mirofish)
    - Monte Carlo simulation of architecture decisions
    - Risk topology visualization
    - Agent-based emergence tracking

  Template Marketplace
    - Share and import architecture templates
    - Pre-built industry-specific architectures


TECH STACK

  Frontend     React 18, TypeScript, Three.js / React Three Fiber,
               Zustand (state), Tailwind CSS, Vite

  Backend      Express.js, TypeScript, Passport.js (auth), Socket.IO (realtime)

  Databases    MongoDB (documents), Neo4j (graph/dependencies),
               Redis (sessions/cache), MinIO (file storage)

  Monorepo     npm workspaces + Turborepo
               packages/shared  - Types, constants, shared interfaces
               packages/server  - Express API, models, routes, WebSocket
               packages/client  - React SPA with 3D visualization

  Deployment   Docker multi-stage build, Caddy reverse proxy (auto HTTPS)


AUTHENTICATION & SECURITY

  - JWT access + refresh tokens with automatic rotation
  - Multi-factor authentication (TOTP)
  - OAuth 2.0: Google, GitHub, Microsoft
  - Role-based access control (RBAC) with 7 roles:
    Chief Architect, Enterprise Architect, Solution Architect, Domain Architect,
    Business Analyst, Developer, Viewer
  - Permission hierarchy with project-level access control
  - API keys with SHA-256 hashing (shown once on creation)
  - Full audit logging with IP and user-agent tracking
  - Session management via Redis


GETTING STARTED

  Prerequisites:
    - Node.js >= 22
    - MongoDB, Neo4j, Redis (or Docker)
    - OpenAI or Anthropic API key (for AI features)

  1. Clone the repository
     git clone https://github.com/MaCeeeee/TheArchitect.git
     cd TheArchitect

  2. Install dependencies
     npm install

  3. Set up environment variables
     cp .env.example .env
     # Edit .env with your database URIs and API keys

  4. Start in development mode
     npm run dev

  5. Open http://localhost:5173


BUILD & DEPLOY

  Build all packages:
    npm run build

  Docker (production):
    docker compose -f docker-compose.prod.yml up -d --build

  The Docker setup includes: app, MongoDB, Neo4j, Redis, MinIO, Caddy


PROJECT STRUCTURE

  TheArchitect/
  |-- packages/
  |   |-- shared/          Shared types, constants, interfaces
  |   |-- server/          Express API backend
  |   |   |-- src/
  |   |   |   |-- config/        Database connections
  |   |   |   |-- middleware/    Auth, RBAC, audit, rate limiting
  |   |   |   |-- models/       Mongoose schemas
  |   |   |   |-- routes/       API endpoints
  |   |   |   |-- services/     Business logic, AI, document parsing
  |   |-- client/          React frontend
  |   |   |-- src/
  |   |   |   |-- components/
  |   |   |   |   |-- 3d/           Three.js scene, nodes, connections
  |   |   |   |   |-- blueprint/    Blueprint Generator wizard
  |   |   |   |   |-- analytics/    Roadmap, cost analysis
  |   |   |   |   |-- compliance/   Standards pipeline, matrix
  |   |   |   |   |-- copilot/      AI assistant
  |   |   |   |   |-- governance/   Policy management
  |   |   |   |   |-- simulation/   Mirofish stochastic engine
  |   |   |   |   |-- dashboard/    Overview, metrics
  |   |   |   |   |-- settings/     User, project, admin settings
  |   |   |   |   |-- security/     Auth, MFA, sessions
  |   |   |   |-- stores/       Zustand state management
  |   |   |   |-- services/     API client
  |-- Dockerfile
  |-- docker-compose.prod.yml


ARCHIMATE 3.2 COMPLIANCE

  60 element types across 8 layers:

  Motivation     stakeholder, driver, assessment, goal, outcome, principle,
                 requirement, constraint, meaning, value
  Strategy       business_capability, value_stream, resource, course_of_action
  Business       business_actor, business_role, process, function, service,
                 business_object, contract, product, representation, event,
                 interaction, collaboration
  Data           data_object
  Application    application_component, application_service, application_function,
                 application_interaction, application_collaboration,
                 application_interface, application_event, application_process
  Technology     node, device, system_software, technology_service,
                 technology_function, technology_interface, technology_interaction,
                 technology_collaboration, technology_event, technology_process,
                 artifact, communication_network, path
  Physical       equipment, facility, distribution_network, material
  Impl/Migr      work_package, deliverable, plateau, gap,
                 implementation_event

  11 connection types:
    composition, aggregation, assignment, realization, serving,
    access, influence, triggering, flow, specialization, association


LICENSE

  Private repository. All rights reserved.


================================================================================
  Built with Three.js, React, Neo4j, and a lot of coffee.
================================================================================
