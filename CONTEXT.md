# TheArchitect — Domain Language

The shared vocabulary for TheArchitect. This is a glossary, not a spec: it defines what
terms *mean*, so code, UI copy, ADRs, and conversations use one language. Implementation
details do not belong here.

## The Journey (spatial UI redesign)

The redesign presents the whole tool as **one persistent 3D world** you move through, rather
than a set of separate pages. These terms fix that model.

**Phase**:
One of the six canonical TOGAF ADM stations that form the backbone of a project's journey.
The Phase is the unit of progress; it owns completion logic and the current-Phase pointer. Its
ADM identity is the engine; the surface shows a plain-language name with the ADM reference as a
badge:

| Station (surface) | ADM badge | Job |
|---|---|---|
| **Vision** | Phase A | Scope, stakeholders, principles |
| **Model** | Phases B–D | Business, data, application, technology |
| **Explore** | Phase E | Options, gaps, standards |
| **Plan** | Phase F | Simulation, cost, roadmap |
| **Govern** | Phase G | Policies, approvals |
| **Track** | Phase H | Audit, snapshots, change |

_Avoid_: Act, Step, Stage

**Station**:
The spatial manifestation of a Phase — a camera position in the World plus one primary
call-to-action plus whatever Sheets belong to it. A Phase is *what* you are doing; a Station
is *where* you stand to do it. Navigating to a Station moves the camera; it does not unmount
the World.
_Avoid_: Scene, View, Screen

**On-ramp**:
An entry mechanism that fills the early Phases quickly — e.g. the public landing ("Arrival")
or AI-generation of a first model ("Genesis"). An On-ramp is *not* a Phase and never appears
on the Rail as one; it is how you arrive at or populate the first Stations.
_Avoid_: Act, Onboarding step

**World**:
The single persistent 3D canvas that holds the architecture and never unmounts. Route changes
re-aim the camera within the World rather than replacing it.
_Avoid_: Stage (collides with pipeline stage), Canvas, Scene (that is the React component)

**Rail**:
The visible Phase navigator — the spine that shows where you are, what is done, and lets you
jump between Phases. It shows the path; it is not where tools live.
_Avoid_: Stepper, Tab bar, Sidebar nav

**Sheet**:
A DOM overlay panel that slides in *over* the World to hold dense, non-spatial data (matrices,
tables, property editing) and slides away again. Opening a Sheet never changes route and never
unmounts the World.
_Avoid_: Modal, Drawer, Page

## Conformance (established in ADR-0003)

**Conformance**:
The activity of checking whether a Subject satisfies a Norm, and surfacing the gaps. The
umbrella for the three gates (internally: COVER · ENFORCE · ATTEST).
_Avoid_: Comply, Compliance check (as a navigation label)

**Subject**:
*What* is being assessed in a Conformance check — the EA **model** (COVER/ENFORCE) or an
**imported artefact** such as a workflow (ATTEST).

**Norm**:
*What* a Subject is assessed against — an external standard, an internal policy, or the
mandatory fields of a law.

**Conformance Hub**:
The plain-language router (a Sheet) that scopes a Conformance check by asking, in everyday
words, "what do you want to check?" — i.e. which Subject against which Norm. There is exactly
one Hub, reachable from any compliance Phase, pre-scoped to the current Phase but able to cross
over. Division of labour: the **Hub** handles entry/scoping, the **World** shows results (where
the gaps are), a **Matrix** Sheet holds the dense detail behind a finding.
_Avoid_: Compliance landing, Assess page
